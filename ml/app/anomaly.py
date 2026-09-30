"""Rate anomaly scoring: is this quoted rate unusual for its category?

A trained per-category IsolationForest is used when one exists. Without one,
a small forest is fitted on the history the caller sends, but only when there
are enough points to mean anything. Otherwise the answer is "not available",
never an invented score.
"""
from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest

from . import config
from .forecast import latest_version

MIN_POINTS_TO_FIT = 30


def _load(category: str, models_dir: Path | None = None):
    root = models_dir or config.MODELS_DIR
    version = latest_version(root)
    if not version:
        return None, None
    path = root / version / f"anomaly_{category}.joblib"
    if not path.exists():
        return None, None
    return joblib.load(path), version


def score_rate(category: str, rate: float, history: list[float] | None = None, models_dir: Path | None = None) -> dict:
    model, version = _load(category, models_dir)
    source = "trained_model"
    n = None
    if model is None:
        points = [float(h) for h in (history or []) if h is not None and h > 0]
        if len(points) < MIN_POINTS_TO_FIT:
            return {
                "available": False,
                "reason": "insufficient_history",
                "needed": MIN_POINTS_TO_FIT,
                "have": len(points),
            }
        model = IsolationForest(n_estimators=100, contamination=0.02, random_state=0).fit(np.array(points).reshape(-1, 1))
        source = "fitted_on_request_history"
        n = len(points)
    raw = float(model.score_samples(np.array([[float(rate)]]))[0])  # lower = more anomalous
    flagged = bool(model.predict(np.array([[float(rate)]]))[0] == -1)
    return {
        "available": True,
        "score": round(-raw, 4),  # higher = more anomalous
        "flagged": flagged,
        "source": source,
        "model_version": version,
        "fitted_on_n": n,
    }
