"""FastAPI + python-socketio Server for VisionMed Backend.
Compatible with existing Next.js frontend Socket.IO client and REST endpoints.
Includes Computer Vision WebSocket endpoint for real-time frame streaming and multi-person tracking.
"""
from __future__ import annotations

import asyncio
import base64
import secrets
import time
from datetime import datetime, timezone
from typing import Any, Optional

import bcrypt
import socketio
from fastapi import FastAPI, Header, HTTPException, Request, Response, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import PORT
from .db import db, now_iso
from .vision.engine import VisionEngine, draw_snapshot

# 1. Initialize Socket.IO AsyncServer with CORS
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    ping_timeout=60,
    ping_interval=25,
)

# 2. FastAPI app
fastapi_app = FastAPI(title="VisionMed Python Backend", version="2.0.0")

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Mount ASGI App for combined Socket.IO + FastAPI
app = socketio.ASGIApp(sio, other_asgi_app=fastapi_app)

# Single session tracker: user_id -> set of socket_ids
active_sockets: dict[str, set[str]] = {}

# Vision Engine singleton (lazy-loaded on startup or first request)
_engine: Optional[VisionEngine] = None


def get_engine() -> VisionEngine:
    global _engine
    if _engine is None:
        print("[vision] Initializing VisionEngine with YOLO Pose...")
        _engine = VisionEngine()
    return _engine


# -------------------------------------------------------------
# AUTHENTICATION & SINGLE-SESSION ENFORCEMENT
# -------------------------------------------------------------
def require_auth(authorization: Optional[str] = Header(None)) -> dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Sesi tidak valid atau belum login")
    token = authorization.split(" ")[1]
    user = db.find_user_by_token(token)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Sesi berakhir atau akun telah login di tempat lain (Single Session Limit)."
        )
    return user


class LoginRequest(BaseModel):
    email: str
    password: str


@fastapi_app.post("/api/auth/login")
async def api_login(req: LoginRequest):
    if not req.email or not req.password:
        raise HTTPException(status_code=400, detail="Email dan password wajib diisi")

    db.load()
    user = db.find_user_by_email(req.email)
    if not user:
        raise HTTPException(status_code=401, detail="Email atau password salah")

    # Verify password with bcrypt
    try:
        is_match = bcrypt.checkpw(req.password.encode("utf-8"), user["password"].encode("utf-8"))
    except Exception:
        is_match = False

    if not is_match:
        raise HTTPException(status_code=401, detail="Email atau password salah")

    new_token = secrets.token_hex(32)

    # 1 Web 1 Akun: Evict existing sockets for this user
    user_id = user["id"]
    if user_id in active_sockets:
        for sid in list(active_sockets[user_id]):
            await sio.emit(
                "session_terminated",
                {"reason": "Akun Anda baru saja login di sesi browser lain. Sesi lama otomatis ditutup."},
                to=sid
            )

    user["active_session_token"] = new_token
    user["last_active_at"] = now_iso()
    db.save()

    return {
        "message": "Login berhasil",
        "token": new_token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],  # Locked role
            "avatar": user.get("avatar"),
            "title": user.get("title")
        }
    }


@fastapi_app.get("/api/auth/me")
async def api_me(authorization: Optional[str] = Header(None)):
    user = require_auth(authorization)
    return {
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
            "avatar": user.get("avatar"),
            "title": user.get("title")
        }
    }


@fastapi_app.post("/api/auth/logout")
async def api_logout(authorization: Optional[str] = Header(None)):
    user = require_auth(authorization)
    user["active_session_token"] = None
    db.save()
    return {"success": True}


# -------------------------------------------------------------
# CAMERAS CRUD
# -------------------------------------------------------------
@fastapi_app.get("/api/cameras")
async def get_cameras():
    db.load()
    return db.data.get("cameras", [])


class AddCameraRequest(BaseModel):
    id: Optional[str] = None
    name: str
    location: Optional[str] = "Clinical Zone"
    feedSource: Optional[str] = "webcam"
    streamUrl: Optional[str] = None
    enabledDetections: Optional[list[str]] = None


