from pathlib import Path
import os

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent

DB_FILE = Path(os.getenv("VISIONMED_DB", PROJECT_ROOT / "visionmed_db.json"))
MODELS_DIR = BACKEND_DIR / "models"
MODELS_DIR.mkdir(exist_ok=True)

# Pose model pretrained on the COCO-Keypoints dataset (17 keypoints, detects ALL people in frame).
# Options: yolo11n-pose.pt (fastest) / yolo11s-pose.pt / yolo11m-pose.pt (most accurate)
POSE_MODEL = os.getenv("VISIONMED_POSE_MODEL", "yolo11s-pose.pt")

# Optional learned symptom classifier trained by training/train_classifier.py
SYMPTOM_CLASSIFIER = MODELS_DIR / "symptom_classifier.pt"

DETECTION_CONF = float(os.getenv("VISIONMED_DET_CONF", "0.35"))
INFER_IMGSZ = int(os.getenv("VISIONMED_IMGSZ", "640"))

# A symptom must persist this long (seconds) before an emergency is raised
CONFIRM_SECONDS = float(os.getenv("VISIONMED_CONFIRM_SECONDS", "1.5"))
# Do not raise the same symptom for the same camera more than once per cooldown
ALERT_COOLDOWN_SECONDS = float(os.getenv("VISIONMED_ALERT_COOLDOWN", "30"))

PORT = int(os.getenv("PORT", "5000"))
