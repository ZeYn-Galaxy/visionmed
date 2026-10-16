"""Thread-safe JSON file database (drop-in replacement for the former lowdb store).

The same `visionmed_db.json` file at the project root is reused, so existing
accounts, cameras and incident history carry over from the Node backend.
"""
from __future__ import annotations

import json
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import bcrypt

from .config import DB_FILE

_lock = threading.RLock()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


ALL_SYMPTOMS = [
    "Fall / Syncope",
    "Chest Pain",
    "Pre-Syncope / Slump",
    "Seizures / Convulsions",
    "Respiratory Distress",
    "Stroke Symptoms",
]


def _default_camera(cam_id: str, num: str, name: str, location: str) -> dict[str, Any]:
    return {
        "id": cam_id,
        "numericId": num,
        "name": name,
        "location": location,
        "badgeText": "• Normal",
        "badgeType": "green",
        "statusText": "Status: Normal",
        "hasAlert": False,
        "alertType": None,
        "bboxLabel": None,
        "actionType": "view",
        "actionLabel": "View",
        "cameraTimestamp": "",
        "peopleCount": 0,
        "feedSource": "webcam",
        "streamUrl": None,
        "isActive": True,
        "enabledDetections": list(ALL_SYMPTOMS),
    }


def _seed() -> dict[str, Any]:
    pw = bcrypt.hashpw(b"hospital123", bcrypt.gensalt(10)).decode()
    users = [
        ("usr-1", "reed.security@visionmed.hospital", "Reed", "security", "👮", "Senior Surveillance Officer"),
        ("usr-2", "sarah.reception@visionmed.hospital", "Sarah Jenkins", "receptionist", "👩‍⚕️", "Emergency Triage Receptionist"),
        ("usr-3", "admin@visionmed.hospital", "Dr. Aris Thorne", "admin", "👨‍💼", "Clinical Operations Director"),
    ]
    return {
        "users": [
            {
                "id": uid, "email": email, "password": pw, "name": name, "role": role,
                "avatar": avatar, "title": title, "active_session_token": None, "last_active_at": None,
            }
            for uid, email, name, role, avatar, title in users
        ],
        "cameras": [
            _default_camera("CAM 01", "1", "Queue Line A", "Waiting Hall"),
            _default_camera("CAM 02", "2", "Kiosk Area", "Self-Service Kiosk"),
            _default_camera("CAM 03", "3", "Divider Line", "Registration Stanchions"),
            _default_camera("CAM 04", "4", "Main Intake", "Central Lobby"),
        ],
        "emergencies": [],
        "dispatches": [],
    }


class JsonDB:
    def __init__(self, path: Path):
        self.path = path
        self.data: dict[str, Any] = {}
        self.load()

    def load(self) -> None:
        with _lock:
            if self.path.exists():
                self.data = json.loads(self.path.read_text(encoding="utf-8"))
            else:
                self.data = _seed()
                self.save()
            for key in ("users", "cameras", "emergencies", "dispatches"):
                self.data.setdefault(key, [])
            if not self.data["users"]:
                self.data["users"] = _seed()["users"]
                self.save()

    def save(self) -> None:
        with _lock:
            payload = json.dumps(self.data, indent=2, ensure_ascii=False)
            tmp = self.path.with_suffix(".tmp")
            for _ in range(5):
                try:
                    tmp.write_text(payload, encoding="utf-8")
                    tmp.replace(self.path)
                    return
                except (PermissionError, OSError):
                    time.sleep(0.05)
            try:
                self.path.write_text(payload, encoding="utf-8")
            except Exception:
                pass

    # ---- helpers -------------------------------------------------------
    def find_user_by_email(self, email: str) -> dict | None:
        email = email.lower()
        return next((u for u in self.data["users"] if u["email"].lower() == email), None)

    def find_user_by_token(self, token: str) -> dict | None:
        return next((u for u in self.data["users"] if token and u.get("active_session_token") == token), None)

    def find_user(self, user_id: str) -> dict | None:
        return next((u for u in self.data["users"] if u["id"] == user_id), None)

    def find_camera(self, cam_id: str) -> dict | None:
        if not cam_id:
            return None
        target = str(cam_id).strip().lower()
        return next(
            (c for c in self.data["cameras"]
             if c["id"].strip().lower() == target
             or str(c.get("numericId", "")).strip().lower() == target
             or c["id"].replace(" ", "").lower() == target.replace(" ", "")),
            None
        )


db = JsonDB(DB_FILE)
now_iso = _now_iso
lock = _lock