@fastapi_app.post("/api/cameras", status_code=201)
async def add_camera(req: AddCameraRequest, authorization: Optional[str] = Header(None)):
    require_auth(authorization)
    db.load()
    next_num = len(db.data["cameras"]) + 1
    cam_id = req.id or f"CAM {next_num:02d}"
    numeric_id = str(next_num)

    new_camera = {
        "id": cam_id,
        "numericId": numeric_id,
        "name": req.name,
        "location": req.location,
        "badgeText": "• Normal",
        "badgeType": "green",
        "statusText": "Status: Normal",
        "hasAlert": False,
        "alertType": None,
        "bboxLabel": None,
        "actionType": "view",
        "actionLabel": "View",
        "cameraTimestamp": datetime.now().strftime("%H:%M:%S"),
        "peopleCount": 0,
        "feedSource": req.feedSource or "webcam",
        "streamUrl": req.streamUrl,
        "isActive": True,
        "enabledDetections": req.enabledDetections or ["Fall / Syncope", "Chest Pain", "Pre-Syncope / Slump"]
    }

    db.data["cameras"].append(new_camera)
    db.save()

    await sio.emit("camera_added", new_camera)
    return new_camera


@fastapi_app.delete("/api/cameras/{cam_id}")
async def delete_camera(cam_id: str, authorization: Optional[str] = Header(None)):
    require_auth(authorization)
    db.load()
    db.data["cameras"] = [c for c in db.data["cameras"] if c["id"] != cam_id]
    db.save()

    await sio.emit("camera_deleted", {"id": cam_id})
    return {"success": True, "id": cam_id}


@fastapi_app.patch("/api/cameras/{cam_id}/toggle")
async def toggle_camera(cam_id: str, authorization: Optional[str] = Header(None)):
    require_auth(authorization)
    db.load()
    cam = db.find_camera(cam_id)
    if not cam:
        raise HTTPException(status_code=404, detail="Kamera tidak ditemukan")

    cam["isActive"] = not cam.get("isActive", True)
    db.save()

    await sio.emit("camera_toggled", {"id": cam_id, "isActive": cam["isActive"]})
    return {"success": True, "id": cam_id, "isActive": cam["isActive"]}


# -------------------------------------------------------------
# EMERGENCIES & ALERTS
# -------------------------------------------------------------
@fastapi_app.get("/api/emergencies")
async def get_emergencies():
    db.load()
    return db.data.get("emergencies", [])


class EmergencyReport(BaseModel):
    camera_id: str
    detected_symptom: str
    status_label: Optional[str] = "Status: Critical"
    cv_method: Optional[str] = "YOLO-Pose Edge Model (Dataset-Trained)"
    confidence_score: Optional[float] = 95.0
    bbox_label: Optional[str] = None
    thumbnail_type: Optional[str] = "collapse"


@fastapi_app.post("/api/emergency", status_code=201)
async def report_emergency(req: EmergencyReport):
    db.load()
    cam = db.find_camera(req.camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail="Kamera tidak ditemukan")

    emergency_id = f"inc-{int(datetime.now().timestamp() * 1000)}"
    now = datetime.now()
    timestamp = now.strftime("%m-%d-%Y %H:%M:%S")

    # Update Camera Status to Alert
    cam["hasAlert"] = True
    cam["alertType"] = req.detected_symptom
    cam["bboxLabel"] = req.bbox_label or req.detected_symptom
    cam["badgeText"] = f"• {req.detected_symptom}"
    cam["badgeType"] = "red"
    cam["statusText"] = req.status_label or "Status: Critical"
    cam["actionType"] = "dispatch"
    cam["actionLabel"] = "Dispatch"

    new_emergency = {
        "id": emergency_id,
        "camera_id": req.camera_id,
        "camera_name": cam.get("name", req.camera_id),
        "detected_symptom": f"• {req.detected_symptom}",
        "status_label": req.status_label,
        "cv_method": req.cv_method,
        "confidence_score": req.confidence_score,
        "duration": "00:01",
        "timestamp": timestamp,
        "alert_status": "CRITICAL",
        "bbox_label": req.bbox_label or req.detected_symptom,
        "notes": "Terdeteksi via Python YOLO-Pose AI Computer Vision Engine.",
        "thumbnail_type": req.thumbnail_type,
        "created_at": now_iso()
    }

    db.data["emergencies"].insert(0, new_emergency)
    db.save()

    # Broadcast via Socket.IO
    await sio.emit("emergency_detected", {
        "emergency": new_emergency,
        "camera_id": req.camera_id,
        "detected_symptom": req.detected_symptom,
        "timestamp": timestamp
    })

    return {"success": True, "emergency": new_emergency}


