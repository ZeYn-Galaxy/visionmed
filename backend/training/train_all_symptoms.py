"""Comprehensive Clinical Multi-Symptom Classifier Training Pipeline.
Trains on 5 Roboflow datasets:
 1. datasets/Fall.v1i.yolov8-obb        -> 'Fall / Syncope'
 2. datasets/faint.v1i.yolov8-obb       -> 'Pre-Syncope / Slump' & 'Fall / Syncope'
 3. datasets/pain.v1i.yolov8-obb        -> 'Chest Pain'
 4. datasets/Seizure.v1i.yolov8-obb     -> 'Seizures / Convulsions' (1) & 'Normal' (0)
 5. datasets/Stroke.v1i.yolov8-obb      -> 'Stroke Symptoms' (2-7) & 'Normal' (0-1)

Extracts biomechanical & pose geometry features from YOLO11-Pose keypoints.
Produces `backend/models/symptom_classifier.joblib` for real-time edge inference.
"""
from __future__ import annotations

import glob
import os
import random
import sys
import time
from datetime import datetime
from pathlib import Path

import cv2
import joblib
import numpy as np
from sklearn.ensemble import ExtraTreesClassifier, HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix, f1_score
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.vision.engine import VisionEngine

# Clinical Classes
CLASSES = [
    "Normal",
    "Fall / Syncope",
    "Chest Pain",
    "Pre-Syncope / Slump",
    "Seizures / Convulsions",
    "Stroke Symptoms",
]

NOSE, L_EYE, R_EYE, L_EAR, R_EAR = 0, 1, 2, 3, 4
L_SHO, R_SHO, L_ELB, R_ELB, L_WRI, R_WRI = 5, 6, 7, 8, 9, 10
L_HIP, R_HIP, L_KNE, R_KNE, L_ANK, R_ANK = 11, 12, 13, 14, 15, 16


def extract_clinical_features(kps: np.ndarray, bbox: list[float], orig_w: int, orig_h: int) -> np.ndarray:
    """Extract scale- and camera-invariant clinical biomechanical feature vector (dim=70).
    
    kps: (17, 3) with x, y, conf
    bbox: [x1, y1, x2, y2]
    """
    x1, y1, x2, y2 = bbox
    bw = max(x2 - x1, 1.0)
    bh = max(y2 - y1, 1.0)
    aspect = bw / bh

    # Center & reference points
    sho = (kps[L_SHO, :2] + kps[R_SHO, :2]) / 2.0
    hip = (kps[L_HIP, :2] + kps[R_HIP, :2]) / 2.0
    torso_len = float(np.linalg.norm(sho - hip))
    torso_len = max(torso_len, max(bw, bh) * 0.25, 5.0)

    center = hip.copy()

    # 1. 17 Keypoints relative to hip center, scaled by torso length (17 * 3 = 51)
    norm_kps = np.empty((17, 3), dtype=np.float32)
    for i in range(17):
        norm_kps[i, 0] = (kps[i, 0] - center[0]) / torso_len
        norm_kps[i, 1] = (kps[i, 1] - center[1]) / torso_len
        norm_kps[i, 2] = kps[i, 2]

    # 2. Torso Angle relative to vertical
    torso_vec = sho - hip
    norm_v = np.linalg.norm(torso_vec)
    if norm_v > 1e-4:
        cos_ang = np.clip(-torso_vec[1] / norm_v, -1.0, 1.0)  # y grows downwards
        torso_angle = float(np.degrees(np.arccos(cos_ang)))
    else:
        torso_angle = 0.0

    # 3. Clinical Sternum / Chest point
    chest = sho + 0.35 * (hip - sho)
    head = (kps[NOSE, :2] + sho) / 2.0

    # Hand distances (critical for Chest Pain and guarding)
    lw_dist_chest = float(np.linalg.norm(kps[L_WRI, :2] - chest)) / torso_len
    rw_dist_chest = float(np.linalg.norm(kps[R_WRI, :2] - chest)) / torso_len
    min_hand_chest = min(lw_dist_chest, rw_dist_chest)

    # Hand to head/face distances
    lw_dist_head = float(np.linalg.norm(kps[L_WRI, :2] - head)) / torso_len
    rw_dist_head = float(np.linalg.norm(kps[R_WRI, :2] - head)) / torso_len

    # Arm asymmetry & bilateral drift (critical for Stroke)
    arm_height_diff = abs(kps[L_WRI, 1] - kps[R_WRI, 1]) / torso_len
    arm_span_diff = abs(np.linalg.norm(kps[L_WRI, :2] - sho) - np.linalg.norm(kps[R_WRI, :2] - sho)) / torso_len

    # Shoulder tilt & head drop (Pre-syncope slump & Stroke droop)
    shoulder_tilt = abs(kps[L_SHO, 1] - kps[R_SHO, 1]) / torso_len
    head_drop = (sho[1] - kps[NOSE, 1]) / torso_len  # < 0 if head is lower than shoulders

    # Facial asymmetry (Stroke facial droop)
    eye_tilt = abs(kps[L_EYE, 1] - kps[R_EYE, 1]) / torso_len
    ear_tilt = abs(kps[L_EAR, 1] - kps[R_EAR, 1]) / torso_len

    # Leg sprawl & knee collapse (Fall & Seizures)
    ankle_sprawl = abs(kps[L_ANK, 0] - kps[R_ANK, 0]) / torso_len
    knee_drop = (max(kps[L_KNE, 1], kps[R_KNE, 1]) - hip[1]) / torso_len

    # Body compactness (convulsions / fetal curl vs upright)
    kps_vis = kps[kps[:, 2] > 0.3, :2]
    if len(kps_vis) >= 4:
        spread_x = (np.max(kps_vis[:, 0]) - np.min(kps_vis[:, 0])) / torso_len
        spread_y = (np.max(kps_vis[:, 1]) - np.min(kps_vis[:, 1])) / torso_len
    else:
        spread_x = bw / torso_len
        spread_y = bh / torso_len

    # Bbox aspect & posture flags
    is_horizontal = 1.0 if (aspect > 1.25 or torso_angle > 55.0) else 0.0

    features = np.hstack([
        norm_kps.flatten(),  # 51
        [
            torso_angle / 90.0,
            aspect,
            is_horizontal,
            lw_dist_chest,
            rw_dist_chest,
            min_hand_chest,
            lw_dist_head,
            rw_dist_head,
            arm_height_diff,
            arm_span_diff,
            shoulder_tilt,
            head_drop,
            eye_tilt,
            ear_tilt,
            ankle_sprawl,
            knee_drop,
            spread_x,
            spread_y,
            bh / max(orig_h, 1),
        ]
    ]).astype(np.float32)

    return features


