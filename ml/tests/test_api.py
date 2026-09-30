from datetime import date, timedelta

from conftest import AUTH


def _history(days=30, per_day=3):
    # SYNTHETIC test data: a flat 3 jobs a day. Not real bookings.
    start = date(2026, 1, 1)
    return [{"date": (start + timedelta(days=i)).isoformat(), "count": per_day} for i in range(days)]


def test_health_is_open_and_reports_no_model(client, models_dir):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["model_version"] is None
    assert body["auth_configured"] is True
    assert "holidays" in body["calendar_sources"]


def test_other_routes_need_the_token(client):
    payload = {"category": "electrical", "history": _history(), "start": "2026-02-01"}
    assert client.post("/forecast", json=payload).status_code == 401
    assert client.post("/forecast", json=payload, headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client.post("/forecast", json=payload, headers=AUTH).status_code == 200


def test_closed_when_no_token_is_configured(client, monkeypatch):
    monkeypatch.delenv("ML_SERVICE_TOKEN")
    payload = {"category": "electrical", "history": _history(), "start": "2026-02-01"}
    assert client.post("/forecast", json=payload, headers=AUTH).status_code == 503


def test_forecast_without_a_model_is_marked_cold_start_baseline(client, models_dir):
    r = client.post("/forecast", json={"category": "electrical", "history": _history(), "start": "2026-02-01", "horizon_days": 7}, headers=AUTH)
    rows = r.json()["forecast"]
    assert len(rows) == 7
    assert all(x["cold_start"] is True and x["method"] == "seasonal_naive" and x["model_version"] is None for x in rows)
    assert all(x["prediction"] == 3.0 for x in rows)


def test_forecast_validates_input(client):
    bad = {"category": "x", "history": [{"date": "2026-01-01", "count": -1}], "start": "2026-02-01"}
    assert client.post("/forecast", json=bad, headers=AUTH).status_code == 422
    too_long = {"category": "x", "history": [], "start": "2026-02-01", "horizon_days": 60}
    assert client.post("/forecast", json=too_long, headers=AUTH).status_code == 422
