"""Train the per-category demand models and rate-anomaly models.

    MONGODB_URI_READONLY=... python scripts/train.py

Uses a READ-ONLY Mongo user. Counts completed bookings per day per category,
leaving out isVerification data. Writes ml/models/<version>/ and points
ml/models/LATEST at it.

Honesty rules:
  * A category with too little data is NOT trained. It is listed in
    metrics.json with insufficient_data: true, and the server falls back to
    rules for it.
  * metrics.json holds MAE on the last 28 days the model never saw, next to
    the MAE of the naive "same weekday last week" baseline. Those numbers are
    computed from this data only. Nothing here invents an accuracy figure.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from xgboost import XGBRegressor

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app import config  # noqa: E402
from app.forecast import FEATURES, build_row  # noqa: E402

HOLDOUT_DAYS = 28


def daily_counts(df: pd.DataFrame) -> dict[str, dict[date, float]]:
    """df columns: day (date), category (str), count (int)."""
    out: dict[str, dict[date, float]] = {}
    for cat, g in df.groupby("category"):
        out[str(cat)] = {d: float(n) for d, n in zip(g["day"], g["count"])}
    return out


def fill_days(series: dict[date, float]) -> dict[date, float]:
    """Days with no bookings are zeros, not missing."""
    if not series:
        return {}
    lo, hi = min(series), max(series)
    return {lo + timedelta(days=i): series.get(lo + timedelta(days=i), 0.0) for i in range((hi - lo).days + 1)}


def training_table(series: dict[date, float], society_size: float) -> tuple[np.ndarray, np.ndarray, list[date]]:
    days = sorted(series)
    # Lags need 28 days behind each row, so the first 28 days only feed lags.
    usable = [d for d in days if d - timedelta(days=28) >= days[0]]
    X = np.array([build_row(series, d, society_size) for d in usable], dtype=float)
    y = np.array([series[d] for d in usable], dtype=float)
    return X, y, usable


def train_category(series: dict[date, float], society_size: float) -> tuple[XGBRegressor, dict]:
    series = fill_days(series)
    X, y, days = training_table(series, society_size)
    cut = len(days) - HOLDOUT_DAYS
    X_tr, y_tr, X_te, y_te = X[:cut], y[:cut], X[cut:], y[cut:]
    model = XGBRegressor(n_estimators=300, max_depth=4, learning_rate=0.05, subsample=0.9, random_state=0)
    model.fit(X_tr, y_tr)
    pred = np.maximum(model.predict(X_te), 0)
    lag7 = X_te[:, FEATURES.index("lag7")]
    mae_model = float(np.mean(np.abs(pred - y_te)))
    mae_naive = float(np.mean(np.abs(lag7 - y_te)))
    resid_std = float(np.std(y_te - pred))
    # Refit on everything so the shipped model has seen the latest weeks too.
    model.fit(X, y)
    meta = {
        "trained_on_n": int(len(y)),
        "resid_std": resid_std,
        "holdout_days": HOLDOUT_DAYS,
        "mae_model": round(mae_model, 4),
        "mae_naive_seasonal": round(mae_naive, 4),
        "beats_baseline": bool(mae_model < mae_naive),
    }
    return model, meta


def load_from_mongo(uri: str) -> tuple[pd.DataFrame, pd.DataFrame, float]:
    from pymongo import MongoClient

    db = MongoClient(uri, serverSelectionTimeoutMS=8000).get_default_database()
    pipeline = [
        {"$match": {"status": "completed", "isVerification": {"$ne": True}, "serviceCategorySlug": {"$type": "string"}}},
        {
            "$group": {
                "_id": {
                    "day": {"$dateToString": {"format": "%Y-%m-%d", "date": "$createdAt"}},
                    "category": "$serviceCategorySlug",
                },
                "count": {"$sum": 1},
            }
        },
    ]
    rows = [{"day": datetime.strptime(r["_id"]["day"], "%Y-%m-%d").date(), "category": r["_id"]["category"], "count": r["count"]} for r in db.bookings.aggregate(pipeline)]
    bookings = pd.DataFrame(rows, columns=["day", "category", "count"])
    sizes = [len(m.get("memberIds", [])) for m in db.muthas.find({}, {"memberIds": 1})]
    society_size = float(np.mean(sizes)) if sizes else 0.0
    # Rates: hamali pricing profiles, used for the anomaly models.
    rates = pd.DataFrame(
        [{"category": p.get("categorySlug"), "rate": p.get("rate")} for p in db.workerpricingprofiles.find({}, {"categorySlug": 1, "rate": 1}) if p.get("rate")],
        columns=["category", "rate"],
    )
    return bookings, rates, society_size


def train_all(bookings: pd.DataFrame, rates: pd.DataFrame, society_size: float, out_root: Path) -> dict:
    version = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = out_root / version
    out.mkdir(parents=True, exist_ok=True)

    metrics: dict = {"version": version, "trained_at": datetime.now(timezone.utc).isoformat(), "categories": {}, "anomaly": {}}
    any_trained = False
    for cat, series in daily_counts(bookings).items():
        filled = fill_days(series)
        if len(filled) < config.MIN_TRAIN_DAYS or sum(filled.values()) < config.MIN_SOCIETY_BOOKINGS:
            metrics["categories"][cat] = {"insufficient_data": True, "days": len(filled), "bookings": int(sum(filled.values()))}
            continue
        model, meta = train_category(series, society_size)
        joblib.dump({"model": model, "meta": meta}, out / f"forecast_{cat}.joblib")
        metrics["categories"][cat] = {"insufficient_data": False, **meta}
        any_trained = True

    for cat, g in rates.groupby("category"):
        vals = g["rate"].astype(float).to_numpy()
        if len(vals) < 30:
            metrics["anomaly"][str(cat)] = {"insufficient_data": True, "points": int(len(vals))}
            continue
        iso = IsolationForest(n_estimators=200, contamination=0.02, random_state=0).fit(vals.reshape(-1, 1))
        joblib.dump(iso, out / f"anomaly_{cat}.joblib")
        metrics["anomaly"][str(cat)] = {"insufficient_data": False, "points": int(len(vals))}

    metrics["insufficient_data"] = not any_trained
    (out / "metrics.json").write_text(json.dumps(metrics, indent=2))
    out_root.mkdir(parents=True, exist_ok=True)
    (out_root / "LATEST").write_text(version)
    return metrics


def main() -> None:
    uri = os.environ.get("MONGODB_URI_READONLY")
    if not uri:
        sys.exit("Set MONGODB_URI_READONLY (a read-only Atlas user).")
    bookings, rates, society_size = load_from_mongo(uri)
    metrics = train_all(bookings, rates, society_size, config.MODELS_DIR)
    print(json.dumps(metrics, indent=2))
    if metrics["insufficient_data"]:
        print("\nNot enough real data to train any category. The server will use its rules.", file=sys.stderr)


if __name__ == "__main__":
    main()
