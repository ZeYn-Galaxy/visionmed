"""High-Performance Multi-Person YOLO11-Pose Engine using ONNXRuntime.
Trained on official COCO-Keypoints (17 keypoints per person, all humans detected).
No PyTorch/CUDA compiler dependencies required; runs natively at high FPS.
"""
from __future__ import annotations

import os
import sys
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path

# Add nvidia pip packages DLL directories to Windows DLL search path
site_pkgs = Path(sys.prefix) / "Lib" / "site-packages"
for sub in ["nvidia/cudnn/bin", "nvidia/cublas/bin", "nvidia/cuda_nvrtc/bin", "nvidia/cuda_runtime/bin"]:
    p = site_pkgs / sub
    if p.exists():
        try:
            os.add_dll_directory(str(p))
            os.environ["PATH"] = str(p) + os.pathsep + os.environ.get("PATH", "")
        except Exception:
            pass

import cv2
import numpy as np
import onnxruntime as ort

from ..config import CONFIRM_SECONDS, DETECTION_CONF, INFER_IMGSZ, MODELS_DIR
from .symptoms import TrackState, analyse

TRACK_TTL = 5.0
MODEL_PATH = MODELS_DIR / "yolo11n-pose.onnx"
CLASSIFIER_PATH = MODELS_DIR / "symptom_classifier.joblib"


@dataclass
class CameraSession:
    tracks: dict[int, TrackState] = field(default_factory=dict)
    last_infer: float = 0.0
    fps: float = 0.0
    next_track_id: int = 1


def letterbox(img: np.ndarray, new_shape=(640, 640), color=(114, 114, 114)):
    shape = img.shape[:2]  # [h, w]
    r = min(new_shape[0] / shape[0], new_shape[1] / shape[1])
    new_unpad = int(round(shape[1] * r)), int(round(shape[0] * r))
    dw, dh = new_shape[1] - new_unpad[0], new_shape[0] - new_unpad[1]
    dw /= 2
    dh /= 2

    if shape[::-1] != new_unpad:
        img = cv2.resize(img, new_unpad, interpolation=cv2.INTER_LINEAR)
    top, bottom = int(round(dh - 0.1)), int(round(dh + 0.1))
    left, right = int(round(dw - 0.1)), int(round(dw + 0.1))
    img = cv2.copyMakeBorder(img, top, bottom, left, right, cv2.BORDER_CONSTANT, value=color)
    return img, r, (dw, dh)


def nms(boxes, scores, iou_threshold=0.45):
    x1 = boxes[:, 0]
    y1 = boxes[:, 1]
    x2 = boxes[:, 2]
    y2 = boxes[:, 3]
    areas = (x2 - x1) * (y2 - y1)
    order = scores.argsort()[::-1]

    keep = []
    while order.size > 0:
        i = order[0]
        keep.append(i)
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])

        w = np.maximum(0.0, xx2 - xx1)
        h = np.maximum(0.0, yy2 - yy1)
        inter = w * h
        ovr = inter / (areas[i] + areas[order[1:]] - inter)

        inds = np.where(ovr <= iou_threshold)[0]
        order = order[inds + 1]

    return keep


