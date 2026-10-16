"""Learned temporal symptom classifier (GRU over body-normalised keypoint sequences).

Trained by `training/train_classifier.py` on labelled video datasets. Optional:
if `models/symptom_classifier.pt` does not exist the system runs on rules only.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import torch
from torch import nn

from .features import CLASS_NAMES, FEATURE_DIM, SEQ_LEN


class SymptomGRU(nn.Module):
    def __init__(self, in_dim: int = FEATURE_DIM, hidden: int = 128, n_classes: int = len(CLASS_NAMES)):
        super().__init__()
        self.proj = nn.Sequential(nn.Linear(in_dim, hidden), nn.ReLU(), nn.Dropout(0.2))
        self.gru = nn.GRU(hidden, hidden, num_layers=2, batch_first=True, dropout=0.2, bidirectional=True)
        self.head = nn.Sequential(nn.Linear(hidden * 2, hidden), nn.ReLU(), nn.Dropout(0.3), nn.Linear(hidden, n_classes))

    def forward(self, x: torch.Tensor) -> torch.Tensor:  # x: (B, T, F)
        h, _ = self.gru(self.proj(x))
        return self.head(h.mean(dim=1))


class SymptomClassifier:
    def __init__(self, path: Path, device: str):
        ckpt = torch.load(path, map_location=device, weights_only=False)
        self.class_names: list[str] = ckpt.get("class_names", CLASS_NAMES)
        self.model = SymptomGRU(n_classes=len(self.class_names)).to(device)
        self.model.load_state_dict(ckpt["state_dict"])
        self.model.eval()
        self.device = device
        self.val_acc = ckpt.get("val_acc")

    @torch.no_grad()
    def predict(self, seq: np.ndarray) -> dict[str, float]:
        assert seq.shape[0] == SEQ_LEN
        x = torch.from_numpy(seq).float().unsqueeze(0).to(self.device)
        p = torch.softmax(self.model(x), dim=-1)[0].cpu().numpy()
        return {name: float(p[i]) for i, name in enumerate(self.class_names) if name != "Normal"}


def load_classifier(path: Path, device: str) -> SymptomClassifier | None:
    if not path.exists():
        return None
    try:
        return SymptomClassifier(path, device)
    except Exception as exc:  # pragma: no cover
        print(f"[vision] could not load symptom classifier: {exc}")
        return None
