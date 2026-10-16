"""Shared keypoint feature helpers (used by realtime analyzer AND the training pipeline).

Keypoint layout = COCO-17 (what YOLO-pose is trained on):
 0 nose, 1 l_eye, 2 r_eye, 3 l_ear, 4 r_ear, 5 l_shoulder, 6 r_shoulder,
 7 l_elbow, 8 r_elbow, 9 l_wrist, 10 r_wrist, 11 l_hip, 12 r_hip,
 13 l_knee, 14 r_knee, 15 l_ankle, 16 r_ankle
"""
from __future__ import annotations

import numpy as np

NOSE, L_EYE, R_EYE, L_EAR, R_EAR = 0, 1, 2, 3, 4
L_SHO, R_SHO, L_ELB, R_ELB, L_WRI, R_WRI = 5, 6, 7, 8, 9, 10
L_HIP, R_HIP, L_KNE, R_KNE, L_ANK, R_ANK = 11, 12, 13, 14, 15, 16

KP_CONF = 0.35  # minimum keypoint visibility confidence

SEQ_LEN = 30          # frames fed to the learned classifier
SEQ_SECONDS = 3.0     # time window those frames cover (resampled to 10 fps)
FEATURE_DIM = 17 * 3  # x, y, conf per keypoint (body-normalised)

CLASS_NAMES = [
    "Normal",
    "Fall / Syncope",
    "Chest Pain",
    "Pre-Syncope / Slump",
    "Seizures / Convulsions",
    "Respiratory Distress",
    "Stroke Symptoms",
]


def visible(kps: np.ndarray, *idx: int) -> bool:
    return all(kps[i, 2] >= KP_CONF for i in idx)


def midpoint(kps: np.ndarray, a: int, b: int) -> np.ndarray | None:
    va, vb = kps[a, 2] >= KP_CONF, kps[b, 2] >= KP_CONF
    if va and vb:
        return (kps[a, :2] + kps[b, :2]) / 2.0
    if va:
        return kps[a, :2].copy()
    if vb:
        return kps[b, :2].copy()
    return None


def body_frame(kps: np.ndarray, bbox: np.ndarray) -> tuple[np.ndarray, np.ndarray, float]:
    """Returns (shoulder_mid, hip_mid, torso_len). Falls back to bbox geometry when occluded."""
    x1, y1, x2, y2 = bbox
    sho = midpoint(kps, L_SHO, R_SHO)
    hip = midpoint(kps, L_HIP, R_HIP)
    if sho is None:
        sho = np.array([(x1 + x2) / 2, y1 + (y2 - y1) * 0.25])
    if hip is None:
        hip_y = max(sho[1] + (y2 - sho[1]) * 0.65, y1 + (y2 - y1) * 0.75)
        hip = np.array([(x1 + x2) / 2, hip_y])
    torso = float(np.linalg.norm(sho - hip))
    torso = max(torso, max(x2 - x1, y2 - y1) / 4.0, 1.0)
    return sho, hip, torso


def torso_angle_deg(sho: np.ndarray, hip: np.ndarray) -> float:
    """Angle of hip->shoulder vector from vertical-up. 0 = upright, 90 = horizontal."""
    v = sho - hip
    norm = np.linalg.norm(v)
    if norm < 1e-6:
        return 0.0
    cos = np.clip(-v[1] / norm, -1.0, 1.0)  # image y grows downward
    return float(np.degrees(np.arccos(cos)))


def normalise_pose(kps: np.ndarray, bbox: np.ndarray) -> np.ndarray:
    """Translate to hip-centre and scale by torso length -> camera/distance invariant (17,3)."""
    sho, hip, torso = body_frame(kps, bbox)
    out = kps.copy().astype(np.float32)
    out[:, 0] = (kps[:, 0] - hip[0]) / torso
    out[:, 1] = (kps[:, 1] - hip[1]) / torso
    out[kps[:, 2] < KP_CONF, :2] = 0.0
    return out


