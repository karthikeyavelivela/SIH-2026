"""Crew allocation with OR-Tools CP-SAT.

Covers each slot's demand from members who have the skills and are free,
preferring people who are close, and spreading work so the same few people
do not get every job. Returns the assignment plus reason codes and a few
alternates per slot, so a leader can accept, swap or remove.
"""
from __future__ import annotations

import math
from typing import Any

from ortools.sat.python import cp_model

UNMET_PENALTY = 1_000_000
METRES_PER_COST_UNIT = 100  # 1 cost point per 100 m
FAIRNESS_WEIGHT = 500  # per day of spread between busiest and least-busy member
NEAR_KM = 10.0


def haversine_km(a: dict | None, b: dict | None) -> float | None:
    if not a or not b:
        return None
    lat1, lng1, lat2, lng2 = map(math.radians, (a["lat"], a["lng"], b["lat"], b["lng"]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(h))


def _eligible(member: dict, slot: dict) -> bool:
    need = set(slot.get("skills") or [])
    if need and not need.issubset(set(member.get("skills") or [])):
        return False
    if slot["date"] in set(member.get("unavailable_dates") or []):
        return False
    return True


def _cost(member: dict, slot: dict) -> int:
    km = haversine_km(member.get("location"), slot.get("location"))
    return 0 if km is None else int(km * 1000 / METRES_PER_COST_UNIT)


def allocate(slots: list[dict], members: list[dict], max_alternates: int = 3, time_limit_s: float = 5.0) -> dict[str, Any]:
    model = cp_model.CpModel()
    x: dict[tuple[int, int], cp_model.IntVar] = {}
    for si, s in enumerate(slots):
        for mi, m in enumerate(members):
            if _eligible(m, s):
                x[mi, si] = model.NewBoolVar(f"x_{mi}_{si}")

    # A member does at most one slot on a given date.
    by_date: dict[str, list[int]] = {}
    for si, s in enumerate(slots):
        by_date.setdefault(s["date"], []).append(si)
    for mi in range(len(members)):
        for sis in by_date.values():
            vars_ = [x[mi, si] for si in sis if (mi, si) in x]
            if len(vars_) > 1:
                model.Add(sum(vars_) <= 1)

    unmet = []
    for si, s in enumerate(slots):
        assigned = [x[mi, si] for mi in range(len(members)) if (mi, si) in x]
        need = int(s["needed"])
        model.Add(sum(assigned) <= need)
        u = model.NewIntVar(0, need, f"unmet_{si}")
        model.Add(sum(assigned) + u == need)
        unmet.append(u)

    days = []
    for mi, m in enumerate(members):
        mine = [x[mi, si] for si in range(len(slots)) if (mi, si) in x]
        d = model.NewIntVar(0, 10_000, f"days_{mi}")
        model.Add(d == int(m.get("recent_days", 0)) + sum(mine))
        days.append(d)
    spread = model.NewIntVar(0, 10_000, "spread")
    if days:
        hi = model.NewIntVar(0, 10_000, "hi")
        lo = model.NewIntVar(0, 10_000, "lo")
        model.AddMaxEquality(hi, days)
        model.AddMinEquality(lo, days)
        model.Add(spread == hi - lo)

    model.Minimize(
        UNMET_PENALTY * sum(unmet)
        + sum(_cost(members[mi], slots[si]) * v for (mi, si), v in x.items())
        + FAIRNESS_WEIGHT * spread
    )

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_s
    solver.parameters.num_search_workers = 4
    status = solver.Solve(model)
    ok = status in (cp_model.OPTIMAL, cp_model.FEASIBLE)

    recent = sorted(int(m.get("recent_days", 0)) for m in members)
    median_recent = recent[len(recent) // 2] if recent else 0

    def reasons(mi: int, si: int) -> list[str]:
        m, s = members[mi], slots[si]
        out = []
        if s.get("skills"):
            out.append("skill_match")
        out.append("available")
        km = haversine_km(m.get("location"), s.get("location"))
        if km is not None and km <= NEAR_KM:
            out.append("near")
        if int(m.get("recent_days", 0)) < median_recent:
            out.append("fewer_recent_days")
        return out

    result_slots = []
    for si, s in enumerate(slots):
        chosen = [mi for mi in range(len(members)) if ok and (mi, si) in x and solver.Value(x[mi, si])]
        others = sorted(
            (mi for mi in range(len(members)) if (mi, si) in x and mi not in chosen),
            key=lambda mi: (_cost(members[mi], s), int(members[mi].get("recent_days", 0))),
        )[:max_alternates]
        result_slots.append(
            {
                "slot_id": s["id"],
                "date": s["date"],
                "needed": int(s["needed"]),
                "assigned": [
                    {
                        "member_id": members[mi]["id"],
                        "reasons": reasons(mi, si),
                        "distance_km": None if haversine_km(members[mi].get("location"), s.get("location")) is None
                        else round(haversine_km(members[mi].get("location"), s.get("location")), 1),
                    }
                    for mi in chosen
                ],
                "alternates": [{"member_id": members[mi]["id"], "reasons": reasons(mi, si)} for mi in others],
                "unmet": int(s["needed"]) - len(chosen),
            }
        )
    return {
        "status": solver.StatusName(status),
        "slots": result_slots,
        "spread_days": solver.Value(spread) if ok else None,
    }