def collect_dataset_samples(engine: VisionEngine, max_per_class: int = 150) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """Scan all 5 Roboflow dataset directories and extract labeled feature vectors."""
    print("[train] Scanning dataset directories...")

    samples_by_class: dict[str, list[np.ndarray]] = {c: [] for c in CLASSES}
    dataset_base = PROJECT_ROOT / "datasets"

    # Mapping configuration
    tasks = [
        # (folder_name, default_label, has_label_file)
        ("Fall.v1i.yolov8-obb", "Fall / Syncope", False),
        ("faint.v1i.yolov8-obb", "faint_parser", True),
        ("pain.v1i.yolov8-obb", "Chest Pain", False),
        ("Seizure.v1i.yolov8-obb", "seizure_parser", True),
        ("Stroke.v1i.yolov8-obb", "stroke_parser", True),
    ]

    for folder_name, mode, has_labels in tasks:
        folder = dataset_base / folder_name
        if not folder.exists():
            print(f"[train] Warning: {folder} does not exist, skipping.")
            continue

        img_files = list(folder.glob("**/*.jpg")) + list(folder.glob("**/*.png"))
        print(f"[train] Processing {folder_name}: {len(img_files)} images found...")
        random.seed(42)
        random.shuffle(img_files)

        processed = 0
        added = 0

        for img_path in img_files:
            if mode != "seizure_parser" and added >= max_per_class:
                break
            if mode == "seizure_parser" and len(samples_by_class["Seizures / Convulsions"]) >= max_per_class:
                break

            target_class = None
            if mode == "Fall / Syncope":
                target_class = "Fall / Syncope"
            elif mode == "Chest Pain":
                target_class = "Chest Pain"
            elif has_labels:
                # Read label file
                lbl_path = img_path.parent.parent / "labels" / f"{img_path.stem}.txt"
                if not lbl_path.exists():
                    lbl_path = img_path.with_suffix(".txt")

                if lbl_path.exists():
                    try:
                        with open(lbl_path) as f:
                            lines = [line.strip() for line in f if line.strip()]
                        if lines:
                            first_cls = int(lines[0].split()[0])
                            if mode == "faint_parser":
                                target_class = "Fall / Syncope" if first_cls == 1 else "Pre-Syncope / Slump"
                            elif mode == "seizure_parser":
                                target_class = "Normal" if first_cls == 0 else "Seizures / Convulsions"
                            elif mode == "stroke_parser":
                                target_class = "Normal" if first_cls in [0, 1] else "Stroke Symptoms"
                    except Exception:
                        pass

            if not target_class or len(samples_by_class[target_class]) >= max_per_class:
                continue

            processed += 1

            # Run YOLO-Pose ONNX engine
            try:
                with open(img_path, "rb") as f:
                    buf = f.read()
                res = engine.process("train_scan", buf)
                if res.get("people_count", 0) > 0:
                    person = res["persons"][0]
                    kps = np.array(person["keypoints"])
                    feat = extract_clinical_features(kps, person["bbox"], res["width"], res["height"])
                    samples_by_class[target_class].append(feat)
                    added += 1
            except Exception as e:
                continue

        print(f"[train] Added {added} valid pose samples from {folder_name}.")

    # Augment Normal class with real healthy standing and sitting postures
    crowd_path = PROJECT_ROOT / "frontend" / "public" / "samples" / "test_crowd.jpg"
    if crowd_path.exists():
        with open(crowd_path, "rb") as f:
            buf = f.read()
        res = engine.process("train_scan", buf)
        for person in res.get("persons", []):
            kps = np.array(person["keypoints"])
            for _ in range(25):  # Add natural variations
                jitter_kps = kps.copy()
                jitter_kps[:, :2] += np.random.normal(0, 1.2, size=jitter_kps[:, :2].shape)
                feat = extract_clinical_features(jitter_kps, person["bbox"], res["width"], res["height"])
                samples_by_class["Normal"].append(feat)

    # Also extract healthy pre-fall standing persons from Fall dataset
    fall_folder = dataset_base / "Fall.v1i.yolov8-obb"
    if fall_folder.exists():
        for img_path in list(fall_folder.glob("**/*.jpg"))[:120]:
            if len(samples_by_class["Normal"]) >= 140:
                break
            with open(img_path, "rb") as f:
                buf = f.read()
            res = engine.process("train_scan", buf)
            for person in res.get("persons", []):
                bbox = person["bbox"]
                aspect = (bbox[2] - bbox[0]) / max(bbox[3] - bbox[1], 1.0)
                kps = np.array(person["keypoints"])
                sho_y = (kps[5, 1] + kps[6, 1]) / 2.0
                hip_y = (kps[11, 1] + kps[12, 1]) / 2.0
                if aspect < 0.65 and sho_y < hip_y - 25:
                    feat = extract_clinical_features(kps, bbox, res["width"], res["height"])
                    samples_by_class["Normal"].append(feat)

    # Print summary
    print("\n[train] Class balance summary:")
    X_list, y_list = [], []
    for cls_name, feat_list in samples_by_class.items():
        print(f"  - {cls_name}: {len(feat_list)} samples")
        for f in feat_list:
            X_list.append(f)
            y_list.append(cls_name)

    X = np.array(X_list, dtype=np.float32)
    y = np.array(y_list)
    return X, y, CLASSES


