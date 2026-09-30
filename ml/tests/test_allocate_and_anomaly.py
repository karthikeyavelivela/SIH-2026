import numpy as np

from conftest import AUTH

from app.allocate import allocate
from app.anomaly import score_rate

VIJ = {"lat": 16.5062, "lng": 80.6480}
NEAR = {"lat": 16.51, "lng": 80.65}  # ~1 km
FAR = {"lat": 17.6868, "lng": 83.2185}  # Visakhapatnam, hundreds of km


def member(id, skills=("electrical",), loc=NEAR, recent=0, unavailable=()):
    return {"id": id, "skills": list(skills), "location": loc, "recent_days": recent, "unavailable_dates": list(unavailable)}


def slot(id, date="2026-10-05", needed=1, skills=("electrical",)):
    return {"id": id, "date": date, "needed": needed, "skills": list(skills), "location": VIJ}


def test_assigns_nearest_qualified_member_with_reasons():
    out = allocate([slot("s1")], [member("near", loc=NEAR), member("far", loc=FAR)])
    a = out["slots"][0]["assigned"]
    assert [x["member_id"] for x in a] == ["near"]
    assert {"skill_match", "available", "near"} <= set(a[0]["reasons"])
    assert out["slots"][0]["unmet"] == 0
    assert [x["member_id"] for x in out["slots"][0]["alternates"]] == ["far"]


def test_skips_members_without_the_skill_or_not_free():
    out = allocate(
        [slot("s1")],
        [member("plumber", skills=("plumbing",)), member("busy", unavailable=("2026-10-05",)), member("ok")],
    )
    assert [x["member_id"] for x in out["slots"][0]["assigned"]] == ["ok"]


def test_reports_unmet_demand_instead_of_inventing_people():
    out = allocate([slot("s1", needed=3)], [member("a"), member("b")])
    s = out["slots"][0]
    assert len(s["assigned"]) == 2 and s["unmet"] == 1


def test_one_member_cannot_take_two_slots_on_the_same_day():
    out = allocate([slot("s1"), slot("s2")], [member("only")])
    taken = [len(s["assigned"]) for s in out["slots"]]
    assert sorted(taken) == [0, 1]


def test_fairness_spreads_work_to_the_person_with_fewer_recent_days():
    # Equal distance; one person has already worked 6 days recently.
    out = allocate([slot("s1")], [member("busy", recent=6), member("rested", recent=0)])
    assert [x["member_id"] for x in out["slots"][0]["assigned"]] == ["rested"]
    assert "fewer_recent_days" in out["slots"][0]["assigned"][0]["reasons"]


def test_allocate_endpoint(client):
    body = {"slots": [slot("s1")], "members": [member("a")]}
    assert client.post("/allocate", json=body).status_code == 401
    r = client.post("/allocate", json=body, headers=AUTH)
    assert r.status_code == 200 and r.json()["slots"][0]["assigned"][0]["member_id"] == "a"


def test_anomaly_not_available_without_enough_history(models_dir):
    r = score_rate("electrical", 500, [400, 410, 420])
    assert r["available"] is False and r["reason"] == "insufficient_history" and r["have"] == 3


def test_anomaly_flags_an_absurd_rate_against_fitted_history(models_dir):
    # SYNTHETIC rates clustered around 400-500.
    rng = np.random.default_rng(0)
    history = list(rng.uniform(400, 500, 80))
    normal = score_rate("electrical", 450, history)
    absurd = score_rate("electrical", 50_000, history)
    assert normal["available"] and normal["flagged"] is False
    assert absurd["flagged"] is True and absurd["score"] > normal["score"]
    assert absurd["source"] == "fitted_on_request_history"


def test_price_anomaly_endpoint(client, models_dir):
    r = client.post("/price-anomaly", json={"category": "electrical", "rate": 450, "history": []}, headers=AUTH)
    assert r.status_code == 200 and r.json()["available"] is False