class VisionEngine:
    def __init__(self):
        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        self.session = ort.InferenceSession(str(MODEL_PATH), sess_options=opts, providers=["CPUExecutionProvider"])
        self.active_providers = self.session.get_providers()
        self.input_name = self.session.get_inputs()[0].name
        self.camera_sessions: dict[str, CameraSession] = {}
        self._lock = threading.Lock()

        # Warmup
        dummy = np.zeros((1, 3, 640, 640), dtype=np.float32)
        self.session.run(None, {self.input_name: dummy})
        print(f"[vision] YOLO11-Pose ONNX Engine initialized successfully. Providers: {self.active_providers}")

        # Load learned 5-symptom clinical classifier bundle
        self.symptom_classifier = None
        if CLASSIFIER_PATH.exists():
            try:
                import joblib
                self.symptom_classifier = joblib.load(str(CLASSIFIER_PATH))
                acc = self.symptom_classifier.get("test_acc", self.symptom_classifier.get("val_acc", "N/A"))
                print(f"[vision] Loaded 5-symptom classifier: {CLASSIFIER_PATH.name} (Test Acc: {acc})")
            except Exception as e:
                print(f"[vision] Warning: Could not load symptom classifier: {e}")

    def get_session(self, cam_id: str) -> CameraSession:
        with self._lock:
            if cam_id not in self.camera_sessions:
                self.camera_sessions[cam_id] = CameraSession()
            return self.camera_sessions[cam_id]

    def status(self) -> dict:
        return {
            "pose_model": "yolo11n-pose.onnx",
            "dataset": "COCO-Keypoints (17 keypoints, Multi-Person Detection)",
            "runtime": "ONNXRuntime High-Performance Engine",
            "providers": self.active_providers,
            "symptom_classifier": "symptom_classifier.joblib (Trained on 5 Roboflow Datasets)" if self.symptom_classifier else "Clinical Heuristics",
            "symptom_classes": self.symptom_classifier.get("classes") if self.symptom_classifier else None,
            "symptom_test_acc": self.symptom_classifier.get("test_acc") if self.symptom_classifier else None,
            "active_cameras": list(self.camera_sessions.keys()),
        }

    def process(self, cam_id: str, jpeg: bytes) -> dict:
        frame = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)
        if frame is None:
            return {"error": "Invalid frame"}

        orig_h, orig_w = frame.shape[:2]
        sess = self.get_session(cam_id)
        t0 = time.perf_counter()

        # Preprocess
        input_img, ratio, (pad_w, pad_h) = letterbox(frame, (640, 640))
        input_tensor = input_img[:, :, ::-1].transpose(2, 0, 1).astype(np.float32) / 255.0
        input_tensor = np.expand_dims(input_tensor, axis=0)

        # Inference
        outputs = self.session.run(None, {self.input_name: input_tensor})
        out = outputs[0][0]  # shape (56, 8400)
        out = out.transpose(1, 0)  # shape (8400, 56)

        # Output format: [cx, cy, w, h, person_conf, 17 * (kx, ky, kconf)]
        boxes_xywh = out[:, 0:4]
        scores = out[:, 4]

        # Filter by confidence
        mask = scores > DETECTION_CONF
        boxes_xywh = boxes_xywh[mask]
        scores = scores[mask]
        kps_raw = out[mask, 5:]

        persons = []
        now = time.time()

        if len(scores) > 0:
            # Convert cx,cy,w,h to x1,y1,x2,y2
            boxes_xyxy = np.empty_like(boxes_xywh)
            boxes_xyxy[:, 0] = boxes_xywh[:, 0] - boxes_xywh[:, 2] / 2
            boxes_xyxy[:, 1] = boxes_xywh[:, 1] - boxes_xywh[:, 3] / 2
            boxes_xyxy[:, 2] = boxes_xywh[:, 0] + boxes_xywh[:, 2] / 2
            boxes_xyxy[:, 3] = boxes_xywh[:, 1] + boxes_xywh[:, 3] / 2

            # Apply NMS
            keep = nms(boxes_xyxy, scores, iou_threshold=0.45)
            boxes_xyxy = boxes_xyxy[keep]
            scores = scores[keep]
            kps_raw = kps_raw[keep]

            # Scale back to original frame coordinates
            boxes_xyxy[:, [0, 2]] = (boxes_xyxy[:, [0, 2]] - pad_w) / ratio
            boxes_xyxy[:, [1, 3]] = (boxes_xyxy[:, [1, 3]] - pad_h) / ratio
            np.clip(boxes_xyxy[:, [0, 2]], 0, orig_w, out=boxes_xyxy[:, [0, 2]])
            np.clip(boxes_xyxy[:, [1, 3]], 0, orig_h, out=boxes_xyxy[:, [1, 3]])

            # Reshape keypoints (N, 17, 3)
            kps = kps_raw.reshape(-1, 17, 3)
            kps[:, :, 0] = (kps[:, :, 0] - pad_w) / ratio
            kps[:, :, 1] = (kps[:, :, 1] - pad_h) / ratio
            np.clip(kps[:, :, 0], 0, orig_w, out=kps[:, :, 0])
            np.clip(kps[:, :, 1], 0, orig_h, out=kps[:, :, 1])

            # Multi-person Tracking Association (Centroid Euclidean Nearest-Neighbor)
            assigned_track_ids = []
            for bbox, score, kp in zip(boxes_xyxy, scores, kps):
                cx = (bbox[0] + bbox[2]) / 2
                cy = (bbox[1] + bbox[3]) / 2

                best_tid = None
                best_dist = 120.0  # Max match distance in pixels

                for tid, st in sess.tracks.items():
                    if tid in assigned_track_ids or not st.history:
                        continue
                    last_f = st.history[-1]
                    last_cx = (last_f.bbox[0] + last_f.bbox[2]) / 2
                    last_cy = (last_f.bbox[1] + last_f.bbox[3]) / 2
                    dist = np.hypot(cx - last_cx, cy - last_cy)
                    if dist < best_dist:
                        best_dist = dist
                        best_tid = tid

                if best_tid is None:
                    best_tid = sess.next_track_id
                    sess.next_track_id += 1
                    sess.tracks[best_tid] = TrackState(track_id=best_tid)

                assigned_track_ids.append(best_tid)
                st = sess.tracks[best_tid]
                f = st.push(now, kp, bbox)
                analysis = analyse(st, f, classifier=self.symptom_classifier)
                analysis["confirmed"] = bool(analysis.get("symptom")) and analysis.get("symptom_duration", 0) >= CONFIRM_SECONDS

                persons.append({
                    "track_id": best_tid,
                    "bbox": [round(float(v), 1) for v in bbox],
                    "confidence": round(float(score), 3),
                    "keypoints": [[round(float(x), 1), round(float(y), 1), round(float(c), 2)] for x, y, c in kp],
                    **analysis,
                })

            # Cleanup inactive tracks
            for tid in list(sess.tracks.keys()):
                if now - sess.tracks[tid].last_seen > TRACK_TTL:
                    del sess.tracks[tid]

        infer_ms = (time.perf_counter() - t0) * 1000
        dt = now - sess.last_infer if sess.last_infer else 0
        sess.last_infer = now
        if dt > 0:
            sess.fps = 0.8 * sess.fps + 0.2 * (1.0 / dt) if sess.fps else 1.0 / dt

        return {
            "camera_id": cam_id,
            "width": orig_w,
            "height": orig_h,
            "people_count": len(persons),
            "persons": persons,
            "infer_ms": round(infer_ms, 1),
            "fps": round(sess.fps, 1),
            "model": "YOLO11n-Pose (COCO-Keypoints Dataset Trained)",
            "_frame": frame,
        }


def draw_snapshot(frame: np.ndarray, persons: list[dict], highlight_id: int) -> bytes:
    img = frame.copy()
    for p in persons:
        x1, y1, x2, y2 = map(int, p["bbox"])
        alert = p["track_id"] == highlight_id
        color = (38, 38, 220) if alert else (94, 197, 34)
        cv2.rectangle(img, (x1, y1), (x2, y2), color, 3 if alert else 2)
        label = f"ID {p['track_id']} {p.get('symptom') or p.get('posture')}"
        cv2.putText(img, label, (x1, max(18, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2)
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return buf.tobytes() if ok else b""
