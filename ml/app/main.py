"""fyro-ml: forecast / allocate / price-anomaly behind a shared-secret token.

The Node API sends the history it wants scored; this service does not read
the database when serving. (train.py reads it, with a read-only user.)
"""
from __future__ import annotations

import hmac
from datetime import date
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from . import config
from .allocate import allocate
from .anomaly import score_rate
from .calendar_data import CROP_SEASON_SOURCE, HOLIDAY_SOURCE
from .forecast import forecast_category, latest_version, read_metrics

app = FastAPI(title="fyro-ml", version="1.0.0")


def require_token(authorization: Optional[str] = Header(default=None)) -> None:
    expected = config.service_token()
    if not expected:
        raise HTTPException(status_code=503, detail="ML_SERVICE_TOKEN is not configured")
    supplied = (authorization or "").removeprefix("Bearer ").strip()
    if not hmac.compare_digest(supplied.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Invalid token")


@app.get("/health")
def health() -> dict:
    metrics = read_metrics()
    return {
        "ok": True,
        "model_version": latest_version(),
        "insufficient_data": None if metrics is None else metrics.get("insufficient_data"),
        "auth_configured": bool(config.service_token()),
        "calendar_sources": {"holidays": HOLIDAY_SOURCE, "crop_seasons": CROP_SEASON_SOURCE},
    }


class HistoryPoint(BaseModel):
    date: date
    count: float = Field(ge=0)


class ForecastRequest(BaseModel):
    category: str
    history: list[HistoryPoint]
    start: date
    horizon_days: int = Field(default=7, ge=1, le=28)
    society_size: float = Field(default=0, ge=0)


@app.post("/forecast", dependencies=[Depends(require_token)])
def forecast(req: ForecastRequest) -> dict:
    rows = forecast_category(
        req.category,
        [(h.date, h.count) for h in req.history],
        req.start,
        req.horizon_days,
        req.society_size,
    )
    return {"category": req.category, "forecast": rows}


class Location(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class Slot(BaseModel):
    id: str
    date: str
    needed: int = Field(ge=1, le=200)
    skills: list[str] = []
    location: Optional[Location] = None


class Member(BaseModel):
    id: str
    skills: list[str] = []
    unavailable_dates: list[str] = []
    location: Optional[Location] = None
    recent_days: int = Field(default=0, ge=0)


class AllocateRequest(BaseModel):
    slots: list[Slot] = Field(max_length=200)
    members: list[Member] = Field(max_length=500)
    max_alternates: int = Field(default=3, ge=0, le=10)


@app.post("/allocate", dependencies=[Depends(require_token)])
def allocate_route(req: AllocateRequest) -> dict:
    return allocate(
        [s.model_dump() for s in req.slots],
        [m.model_dump() for m in req.members],
        req.max_alternates,
    )


class AnomalyRequest(BaseModel):
    category: str
    rate: float = Field(gt=0)
    history: list[float] = []


@app.post("/price-anomaly", dependencies=[Depends(require_token)])
def price_anomaly(req: AnomalyRequest) -> dict:
    return score_rate(req.category, req.rate, req.history)
