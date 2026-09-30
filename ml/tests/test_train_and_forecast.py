"""Training and model-backed forecasting on SYNTHETIC data (labelled as such).

The synthetic series has a weekly pattern (busier on Saturdays) so that a
model has something real to learn; the numbers are made up for the test and
say nothing about FYRO's actual demand.
"""
import json
from datetime import date, timedelta

import pandas as pd

from app import config
from app.forecast import forecast_category, latest_version, read_metrics

START = date(2025, 1, 1)


def synthetic(days: int, category="electrical") -> pd.DataFrame:
    rows = []
    for i in range(days):
        d = START + timedelta(days=i)
        n = 8 if d.weekday() == 5 else 3  # Saturday peak
        rows.append({"day": d, "category": category, "count": n})
    return pd.DataFrame(rows)


def test_too_little_data_trains_nothing_and_says_so(models_dir):
    from scripts.train import train_all

    m = train_all(synthetic(20), pd.DataFrame(columns=["category", "rate"]), 0.0, models_dir)
    assert m["insufficient_data"] is True
    assert m["categories"]["electrical"]["insufficient_data"] is True
    assert not list(models_dir.glob("*/forecast_*.joblib"))


def test_enough_data_trains_a_model_with_honest_metrics(models_dir):
    from scripts.train import train_all

    m = train_all(synthetic(200), pd.DataFrame(columns=["category", "rate"]), 12.0, models_dir)
    cat = m["categories"]["electrical"]
    assert m["insufficient_data"] is False and cat["insufficient_data"] is False
    assert cat["mae_model"] >= 0 and cat["mae_naive_seasonal"] >= 0
    assert cat["holdout_days"] == 28
    assert latest_version(models_dir) == m["version"]
    assert read_metrics(models_dir)["version"] == m["version"]

    history = [(START + timedelta(days=i), 8 if (START + timedelta(days=i)).weekday() == 5 else 3) for i in range(200)]
    rows = forecast_category("electrical", history, START + timedelta(days=200), 7, 12.0, models_dir)
    assert all(r["cold_start"] is False and r["method"] == "xgboost" and r["model_version"] == m["version"] for r in rows)
    sat = next(r for r in rows if date.fromisoformat(r["date"]).weekday() == 5)
    tue = next(r for r in rows if date.fromisoformat(r["date"]).weekday() == 1)
    assert sat["prediction"] > tue["prediction"]  # it learned the Saturday peak
    assert all(r["lower"] <= r["prediction"] <= r["upper"] for r in rows)


def test_a_trained_model_still_reports_cold_start_when_this_societys_history_is_thin(models_dir):
    from scripts.train import train_all

    train_all(synthetic(200), pd.DataFrame(columns=["category", "rate"]), 12.0, models_dir)
    thin = [(START + timedelta(days=i), 1) for i in range(5)]  # 5 bookings < MIN_SOCIETY_BOOKINGS
    assert sum(n for _, n in thin) < config.MIN_SOCIETY_BOOKINGS
    rows = forecast_category("electrical", thin, START + timedelta(days=10), 3, 4.0, models_dir)
    assert all(r["cold_start"] is True and r["method"] == "seasonal_naive" for r in rows)


def test_verification_data_is_left_out_by_the_mongo_query():
    # The query is what excludes it; assert the filter text is present so a
    # refactor cannot silently drop it.
    import inspect
    from scripts import train

    src = inspect.getsource(train.load_from_mongo)
    assert '"isVerification": {"$ne": True}' in src


def test_metrics_file_is_valid_json(models_dir):
    from scripts.train import train_all

    m = train_all(synthetic(200), pd.DataFrame(columns=["category", "rate"]), 0.0, models_dir)
    path = models_dir / m["version"] / "metrics.json"
    assert json.loads(path.read_text())["version"] == m["version"]