@fastapi_app.post("/api/emergency/{inc_id}/resolve")
async def resolve_emergency(inc_id: str, authorization: Optional[str] = Header(None)):
    require_auth(authorization)
    db.load()
    emergency = next((e for e in db.data["emergencies"] if e["id"] == inc_id), None)
    if not emergency:
        raise HTTPException(status_code=404, detail="Insiden tidak ditemukan")

    emergency["alert_status"] = "RESOLVED"
    cam_id = emergency["camera_id"]

    # Check if remaining critical alerts exist for this camera
    active_rem = [e for e in db.data["emergencies"] if e["camera_id"] == cam_id and e.get("alert_status") == "CRITICAL"]
    if not active_rem:
        cam = db.find_camera(cam_id)
        if cam:
            cam["hasAlert"] = False
            cam["alertType"] = None
            cam["bboxLabel"] = None
            cam["badgeText"] = "• Normal"
            cam["badgeType"] = "green"
            cam["statusText"] = "Status: Normal"
            cam["actionType"] = "view"
            cam["actionLabel"] = "View"

    db.save()
    await sio.emit("emergency_resolved", {"id": inc_id, "camera_id": cam_id})
    return {"success": True}


class DispatchRequest(BaseModel):
    camera_id: str
    responder: str
    emergency_id: Optional[str] = None
    notes: Optional[str] = None


@fastapi_app.post("/api/dispatch")
async def dispatch_unit(req: DispatchRequest, authorization: Optional[str] = Header(None)):
    require_auth(authorization)
    db.load()
    dispatch_id = f"disp-{int(datetime.now().timestamp() * 1000)}"

    db.data["dispatches"].append({
        "id": dispatch_id,
        "emergency_id": req.emergency_id,
        "camera_id": req.camera_id,
        "responder": req.responder,
        "notes": req.notes,
        "dispatched_at": now_iso()
    })

    cam = db.find_camera(req.camera_id)
    if cam:
        cam["statusText"] = f"Dispatched ({req.responder})"
        cam["actionLabel"] = "Dispatched"

    db.save()
    await sio.emit("dispatch_updated", {
        "camera_id": req.camera_id,
        "responder": req.responder,
        "notes": req.notes
    })
    return {"success": True, "id": dispatch_id}


# -------------------------------------------------------------
# COMPUTER VISION / STATUS ENDPOINT
# -------------------------------------------------------------
@fastapi_app.get("/api/vision/status")
async def vision_status():
    try:
        eng = get_engine()
        return eng.status()
    except Exception as e:
        return {"status": "loading", "error": str(e)}


class ImageBase64Payload(BaseModel):
    image: str
    camera_id: Optional[str] = "TEST_UPLOAD"


