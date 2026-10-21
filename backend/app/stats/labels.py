"""Human-readable names for statistic ids like "support::high_4_plus"."""

from __future__ import annotations

_FAMILY = {
    "contract": "Contract",
    "plan_tier": "Plan",
    "channel": "Came from",
    "integration": "Integration",
    "support": "Support tickets",
    "usage": "Usage",
    "tenure": "Time as customer",
}

_LEVEL = {
    "support": {"none_0": "none", "low_1_3": "1–3", "high_4_plus": "4 or more"},
    "usage": {"q1_lowest": "lowest 25%", "q2_low": "below average", "q3_high": "above average", "q4_highest": "top 25%"},
    "tenure": {"0_1mo": "first month", "1_3mo": "1–3 months", "3_6mo": "3–6 months",
               "6_12mo": "6–12 months", "12_24mo": "1–2 years", "24plus_mo": "over 2 years"},
}


def friendly_stat(stat_id: str) -> str:
    family, _, level = (stat_id or "").partition("::")
    name = _FAMILY.get(family, family.replace("_", " ").capitalize())
    pretty = _LEVEL.get(family, {}).get(level, level)
    return f"{name}: {pretty}" if level else name
