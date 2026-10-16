"""Per-person clinical symptom analysis over time.

Input  : COCO-17 keypoints from YOLO-pose (a model trained on the COCO-Keypoints
         dataset: 200k+ images, 250k+ annotated people) for EVERY person in frame,
         plus a ByteTrack ID so each person keeps their own history.
Output : per person -> posture + the most likely emergency symptom with a score.

Two layers:
 1. Biomechanical rules on body-normalised keypoint trajectories (always on).
 2. Optional learned temporal classifier (GRU) trained on labelled video
    datasets (UR Fall, Le2i, NTU RGB+D 120 medical classes...) via
    `training/train_classifier.py`. When present its probabilities are fused
    with the rules.
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field

import numpy as np

from .features import (
    L_ANK, L_HIP, L_KNE, L_SHO, L_WRI, NOSE, R_ANK, R_HIP, R_KNE, R_SHO, R_WRI,
    L_EYE, R_EYE, L_EAR, R_EAR, body_frame, normalise_pose, torso_angle_deg, visible, resample_sequence,
    extract_clinical_features,
)

HISTORY_SECONDS = 8.0
SYMPTOM_THRESHOLD = 0.50


@dataclass
class Frame:
    t: float
    kps: np.ndarray      # (17,3) pixel coords + conf
    bbox: np.ndarray     # (4,) x1,y1,x2,y2
    sho: np.ndarray
    hip: np.ndarray
    torso: float
    angle: float


@dataclass
class TrackState:
    track_id: int
    history: deque = field(default_factory=lambda: deque(maxlen=400))
    last_descent_t: float = -1e9
    symptom_since: dict = field(default_factory=dict)   # symptom -> first time seen
    upright_head_ratio: float = 0.0                     # baseline nose-to-hip height
    last_seen: float = 0.0

    def push(self, t: float, kps: np.ndarray, bbox: np.ndarray) -> Frame:
        sho, hip, torso = body_frame(kps, bbox)
        f = Frame(t, kps, bbox, sho, hip, torso, torso_angle_deg(sho, hip))
        self.history.append(f)
        while self.history and t - self.history[0].t > HISTORY_SECONDS:
            self.history.popleft()
        self.last_seen = t
        return f

    def window(self, seconds: float) -> list[Frame]:
        if not self.history:
            return []
        t_end = self.history[-1].t
        return [f for f in self.history if t_end - f.t <= seconds]


# ---------------------------------------------------------------------------
# Individual symptom detectors. Each returns a score in [0,1] and a reason.
# ---------------------------------------------------------------------------

def _is_lying(f: Frame) -> bool:
    x1, y1, x2, y2 = f.bbox
    bw = max(x2 - x1, 1.0)
    bh = max(y2 - y1, 1.0)
    aspect = bw / bh

    # Check if legs are extended vertically downwards (standing or bending)
    has_legs = visible(f.kps, L_ANK) or visible(f.kps, R_ANK) or visible(f.kps, L_KNE) or visible(f.kps, R_KNE)
    if has_legs:
        low_pt = max(f.kps[L_ANK, 1], f.kps[R_ANK, 1], f.kps[L_KNE, 1], f.kps[R_KNE, 1])
        # If legs/feet extend well below hips, the person is supported by legs (Standing, Bending, or Sitting)
        if low_pt > f.hip[1] + 0.35 * f.torso:
            return False

    # Hip height relative to bottom of bounding box:
    # When standing or bending, hips are suspended high above the ground (usually 38% - 60% of bbox height).
    # When truly lying down on the ground, hips rest on or near the floor (< 32% of bbox height).
    dist_hip_to_ground = y2 - f.hip[1]
    if dist_hip_to_ground > 0.38 * bh:
        return False

    # Upright head keypoints (head clearly above shoulders) means sitting/standing upright
    head_indices = (NOSE, L_EYE, R_EYE, L_EAR, R_EAR)
    head_y_pts = [f.kps[i, 1] for i in head_indices if f.kps[i, 2] >= 0.35]
    if head_y_pts and min(head_y_pts) < f.sho[1] - 0.10 * f.torso and f.angle < 50:
        return False

    # Upright torso with shoulders well above hips means sitting/standing, NOT lying
    if f.angle < 45 and f.sho[1] < f.hip[1] - 0.15 * f.torso:
        return False

    # Lying requires flat horizontal torso or wide aspect ratio AND hips near floor
    is_flat_torso = f.angle > 60 and abs(f.sho[1] - f.hip[1]) < 0.35 * f.torso
    return (aspect > 1.25 and f.angle > 50) or (is_flat_torso and dist_hip_to_ground <= 0.35 * bh)



def detect_fall(st: TrackState, f: Frame) -> tuple[float, str]:
    win = st.window(1.5)
    if len(win) >= 3:
        # Measure shoulder descent AND hip descent
        sho_drop = (f.sho[1] - min(w.sho[1] for w in win)) / f.torso
        hip_drop = (f.hip[1] - min(w.hip[1] for w in win)) / f.torso
        # In a real collapse, both shoulders and hips drop rapidly towards floor
        if sho_drop > 0.9 and hip_drop > 0.45:
            st.last_descent_t = f.t

    # Must be verified lying on the floor
    if not _is_lying(f):
        return 0.0, ""

    lying = st.window(2.0)
    lying_ratio = np.mean([_is_lying(w) for w in lying]) if lying else 0
    if f.t - st.last_descent_t < 4.0 and lying_ratio > 0.65:
        return 0.92, "rapid collapse to floor with horizontal posture"

    long_lying = st.window(5.0)
    if len(long_lying) > 8 and long_lying[-1].t - long_lying[0].t > 4.0 and np.mean([_is_lying(w) for w in long_lying]) > 0.85:
        return 0.75, "person lying motionless on floor > 4s"

    return 0.0, ""


def _hand_near(f: Frame, target: np.ndarray, radius: float) -> int:
    n = 0
    for w in (L_WRI, R_WRI):
        if f.kps[w, 2] >= 0.35 and np.linalg.norm(f.kps[w, :2] - target) < radius * f.torso:
            n += 1
    return n


def _chest_point(f: Frame) -> np.ndarray:
    return f.sho + 0.35 * (f.hip - f.sho)


def _neck_point(f: Frame) -> np.ndarray:
    return f.sho + 0.12 * (f.sho - f.hip)


def detect_chest_pain(st: TrackState, f: Frame) -> tuple[float, str]:
    if _is_lying(f):
        return 0.0, ""
    win = st.window(2.5)
    if len(win) < 4 or win[-1].t - win[0].t < 1.8:
        return 0.0, ""
    on_chest = np.mean([_hand_near(w, _chest_point(w), 0.45) > 0 for w in win])
    if on_chest < 0.8:
        return 0.0, ""
    hunched = np.mean([18 < w.angle < 65 for w in win]) > 0.5
    both = np.mean([_hand_near(w, _chest_point(w), 0.45) == 2 for w in win]) > 0.5
    score = 0.68 + (0.15 if hunched else 0) + (0.08 if both else 0)
    return min(score, 0.95), "hand(s) clutching sternum" + (" with forward hunch" if hunched else "")


def detect_slump(st: TrackState, f: Frame) -> tuple[float, str]:
    if _is_lying(f) or not visible(f.kps, NOSE):
        return 0.0, ""
    head_h = (f.hip[1] - f.kps[NOSE, 1]) / f.torso
    if f.angle < 20:
        st.upright_head_ratio = max(st.upright_head_ratio * 0.995, head_h)
    win = st.window(3.0)
    if len(win) < 5 or win[-1].t - win[0].t < 2.0:
        return 0.0, ""
    head_below_shoulders = np.mean([
        w.kps[NOSE, 2] >= 0.35 and w.kps[NOSE, 1] > w.sho[1] + 0.1 * w.torso for w in win
    ])
    leaning = np.mean([35 < w.angle < 65 for w in win])
    collapsed = st.upright_head_ratio > 0 and head_h < 0.55 * st.upright_head_ratio
    if head_below_shoulders > 0.75:
        return 0.82, "head hanging below shoulder line"
    if leaning > 0.8 and collapsed:
        return 0.78, "progressive trunk collapse / lean"
    return 0.0, ""


def _oscillation_hz(t: np.ndarray, sig: np.ndarray) -> tuple[float, float]:
    """Returns (dominant frequency estimate via velocity sign changes, amplitude std)."""
    if len(sig) < 8:
        return 0.0, 0.0
    sig = sig - np.convolve(sig, np.ones(5) / 5, mode="same")  # detrend slow body motion
    vel = np.diff(sig)
    signs = np.sign(vel[np.abs(vel) > 1e-4])
    crossings = np.count_nonzero(np.diff(signs))
    dur = t[-1] - t[0]
    return (crossings / 2.0 / dur if dur > 0 else 0.0), float(np.std(sig))


def detect_seizure(st: TrackState, f: Frame) -> tuple[float, str]:
    win = st.window(2.5)
    if len(win) < 12 or win[-1].t - win[0].t < 1.8:
        return 0.0, ""
    t = np.array([w.t for w in win])
    shaking = 0
    for j in (L_WRI, R_WRI, L_ANK, R_ANK, NOSE):
        if np.mean([w.kps[j, 2] >= 0.35 for w in win]) < 0.7:
            continue
        for axis in (0, 1):
            sig = np.array([(w.kps[j, axis] - w.hip[axis]) / w.torso for w in win])
            hz, amp = _oscillation_hz(t, sig)
            if hz >= 2.0 and amp > 0.04:
                shaking += 1
                break
    if shaking >= 3:
        return 0.9, f"rhythmic high-frequency convulsions in {shaking} limbs"
    if shaking >= 2:
        return 0.7, "rhythmic tremor in 2 limbs"
    return 0.0, ""


def detect_respiratory(st: TrackState, f: Frame) -> tuple[float, str]:
    if _is_lying(f):
        return 0.0, ""
    win = st.window(3.0)
    if len(win) < 5 or win[-1].t - win[0].t < 2.0:
        return 0.0, ""
    throat = np.mean([_hand_near(w, _neck_point(w), 0.35) > 0 for w in win])
    if throat > 0.75:
        return 0.85, "universal choking sign (hands at throat)"
    tripod = np.mean([
        w.angle > 28 and (
            (w.kps[L_WRI, 2] > .35 and w.kps[L_KNE, 2] > .35 and np.linalg.norm(w.kps[L_WRI, :2] - w.kps[L_KNE, :2]) < .5 * w.torso) or
            (w.kps[R_WRI, 2] > .35 and w.kps[R_KNE, 2] > .35 and np.linalg.norm(w.kps[R_WRI, :2] - w.kps[R_KNE, :2]) < .5 * w.torso)
        ) for w in win
    ])
    # Rapid shallow breathing -> rhythmic shoulder elevation 0.5-1.5 Hz (30-90 breaths/min)
    long = st.window(6.0)
    breathing_fast = False
    if len(long) >= 20 and long[-1].t - long[0].t > 4:
        t = np.array([w.t for w in long])
        sig = np.array([(w.hip[1] - w.sho[1]) / w.torso for w in long])
        grid = np.linspace(t[0], t[-1], 64)
        s = np.interp(grid, t, sig)
        s = s - s.mean()
        spec = np.abs(np.fft.rfft(s * np.hanning(len(s))))
        freqs = np.fft.rfftfreq(len(s), d=(grid[1] - grid[0]))
        band = (freqs >= 0.5) & (freqs <= 1.5)
        if band.any() and spec[1:].mean() > 0:
            peak = spec[band].max()
            breathing_fast = peak > 3.0 * spec[1:].mean() and np.std(s) > 0.012
    if tripod > 0.7 and breathing_fast:
        return 0.9, "tripod posture + tachypnea (>30 breaths/min)"
    if tripod > 0.8:
        return 0.72, "tripod posture (hands on knees, leaning)"
    if breathing_fast:
        return 0.62, "rhythmic rapid shoulder breathing"
    return 0.0, ""


def detect_stroke(st: TrackState, f: Frame) -> tuple[float, str]:
    if _is_lying(f):
        return 0.0, ""
    win = st.window(4.0)
    if len(win) < 10 or win[-1].t - win[0].t < 3.0:
        return 0.0, ""
    if np.mean([visible(w.kps, L_SHO, R_SHO, L_WRI, R_WRI) for w in win]) < 0.7:
        return 0.0, ""
    tilt = np.mean([abs(w.kps[L_SHO, 1] - w.kps[R_SHO, 1]) / w.torso for w in win])
    head_tilt = 0.0
    if np.mean([visible(w.kps, L_EAR, R_EAR) for w in win]) > 0.6:
        head_tilt = np.mean([abs(w.kps[L_EAR, 1] - w.kps[R_EAR, 1]) / w.torso for w in win])

    def arm_energy(wri, sho):
        pts = np.array([(w.kps[wri, :2] - w.kps[sho, :2]) / w.torso for w in win])
        return float(np.abs(np.diff(pts, axis=0)).sum())

    el, er = arm_energy(L_WRI, L_SHO), arm_energy(R_WRI, R_SHO)
    total, lo, hi = el + er, min(el, er), max(el, er)
    # Arm drift test: one wrist much lower than the other while other arm is raised
    drift = np.mean([
        abs(w.kps[L_WRI, 1] - w.kps[R_WRI, 1]) / w.torso > 0.6 and
        min(w.kps[L_WRI, 1], w.kps[R_WRI, 1]) < w.sho[1] + 0.2 * w.torso for w in win
    ])
    asym = total > 1.2 and hi > 4.0 * max(lo, 1e-3)
    if asym and (tilt > 0.18 or head_tilt > 0.15):
        return 0.8, "unilateral motor weakness + facial/shoulder droop"
    if drift > 0.7 and tilt > 0.12:
        return 0.72, "positive arm-drift asymmetry"
    return 0.0, ""


DETECTORS = {
    "Fall / Syncope": detect_fall,
    "Chest Pain": detect_chest_pain,
    "Pre-Syncope / Slump": detect_slump,
    "Seizures / Convulsions": detect_seizure,
    "Respiratory Distress": detect_respiratory,
    "Stroke Symptoms": detect_stroke,
}


def posture_label(f: Frame) -> str:
    x1, y1, x2, y2 = f.bbox
    bw = max(x2 - x1, 1.0)
    bh = max(y2 - y1, 1.0)
    aspect = bw / bh

    if _is_lying(f):
        return "Lying"

    # Distinguish Bending from Sitting / Standing
    # When bending: spine is tilted forward (angle > 28) while legs support the body
    has_legs = visible(f.kps, L_KNE) or visible(f.kps, R_KNE) or visible(f.kps, L_ANK) or visible(f.kps, R_ANK)
    hip_elevated = (y2 - f.hip[1]) > 0.35 * bh

    if f.angle > 28 and (hip_elevated or has_legs):
        return "Bending"

    if visible(f.kps, L_HIP, L_KNE) and visible(f.kps, R_HIP, R_KNE):
        thigh = np.mean([abs(f.kps[L_KNE, 1] - f.kps[L_HIP, 1]), abs(f.kps[R_KNE, 1] - f.kps[R_HIP, 1])])
        if thigh < 0.45 * f.torso:
            return "Sitting"

    # When sitting on floor or bench with upright torso
    if aspect > 0.9 and f.sho[1] < f.hip[1]:
        return "Sitting"

    return "Standing"


def analyse(st: TrackState, f: Frame, classifier=None) -> dict:
    scores: dict[str, tuple[float, str]] = {name: fn(st, f) for name, fn in DETECTORS.items()}

    if classifier is not None:
        try:
            # 1. Clinical Learned Classifier bundle (trained on the 5 Roboflow datasets)
            if isinstance(classifier, dict) and "model" in classifier and "classes" in classifier:
                feat = extract_clinical_features(f.kps, f.bbox)
                prob_arr = classifier["model"].predict_proba([feat])[0]
                classes = classifier["classes"]
                prob_map = dict(zip(classes, prob_arr))
                p_normal = float(prob_map.get("Normal", 0.0))
                max_symptom_prob = max((float(p) for c, p in prob_map.items() if c != "Normal"), default=0.0)

                # Only accept ML symptom prediction if confident (>= 0.50) and clearly dominates Normal
                if p_normal < 0.35 and max_symptom_prob >= 0.50 and max_symptom_prob > p_normal * 1.5:
                    for cls_name, p in prob_map.items():
                        if cls_name == "Normal" or cls_name not in scores:
                            continue
                        p_val = float(p)
                        if p_val >= 0.50 and p_val > scores[cls_name][0]:
                            scores[cls_name] = (p_val, f"Roboflow AI Clinical Model ({int(p_val * 100)}%)")
            # 2. Sequence classifier fallback
            elif hasattr(classifier, "predict") and len(st.history) >= 4:
                times = np.array([h.t for h in st.history])
                poses = np.stack([normalise_pose(h.kps, h.bbox) for h in st.history])
                seq = resample_sequence(times, poses)
                if seq is not None:
                    probs = classifier.predict(seq)
                    for name, p in probs.items():
                        if name in scores and p > scores[name][0]:
                            scores[name] = (p, "learned temporal classifier")
                        elif name in scores and scores[name][0] > 0:
                            scores[name] = (min(0.99, 0.5 * scores[name][0] + 0.5 * max(p, scores[name][0])), scores[name][1])
        except Exception:
            pass

    # Dynamic posture inference FIRST
    posture = posture_label(f)

    # Hard guardrail: Suppress "Fall / Syncope" if posture is Bending, Standing, or Sitting, or not lying!
    # Menunduk is NOT a fall!
    if posture in ("Bending", "Standing", "Sitting") or not _is_lying(f):
        scores["Fall / Syncope"] = (0.0, "")

    best_name, (best_score, reason) = max(scores.items(), key=lambda kv: kv[1][0])
    symptom = best_name if best_score >= SYMPTOM_THRESHOLD else None

    # Safety check: Never label Fall if not lying
    if symptom == "Fall / Syncope" and (posture != "Lying" or not _is_lying(f)):
        symptom = None
        best_score = 0.0
        reason = ""

    # bookkeeping for persistence-based confirmation
    for name in list(st.symptom_since):
        if name != symptom:
            del st.symptom_since[name]
    if symptom and symptom not in st.symptom_since:
        st.symptom_since[symptom] = f.t

    return {
        "posture": posture,
        "symptom": symptom,
        "symptom_score": round(float(best_score), 3) if symptom else 0.0,
        "reason": reason if symptom else "",
        "symptom_duration": round(f.t - st.symptom_since[symptom], 2) if symptom else 0.0,
        "scores": {k: round(float(v[0]), 2) for k, v in scores.items()},
    }

