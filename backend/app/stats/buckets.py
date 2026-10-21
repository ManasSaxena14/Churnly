"""
Bucket statistics — churn rate per segment, z-tested and BH-corrected.
=======================================================================
Extracted from the forensic detective so the eval harness can compute the
exact same numbers without making any LLM call.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from app.stats.ztest import apply_significance


def _bucket_entry(df, mask, churn_col) -> dict | None:
    """Build one {churn_rate, size, churned} bucket from a boolean mask."""
    if mask.sum() == 0:
        return None
    return {
        "churn_rate": round(float(df.loc[mask, churn_col].mean()), 3),
        "size": int(mask.sum()),
        "churned": int(df.loc[mask, churn_col].sum()),
    }


def _bucket_churn(df, col, churn_col, buckets):
    """Compute churn rate for each (label, lo, hi) bucket of a numeric column."""
    out = {}
    series = df[col]
    for label, lo, hi in buckets:
        if hi is None:
            mask = series >= lo
        else:
            mask = (series >= lo) & (series < hi)
        entry = _bucket_entry(df, mask, churn_col)
        if entry is not None:
            out[label] = entry
    return out


def _categorical_bucket(df, col: str, churn_col: str) -> dict:
    out = {}
    for value in df[col].dropna().unique():
        entry = _bucket_entry(df, df[col] == value, churn_col)
        if entry is not None:
            out[str(value)] = entry
    return out


def empty_stats() -> dict[str, Any]:
    return {
        "churn_rate": 0,
        "churn_by_channel": {},
        "churn_by_integration": {},
        "churn_by_plan_tier": {},
        "churn_by_contract": {},
        "churn_by_support_volume": {},
        "churn_by_usage_decile": {},
        "time_to_churn_distribution": {},
        "churn_rate_by_tenure_bucket": {},
        "feature_count_used": 0,
    }


def compute_bucket_stats(df, churn_col: str | None, detected: dict[str, Any]) -> dict[str, Any]:
    """Compute every churn bucket the agents see, plus significance annotations.

    `detected` is input_context["detected_columns"] from input_ingest.
    Adds a `significance_summary` key describing the BH correction.
    """
    tenure_col = detected.get("tenure")
    usage_col = detected.get("usage")
    support_col = detected.get("support")
    plan_col = detected.get("plan")
    contract_col = detected.get("contract")

    stats = empty_stats()
    if not churn_col:
        return stats

    stats["churn_rate"] = round(float(df[churn_col].mean()), 3)

    # 1. Churn by acquisition channel
    # An explicit `channel: None` from the confirm screen means "no such column".
    if "channel" in detected:
        acq_col = detected.get("channel")
    else:
        acq_col = next((c for c in df.columns if "acquisition" in c.lower() or "channel" in c.lower()), None)
    if acq_col and acq_col in df.columns:
        stats["churn_by_channel"] = _categorical_bucket(df, acq_col, churn_col)

    # 2. Churn by integration status
    int_col = next((c for c in df.columns if "integration" in c.lower()), None)
    if int_col:
        stats["churn_by_integration"] = _categorical_bucket(df, int_col, churn_col)

    # 3. Churn by plan tier — pricing-tier concentration is a key diagnostic
    if plan_col and plan_col in df.columns:
        stats["churn_by_plan_tier"] = _categorical_bucket(df, plan_col, churn_col)

    # 3b. Churn by contract cadence (monthly/quarterly/annual) — commitment
    # length is often the single strongest churn split in subscription data
    if contract_col and contract_col in df.columns:
        stats["churn_by_contract"] = _categorical_bucket(df, contract_col, churn_col)

    # 4. Churn by support ticket volume (0 / 1-3 / 4+) — friction signal
    if support_col and support_col in df.columns:
        try:
            df_supp = df.copy()
            df_supp[support_col] = df_supp[support_col].fillna(0).astype(float)
            stats["churn_by_support_volume"] = _bucket_churn(
                df_supp, support_col, churn_col,
                [("none_0", 0, 1), ("low_1_3", 1, 4), ("high_4_plus", 4, None)],
            )
        except Exception:
            pass

    # 5. Churn by usage quartile — engagement-driven churn signal
    if usage_col and usage_col in df.columns:
        try:
            usage_data = df[usage_col].dropna()
            if len(usage_data) > 10:
                q1, q2, q3 = usage_data.quantile([0.25, 0.5, 0.75])
                usage_buckets = [
                    ("q1_lowest", -np.inf, q1),
                    ("q2_low", q1, q2),
                    ("q3_high", q2, q3),
                    ("q4_highest", q3, np.inf),
                ]
                for label, lo, hi in usage_buckets:
                    mask = (df[usage_col] >= lo) & (df[usage_col] < hi)
                    entry = _bucket_entry(df, mask, churn_col)
                    if entry is not None:
                        entry["usage_range"] = [
                            round(float(lo), 2) if np.isfinite(lo) else None,
                            round(float(hi), 2) if np.isfinite(hi) else None,
                        ]
                        stats["churn_by_usage_decile"][label] = entry
        except Exception:
            pass

    # 6. Time-to-churn distribution — when do users actually leave?
    if tenure_col and tenure_col in df.columns:
        try:
            churned_tenures = df.loc[df[churn_col] == 1, tenure_col].dropna()
            if len(churned_tenures) > 0:
                stats["time_to_churn_distribution"] = {
                    "mean": round(float(churned_tenures.mean()), 2),
                    "median": round(float(churned_tenures.median()), 2),
                    "p25": round(float(churned_tenures.quantile(0.25)), 2),
                    "p75": round(float(churned_tenures.quantile(0.75)), 2),
                    "p90": round(float(churned_tenures.quantile(0.90)), 2),
                    "churned_count": int(len(churned_tenures)),
                }

            # Churn rate by tenure bucket — surfaces 30/90-day cliffs
            stats["churn_rate_by_tenure_bucket"] = _bucket_churn(
                df, tenure_col, churn_col,
                [
                    ("0_1mo", 0, 1),
                    ("1_3mo", 1, 3),
                    ("3_6mo", 3, 6),
                    ("6_12mo", 6, 12),
                    ("12_24mo", 12, 24),
                    ("24plus_mo", 24, None),
                ],
            )
        except Exception:
            pass

    # z-test every bucket vs rest, then BH-correct across the whole family.
    # Pure math, zero LLM cost — downstream prompts only build causes on
    # buckets that survive correction.
    stats["significance_summary"] = apply_significance(
        stats,
        total_churned=int(df[churn_col].sum()),
        total_n=int(df[churn_col].count()),
    )
    return stats
