"""
Evidence gate for LLM-written root causes.
==========================================
The statistics layer decides what is real; the LLM only explains it. A root
cause is kept only when it points at something that survived testing:

  * a segment family (contract, support, usage, …) with at least one bucket
    significant after Benjamini-Hochberg correction, or
  * a CoxPH driver that is significant and named in the cause text.

Everything else is rejected with a reason instead of being passed on to the
strategy agents as if it were proven. The eval harness scores causes with the
same keyword map, so the gate and the evals can't drift apart.
"""

from __future__ import annotations

import re
from typing import Any

# Which statistic family an LLM-written cause is about.
FAMILY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "contract": ("contract", "month-to-month", "monthly contract", "monthly plan", "commitment", "cadence", "annual"),
    "support": ("support", "ticket", "friction", "help desk", "complaint"),
    "usage": ("usage", "login", "engagement", "inactive", "activity", "low use", "dormant"),
    "plan_tier": ("plan tier", "tier", "premium", "basic plan", "standard plan", "pricing"),
    "channel": ("channel", "acquisition", "paid ads", "organic", "referral", "outbound", "partner"),
    "integration": ("integration", "integrated"),
    "tenure": ("tenure", "onboarding", "first 30", "first 90", "early-life", "new customer", "month 1"),
}

# Bucket key in the statistics payload → family.
BUCKET_FAMILY: dict[str, str] = {
    "churn_by_contract": "contract",
    "churn_by_support_volume": "support",
    "churn_by_usage_decile": "usage",
    "churn_by_plan_tier": "plan_tier",
    "churn_by_channel": "channel",
    "churn_by_integration": "integration",
    "churn_rate_by_tenure_bucket": "tenure",
}


def families_in(text: str) -> set[str]:
    t = (text or "").lower()
    return {fam for fam, kws in FAMILY_KEYWORDS.items() if any(k in t for k in kws)}


def _norm(s: str) -> str:
    return re.sub(r"[\s_=\-]+", " ", (s or "").lower()).strip()


def cause_evidence(cause: str, stats: dict[str, Any], drivers: list[dict[str, Any]]) -> dict[str, Any]:
    """Which significant statistics back `cause`, if any."""
    fams = families_in(cause)
    hits: list[tuple[str, float | None]] = []
    for bucket_key, fam in BUCKET_FAMILY.items():
        if fam not in fams:
            continue
        for label, payload in (stats.get(bucket_key) or {}).items():
            if isinstance(payload, dict) and payload.get("significant"):
                hits.append((payload.get("stat_id") or f"{fam}::{label}", payload.get("p_adj")))
    text = _norm(cause)
    backing_drivers = [
        str(d.get("feature")) for d in drivers or []
        if d.get("significant") and _norm(str(d.get("feature", "")).split("=")[0]) in text
    ]
    p_values = [p for _, p in hits if isinstance(p, (int, float))]
    return {
        "supported": bool(hits or backing_drivers),
        "families": sorted(fams),
        "stat_ids": [s for s, _ in hits],
        "drivers": backing_drivers,
        "best_p_adj": min(p_values) if p_values else None,
    }
