"""Per-category daily demand forecasting.

A trained XGBoost model is used when one exists for the category AND there is
enough history; otherwise the answer comes from a seasonal-naive baseline and
is marked cold_start. Nothing is ever presented as a trained prediction when
it is not.
"""
from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path
from typing import Iterable

import joblib
import numpy as np

from . import config
from .calendar_data import is_holiday, is_kharif, is_rabi

FEATURES = [
    "dow", "week_of_year", "month", "is_holiday", "is_kharif", "is_rabi",
    "lag7", "lag14", "lag28", "roll7", "roll28", "society_size",
]


def latest_version(models_dir: Path | None = None) -> str | None:
    root = models_dir or config.MODELS_DIR
    pointer = root / "LATEST"
    if pointer.exists():
        v = pointer.read_text().strip()
        return v or None
    return None


def load_model(category: str, models_dir: Path | None = None):
    """Returns (model, meta) for the latest version, or (None, None)."""
    root = models_dir or config.MODELS_DIR
    version = latest_version(root)
    if not version:
        return None, None
    path = root / version / f"forecast_{category}.joblib"
    if not path.exists():
        return None, None
    bundle = joblib.load(path)
    return bundle["model"], {**bundle["meta"], "model_version": version}


def _value(series: dict[date, float], d: date) -> float:
    return series.get(d, 0.0)


def _window_mean(series: dict[date, float], end: date, days: int) -> float:
    return float(np.mean([_value(series, end - timedelta(days=i)) for i in range(1, days + 1)]))


def build_row(series: dict[date, float], d: date, society_size: float) -> list[float]:
    return [
        d.weekday(),
        d.isocalendar().week,
        d.month,
        is_holiday(d),
        is_kharif(d),
        is_rabi(d),
        _value(series, d - timedelta(days=7)),
        _value(series, d - timedelta(days=14)),
        _value(series, d - timedelta(days=28)),
        _window_mean(series, d, 7),
        _window_mean(series, d, 28),
        society_size,
    ]


def to_series(history: Iterable[tuple[date, float]]) -> dict[date, float]:
    out: dict[date, float] = {}
    for d, n in history:
        out[d] = out.get(d, 0.0) + float(n)
    return out


def seasonal_naive(series: dict[date, float], d: date) -> float:
    """Same weekday last week, falling back to the trailing 4-week mean."""
    if d - timedelta(days=7) in series:
        return series[d - timedelta(days=7)]
    return _window_mean(series, d, 28)


def forecast_category(
    category: str,
    history: list[tuple[date, float]],
    start: date,
    horizon_days: int,
    society_size: float = 0.0,
    models_dir: Path | None = None,
) -> list[dict]:
    series = to_series(history)
    total_bookings = sum(series.values())
    model, meta = load_model(category, models_dir)
    cold = model is None or total_bookings < config.MIN_SOCIETY_BOOKINGS

    # Days between the end of the history and `start` are not zero-demand
    # days, they are just unknown. Roll them forward first so the lags of the
    # first requested day are filled, and return only what was asked for.
    last_seen = max(series) if series else start - timedelta(days=1)
    first = min(start, last_seen + timedelta(days=1))
    days = [first + timedelta(days=i) for i in range((start - first).days + horizon_days)]
    out = []
    for d in days:
        if cold:
            pred = seasonal_naive(series, d)
            lower, upper = max(0.0, pred - np.sqrt(max(pred, 1.0))), pred + np.sqrt(max(pred, 1.0))
            method = "seasonal_naive"
            version = None
            trained_on = 0
        else:
            row = np.array([build_row(series, d, society_size)], dtype=float)
            pred = float(max(0.0, model.predict(row)[0]))
            width = 1.28 * float(meta.get("resid_std", np.sqrt(max(pred, 1.0))))
            lower, upper = max(0.0, pred - width), pred + width
            method = "xgboost"
            version = meta["model_version"]
            trained_on = int(meta.get("trained_on_n", 0))
        series[d] = pred  # recursive: later days use earlier predictions as lags
        if d < start:
            continue
        out.append(
            {
                "date": d.isoformat(),
                "category": category,
                "prediction": round(pred, 2),
                "lower": round(float(lower), 2),
                "upper": round(float(upper), 2),
                "method": method,
                "model_version": version,
                "trained_on_n": trained_on,
                "cold_start": bool(cold),
            }
        )
    return out


def read_metrics(models_dir: Path | None = None) -> dict | None:
    root = models_dir or config.MODELS_DIR
    version = latest_version(root)
    if not version:
        return None
    path = root / version / "metrics.json"
    return json.loads(path.read_text()) if path.exists() else None
