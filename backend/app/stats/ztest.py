"""
Two-proportion z-tests on churn buckets, with BH correction.
=============================================================
Each bucket (e.g. contract = Monthly) is tested against the rest of the
population. Raw p-values are kept for transparency; `significant` is decided
on the BH-adjusted value so the LLM only sees effects that survive correction.

Set RETAIN_MULTIPLE_TESTING=none to fall back to raw p < alpha (used by the
eval harness ablation to show what BH buys you).
"""

from __future__ import annotations

import os
from typing import Any

from app.stats.multiple_testing import benjamini_hochberg

ALPHA = 0.05


def multiple_testing_mode() -> str:
    """'bh' (default) or 'none'."""
    mode = (os.getenv("RETAIN_MULTIPLE_TESTING") or "bh").strip().lower()
    return "none" if mode in ("none", "off", "raw", "0") else "bh"


def two_proportion_pvalue(x1: int, n1: int, x2: int, n2: int) -> float | None:
    """Two-sided p-value for H0: churn rate in group 1 == group 2."""
    from scipy.stats import norm

    if n1 < 2 or n2 < 2:
        return None
    p_pool = (x1 + x2) / (n1 + n2)
    se = (p_pool * (1 - p_pool) * (1 / n1 + 1 / n2)) ** 0.5
    if se == 0:
        return None
    z = (x1 / n1 - x2 / n2) / se
    return float(2 * norm.sf(abs(z)))


def apply_significance(
    stats: dict[str, Any],
    total_churned: int,
    total_n: int,
    alpha: float = ALPHA,
    mode: str | None = None,
) -> dict[str, Any]:
    """Annotate every bucket in `stats` in place and return a test summary.

    Each bucket payload {churn_rate, size, churned} gains:
      p_value      raw two-proportion p (bucket vs rest)
      p_adj        BH-adjusted p across ALL buckets in this run
      significant  p_adj < alpha  (or raw p < alpha when mode == 'none')
      significant_raw  raw p < alpha, kept so the UI / evals can show what BH removed
      stat_id      "<family>::<label>", the id evidence_dossier cites
    """
    mode = mode or multiple_testing_mode()
    targets: list[tuple[str, str, dict]] = []
    for bucket_name, bucket in stats.items():
        if not isinstance(bucket, dict):
            continue
        for label, payload in bucket.items():
            if isinstance(payload, dict) and "churned" in payload and "size" in payload:
                targets.append((bucket_name, str(label), payload))

    raw: list[float | None] = []
    for _, _, payload in targets:
        n1 = int(payload["size"])
        x1 = int(payload["churned"])
        raw.append(two_proportion_pvalue(x1, n1, total_churned - x1, total_n - n1))

    adjusted = benjamini_hochberg(raw)

    n_raw_sig = n_adj_sig = 0
    for (bucket_name, label, payload), p, q in zip(targets, raw, adjusted):
        payload["stat_id"] = f"{_family(bucket_name)}::{label}"
        if p is None:
            payload["p_value"] = None
            payload["p_adj"] = None
            payload["significant"] = False
            payload["significant_raw"] = False
            continue
        sig_raw = p < alpha
        sig_adj = q is not None and q < alpha
        payload["p_value"] = round(p, 4)
        payload["p_adj"] = round(q, 4) if q is not None else None
        payload["significant_raw"] = sig_raw
        payload["significant"] = sig_adj if mode == "bh" else sig_raw
        n_raw_sig += int(sig_raw)
        n_adj_sig += int(sig_adj)

    return {
        "correction": "benjamini_hochberg" if mode == "bh" else "none",
        "alpha": alpha,
        "tests_run": sum(1 for p in raw if p is not None),
        "significant_raw": n_raw_sig,
        "significant_after_correction": n_adj_sig,
        "removed_by_correction": max(0, n_raw_sig - n_adj_sig) if mode == "bh" else 0,
    }


# Bucket key → family prefix used in stat ids. Matches the families
# diagnosis_merge / evidence_dossier already use for top_segments.
_FAMILY = {
    "churn_by_channel": "channel",
    "churn_by_integration": "integration",
    "churn_by_plan_tier": "plan_tier",
    "churn_by_contract": "contract",
    "churn_by_support_volume": "support",
    "churn_by_usage_decile": "usage",
    "churn_rate_by_tenure_bucket": "tenure",
}


def _family(bucket_name: str) -> str:
    return _FAMILY.get(bucket_name, bucket_name)
