# fyro-ml

Demand forecast, crew allocation and rate-anomaly scoring for FYRO. A small FastAPI service the Node API calls with a shared token. The API falls back to its rule-based path whenever this service is off, slow (3 s timeout) or wrong, and labels every answer `source: 'ml'` or `'rules'`.

| Route | What it does |
|---|---|
| `GET /health` | Open. Model version, whether any model exists, calendar sources. |
| `POST /forecast` | Per-category daily demand for up to 28 days. Trained XGBoost when a model exists and the history is long enough; otherwise a seasonal-naive baseline with `cold_start: true`. |
| `POST /allocate` | OR-Tools CP-SAT crew assignment: skills, availability, distance, and a fairness term. Returns reason codes and alternates; reports `unmet` instead of inventing people. |
| `POST /price-anomaly` | IsolationForest score for a quoted rate. `available: false` when there is too little history. |

All but `/health` need `Authorization: Bearer $ML_SERVICE_TOKEN`. With no token configured they return 503, so a misconfigured deploy is closed.

## Run and test

```
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt    # Windows; bin/ on Linux
.venv/Scripts/python -m pytest -q
ML_SERVICE_TOKEN=... .venv/Scripts/python -m uvicorn app.main:app --port 8000
```

## Training

```
MONGODB_URI_READONLY=mongodb+srv://<read-only user>... python scripts/train.py
```

Use a read-only Atlas user. The script counts completed bookings per day per category, leaving out `isVerification` data, and writes `models/<version>/` plus `models/LATEST`. `metrics.json` holds the model's MAE on the last 28 days it never saw next to the MAE of the "same weekday last week" baseline. A category without enough real data is **not trained** and is listed as `insufficient_data: true`; the API then uses its rules. Nothing here invents an accuracy number, and tests use clearly labelled synthetic data only.

Commit the resulting `models/` folder so the deployed service can load it.

## Calendar inputs

`app/calendar_data.py` holds fixed-date national holidays and coarse national Kharif/Rabi months, each with a source note. Movable festivals (Ugadi, Diwali, Eid, Dasara and others) are **not** guessed: add them from the Andhra Pradesh government holiday list. AP-specific crop windows should be confirmed with the AP Department of Agriculture.