def train_symptom_classifier():
    t0 = time.time()
    print("=" * 60)
    print("  VisionMed AI - 5-Symptom Clinical Classifier Training  ")
    print("=" * 60)

    engine = VisionEngine()
    X, y, class_names = collect_dataset_samples(engine, max_per_class=120)

    if len(X) < 50:
        print("[train] Error: Insufficient training samples gathered.")
        return

    print(f"\n[train] Total dataset size: {X.shape[0]} samples, {X.shape[1]} features.")

    # Train / Test Split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y
    )

    print(f"[train] Training set: {len(X_train)} samples, Test set: {len(X_test)} samples.")

    # Ensemble Classifier: Robust RandomForest with calibrated probability tree depths
    clf = RandomForestClassifier(
        n_estimators=160,
        max_depth=14,
        min_samples_split=3,
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )

    clf.fit(X_train, y_train)

    # Cross-validation
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    scores = cross_val_score(clf, X, y, cv=cv, scoring="accuracy")
    print(f"\n[train] 5-Fold Cross Validation Accuracy: {scores.mean() * 100:.2f}% (±{scores.std() * 100:.2f}%)")

    # Test Evaluation
    y_pred = clf.predict(X_test)
    acc = float(np.mean(y_pred == y_test))
    f1 = float(f1_score(y_test, y_pred, average="weighted"))

    print(f"[train] Test Set Accuracy: {acc * 100:.2f}%")
    print(f"[train] Weighted F1-Score: {f1:.4f}\n")
    print("Classification Report:")
    print(classification_report(y_test, y_pred, zero_division=0))

    # Save trained bundle
    output_path = BACKEND_DIR / "models" / "symptom_classifier.joblib"
    output_path.parent.mkdir(exist_ok=True, parents=True)

    bundle = {
        "model": clf,
        "classes": list(clf.classes_),
        "feature_dim": int(X.shape[1]),
        "val_acc": round(float(scores.mean()), 4),
        "test_acc": round(acc, 4),
        "f1_score": round(f1, 4),
        "trained_at": datetime.now().isoformat(),
        "datasets": [
            "Fall.v1i.yolov8-obb",
            "faint.v1i.yolov8-obb",
            "pain.v1i.yolov8-obb",
            "Seizure.v1i.yolov8-obb",
            "Stroke.v1i.yolov8-obb",
        ],
    }

    joblib.dump(bundle, str(output_path))
    print(f"\n[train] Successfully saved trained clinical model to: {output_path}")
    print(f"[train] Pipeline completed in {time.time() - t0:.2f}s.")


if __name__ == "__main__":
    train_symptom_classifier()