def resample_sequence(times: np.ndarray, poses: np.ndarray, seconds: float = SEQ_SECONDS,
                      n: int = SEQ_LEN) -> np.ndarray | None:
    """Linearly resample a variable-FPS pose history to a fixed (n, 17*3) tensor."""
    if len(times) < 4 or times[-1] - times[0] < seconds * 0.6:
        return None
    t_end = times[-1]
    grid = np.linspace(t_end - seconds, t_end, n)
    flat = poses.reshape(len(poses), -1)
    out = np.empty((n, flat.shape[1]), dtype=np.float32)
    for d in range(flat.shape[1]):
        out[:, d] = np.interp(grid, times, flat[:, d])
    return out


def extract_clinical_features(kps: np.ndarray, bbox: list[float] | np.ndarray, orig_w: int = 640, orig_h: int = 480) -> np.ndarray:
    """Extract scale- and camera-invariant clinical biomechanical feature vector (dim=70).
    
    kps: (17, 3) with x, y, conf
    bbox: [x1, y1, x2, y2]
    """
    kps = np.asarray(kps, dtype=np.float32)
    x1, y1, x2, y2 = bbox
    bw = max(x2 - x1, 1.0)
    bh = max(y2 - y1, 1.0)
    aspect = bw / bh

    sho = (kps[L_SHO, :2] + kps[R_SHO, :2]) / 2.0
    if kps[L_HIP, 2] >= 0.25 or kps[R_HIP, 2] >= 0.25:
        hip = (kps[L_HIP, :2] + kps[R_HIP, :2]) / 2.0
    else:
        hip_y = max(sho[1] + (y2 - sho[1]) * 0.65, y1 + (y2 - y1) * 0.75)
        hip = np.array([(x1 + x2) / 2, hip_y])
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
        cos_ang = np.clip(-torso_vec[1] / norm_v, -1.0, 1.0)
        torso_angle = float(np.degrees(np.arccos(cos_ang)))
    else:
        torso_angle = 0.0

    # 3. Clinical points & distances
    chest = sho + 0.35 * (hip - sho)
    head = (kps[NOSE, :2] + sho) / 2.0

    lw_dist_chest = float(np.linalg.norm(kps[L_WRI, :2] - chest)) / torso_len
    rw_dist_chest = float(np.linalg.norm(kps[R_WRI, :2] - chest)) / torso_len
    min_hand_chest = min(lw_dist_chest, rw_dist_chest)

    lw_dist_head = float(np.linalg.norm(kps[L_WRI, :2] - head)) / torso_len
    rw_dist_head = float(np.linalg.norm(kps[R_WRI, :2] - head)) / torso_len

    arm_height_diff = abs(kps[L_WRI, 1] - kps[R_WRI, 1]) / torso_len
    arm_span_diff = abs(np.linalg.norm(kps[L_WRI, :2] - sho) - np.linalg.norm(kps[R_WRI, :2] - sho)) / torso_len

    shoulder_tilt = abs(kps[L_SHO, 1] - kps[R_SHO, 1]) / torso_len
    head_drop = (sho[1] - kps[NOSE, 1]) / torso_len

    eye_tilt = abs(kps[L_EYE, 1] - kps[R_EYE, 1]) / torso_len
    ear_tilt = abs(kps[L_EAR, 1] - kps[R_EAR, 1]) / torso_len

    ankle_sprawl = abs(kps[L_ANK, 0] - kps[R_ANK, 0]) / torso_len
    knee_drop = (max(kps[L_KNE, 1], kps[R_KNE, 1]) - hip[1]) / torso_len

    kps_vis = kps[kps[:, 2] > 0.3, :2]
    if len(kps_vis) >= 4:
        spread_x = (np.max(kps_vis[:, 0]) - np.min(kps_vis[:, 0])) / torso_len
        spread_y = (np.max(kps_vis[:, 1]) - np.min(kps_vis[:, 1])) / torso_len
    else:
        spread_x = bw / torso_len
        spread_y = bh / torso_len

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