def _draw_annotations(frame, persons):
    import cv2
    ann_img = frame.copy()
    
    # Official Ultralytics YOLO-Pose Limb Color Palette (BGR)
    SKELETON_LIMBS = [
        ((0, 1), (180, 105, 255)),  # nose - l_eye: Pink
        ((0, 2), (238, 130, 238)),  # nose - r_eye: Violet
        ((1, 3), (180, 105, 255)),  # l_eye - l_ear: Pink
        ((2, 4), (238, 130, 238)),  # r_eye - r_ear: Violet
        ((5, 6), (94, 218, 50)),    # l_sho - r_sho: Green
        ((5, 7), (0, 140, 255)),    # l_sho - l_elb: Orange
        ((7, 9), (0, 215, 255)),    # l_elb - l_wri: Amber/Gold
        ((6, 8), (255, 144, 30)),   # r_sho - r_elb: Cyan
        ((8, 10), (255, 191, 0)),   # r_elb - r_wri: Sky Blue
        ((5, 11), (94, 218, 50)),   # l_sho - l_hip: Green
        ((6, 12), (94, 218, 50)),   # r_sho - r_hip: Green
        ((11, 12), (94, 218, 50)),  # l_hip - r_hip: Green
        ((11, 13), (0, 140, 255)),  # l_hip - l_kne: Orange
        ((13, 15), (0, 215, 255)),  # l_kne - l_ank: Amber/Gold
        ((12, 14), (255, 144, 30)), # r_hip - r_kne: Cyan
        ((14, 16), (255, 191, 0)),  # r_kne - r_ank: Sky Blue
    ]

    KPT_COLORS = [
        (180, 105, 255), (180, 105, 255), (238, 130, 238), (180, 105, 255), (238, 130, 238), # 0-4
        (94, 218, 50), (94, 218, 50),  # 5, 6
        (0, 140, 255), (255, 144, 30), # 7, 8
        (0, 215, 255), (255, 191, 0),  # 9, 10
        (94, 218, 50), (94, 218, 50),  # 11, 12
        (0, 140, 255), (255, 144, 30), # 13, 14
        (0, 215, 255), (255, 191, 0),  # 15, 16
    ]

    for p in persons:
        x1, y1, x2, y2 = map(int, p["bbox"])
        is_alert = bool(p.get("symptom"))
        box_color = (38, 38, 220) if is_alert else (50, 205, 50)  # BGR

        # Draw bbox
        cv2.rectangle(ann_img, (x1, y1), (x2, y2), box_color, 2)

        # Label pill
        posture = p.get('symptom') or p.get('posture') or 'PERSON'
        label = f"#{p['track_id']} {posture} ({int(p['confidence']*100)}%)"
        label_size, _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.42, 1)
        tw, th = label_size
        cv2.rectangle(ann_img, (x1, max(0, y1 - th - 8)), (x1 + tw + 8, y1), box_color, -1)
        cv2.putText(ann_img, label, (x1 + 4, max(12, y1 - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1, cv2.LINE_AA)

        # Draw keypoints and skeleton with YOLO palette
        kps = p.get("keypoints", [])
        if kps and len(kps) == 17:
            for (k1, k2), l_col in SKELETON_LIMBS:
                x_a, y_a, c_a = kps[k1]
                x_b, y_b, c_b = kps[k2]
                if c_a > 0.35 and c_b > 0.35:
                    line_col = (0, 0, 255) if is_alert else l_col
                    cv2.line(ann_img, (int(x_a), int(y_a)), (int(x_b), int(y_b)), line_col, 2, cv2.LINE_AA)
            for idx, (x_k, y_k, c_k) in enumerate(kps):
                if c_k > 0.35:
                    pt_col = (0, 0, 255) if is_alert else KPT_COLORS[idx]
                    cv2.circle(ann_img, (int(x_k), int(y_k)), 4, pt_col, -1, cv2.LINE_AA)
                    cv2.circle(ann_img, (int(x_k), int(y_k)), 1, (255, 255, 255), -1, cv2.LINE_AA)

    ok, buf = cv2.imencode(".jpg", ann_img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return f"data:image/jpeg;base64,{base64.b64encode(buf.tobytes()).decode('utf-8')}" if ok else None


@fastapi_app.post("/api/cv/test-upload")
async def cv_test_upload(file: UploadFile = File(...)):
    """Analyze an uploaded photo file using YOLO11-Pose."""
    raw_bytes = await file.read()
    eng = get_engine()
    result = eng.process("TEST_FILE_UPLOAD", raw_bytes)
    frame = result.pop("_frame", None)
    annotated = _draw_annotations(frame, result.get("persons", [])) if frame is not None else None

    return {
        "success": True,
        "filename": file.filename,
        "people_count": result.get("people_count", 0),
        "infer_ms": result.get("infer_ms", 0),
        "fps": result.get("fps", 0),
        "model": result.get("model", "YOLO11n-Pose"),
        "persons": result.get("persons", []),
        "annotated_image": annotated
    }


@fastapi_app.post("/api/cv/test-base64")
async def cv_test_base64(payload: ImageBase64Payload):
    """Analyze a base64 image (photo or video snapshot) directly."""
    img_str = payload.image
    if img_str.startswith("data:"):
        img_str = img_str.split(",")[1]
    raw_bytes = base64.b64decode(img_str)
    eng = get_engine()
    result = eng.process(payload.camera_id or "TEST_BASE64", raw_bytes)
    frame = result.pop("_frame", None)
    annotated = _draw_annotations(frame, result.get("persons", [])) if frame is not None else None

    return {
        "success": True,
        "people_count": result.get("people_count", 0),
        "infer_ms": result.get("infer_ms", 0),
        "fps": result.get("fps", 0),
        "model": result.get("model", "YOLO11n-Pose"),
        "persons": result.get("persons", []),
        "annotated_image": annotated
    }


# -------------------------------------------------------------
# SOCKET.IO HANDLERS
# -------------------------------------------------------------
@sio.event
async def connect(sid, environ, auth=None):
    # Extract query params
    query_str = environ.get("QUERY_STRING", "")
    params = dict(q.split("=") for q in query_str.split("&") if "=" in q)
    user_id = params.get("userId")
    token = params.get("token")

    if user_id and token and user_id != "guest":
        user = db.find_user(user_id)
        if not user or user.get("active_session_token") != token:
            await sio.emit("session_terminated", {"reason": "Akun Anda telah login di browser atau perangkat lain."}, to=sid)
            await sio.disconnect(sid)
            return

        if user_id not in active_sockets:
            active_sockets[user_id] = set()
        active_sockets[user_id].add(sid)


@sio.event
async def disconnect(sid):
    for uid, sids in list(active_sockets.items()):
        if sid in sids:
            sids.remove(sid)
            if not sids:
                del active_sockets[uid]
            break


# Real-time Computer Vision Frame Stream (Non-blocking & Zero-Lag Buffer Policy)
active_cam_tasks: set[str] = set()
latest_cam_frames: dict[str, tuple[str, dict]] = {}
last_cam_alerts: dict[str, float] = {}


async def _cam_inference_worker(cam_id: str):
    """Background worker per camera that always picks the freshest frame and drops stale backlog."""
    try:
        while True:
            frame_item = latest_cam_frames.pop(cam_id, None)
            if not frame_item:
                break

            sid, data = frame_item
            try:
                img_data = data.get("image", "")
                if img_data.startswith("data:image"):
                    img_data = img_data.split(",")[1]

                raw_bytes = base64.b64decode(img_data)
                eng = get_engine()
                # Run CPU/GPU inference in thread pool without blocking the async event loop
                result = await asyncio.to_thread(eng.process, cam_id, raw_bytes)

                # Update peopleCount for camera in DB and notify
                p_count = result.get("people_count", 0)
                cam = db.find_camera(cam_id)
                if cam and cam.get("peopleCount") != p_count:
                    cam["peopleCount"] = p_count

                # Check for confirmed emergency
                now_sec = time.time()
                for person in result.get("persons", []):
                    sym = person.get("symptom")
                    if sym and (person.get("confirmed") or person.get("symptom_duration", 0) >= 0.8 or person.get("confidence", 0) >= 0.7):
                        last_alert_t = last_cam_alerts.get(cam_id, 0.0)
                        if now_sec - last_alert_t > 5.0:
                            last_cam_alerts[cam_id] = now_sec
                            await report_emergency(EmergencyReport(
                                camera_id=cam_id,
                                detected_symptom=sym,
                                status_label=f"Status: {sym} (#{person.get('track_id')})",
                                confidence_score=person.get("confidence", 0.95) * 100,
                                bbox_label=f"{sym} #{person.get('track_id')}"
                            ))


                # Remove internal frame reference before returning
                result.pop("_frame", None)
                await sio.emit("cv_results", result, to=sid)

            except Exception as exc:
                await sio.emit("cv_error", {"error": str(exc)}, to=sid)
    finally:
        active_cam_tasks.discard(cam_id)


@sio.event
async def cv_frame(sid, data):
    """Client streams a webcam/CCTV frame as base64 JPEG or binary.
    Always maintains only the LATEST frame per camera to eliminate any backlog lag.
    """
    cam_id = data.get("camera_id", "CAM 01")
    latest_cam_frames[cam_id] = (sid, data)

    if cam_id not in active_cam_tasks:
        active_cam_tasks.add(cam_id)
        asyncio.create_task(_cam_inference_worker(cam_id))

