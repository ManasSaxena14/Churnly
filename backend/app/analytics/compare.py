"""
Compare two runs — what changed, and is the change real?
=========================================================
For every segment present in both datasets (same stat_id), a two-proportion
z-test of churn rate A vs B, BH-corrected across all segments: the same
discipline as the main pipeline, applied to drift. Plus Kaplan-Meier curves
for both runs and hazard-ratio changes for shared CoxPH drivers.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from app.analytics.dataset import RunDataset
from app.stats import benjamini_hochberg, compute_bucket_stats, two_proportion_pvalue
from app.stats.labels import friendly_stat

_FAMILIES = (
    "churn_by_plan_tier", "churn_by_contract", "churn_by_channel", "churn_by_integration",
    "churn_by_support_volume", "churn_by_usage_decile", "churn_rate_by_tenure_bucket",
)


def _km_curve(ds: RunDataset, points: int = 30) -> list[dict[str, float]]:
    from lifelines import KaplanMeierFitter

    t = ds.df[ds.tenure_col].astype(float)
    e = ds.df[ds.churn_col].astype(int)
    km = KaplanMeierFitter().fit(t, e)
    grid = np.linspace(0, float(t.max()), points)
    s = km.survival_function_at_times(grid).to_numpy()
    return [{"t": round(float(a), 2), "s": round(float(b), 4)} for a, b in zip(grid, s)]


def _buckets(ds: RunDataset) -> dict[str, dict[str, Any]]:
    stats = compute_bucket_stats(ds.df, ds.churn_col, ds.detected)
    out = {}
    for fam in _FAMILIES:
        for label, p in (stats.get(fam) or {}).items():
            if isinstance(p, dict) and "stat_id" in p:
                out[p["stat_id"]] = p
    return out


def compare_runs(a: RunDataset, b: RunDataset) -> dict[str, Any]:
    ba, bb = _buckets(a), _buckets(b)
    shared = sorted(set(ba) & set(bb))
    pvals = []
    for sid in shared:
        pa, pb = ba[sid], bb[sid]
        pvals.append(two_proportion_pvalue(int(pa["churned"]), int(pa["size"]), int(pb["churned"]), int(pb["size"])))
    adj = benjamini_hochberg(pvals)

    segments = []
    for sid, p, q in zip(shared, pvals, adj):
        ra, rb = ba[sid]["churn_rate"], bb[sid]["churn_rate"]
        segments.append({
            "stat_id": sid,
            "label": friendly_stat(sid),
            "churn_a": ra, "churn_b": rb,
            "delta_pp": round((rb - ra) * 100, 2),
            "size_a": ba[sid]["size"], "size_b": bb[sid]["size"],
            "p_value": round(p, 4) if p is not None else None,
            "p_adj": round(q, 4) if q is not None else None,
            "significant": bool(q is not None and q < 0.05),
        })
    rate_a = float(a.df[a.churn_col].mean())
    rate_b = float(b.df[b.churn_col].mean())
    overall_pp = (rate_b - rate_a) * 100
    # When overall churn moves, every segment moves with it. "Excess" is how
    # far a segment moved beyond the overall shift — the outliers that need
    # an explanation.
    for seg in segments:
        seg["excess_pp"] = round(seg["delta_pp"] - overall_pp, 2)
    segments.sort(key=lambda s: (not s["significant"], -abs(s["excess_pp"])))

    drivers = []
    if a.model is not None and b.model is not None:
        ca, cb = a.model.coefs, b.model.coefs
        for f in sorted(set(ca.index) & set(cb.index)):
            ha, hb = float(np.exp(ca[f])), float(np.exp(cb[f]))
            drivers.append({"feature": f, "hr_a": round(ha, 3), "hr_b": round(hb, 3), "change": round((hb - ha) / ha, 4)})
        drivers.sort(key=lambda d: -abs(d["change"]))

    overall_p = two_proportion_pvalue(int(a.df[a.churn_col].sum()), len(a.df), int(b.df[b.churn_col].sum()), len(b.df))
    sig = [s for s in segments if s["significant"]]
    outliers = [s for s in sig if abs(s["excess_pp"]) >= 3]
    headline = []
    real = overall_p is not None and overall_p < 0.05
    headline.append(
        f"Overall, {'more' if rate_b > rate_a else 'fewer'} customers left: {rate_a:.1%} → {rate_b:.1%} "
        f"({'a real change' if real else 'this could be chance'})."
    )
    for s in outliers[:3]:
        more = s["excess_pp"] > 0
        headline.append(
            f"{s['label']}: {s['churn_a']:.0%} → {s['churn_b']:.0%} of customers left — "
            f"{abs(s['excess_pp']):.1f} points {'worse' if more else 'better'} than the overall change."
        )
    if sig and not outliers:
        headline.append("Customer groups changed in line with the overall trend — no single group stands out.")
    if not sig:
        headline.append("No customer group changed more than chance would explain.")

    def run_card(ds: RunDataset) -> dict[str, Any]:
        meta = ds.run.get("meta") or {}
        return {
            "job_id": ds.job_id, "dataset_name": meta.get("dataset_name"),
            "saved_at": ds.run.get("saved_at"), "rows": int(len(ds.df)),
            "churn_rate": round(float(ds.df[ds.churn_col].mean()), 4),
        }

    return {
        "a": run_card(a), "b": run_card(b),
        "overall": {"churn_a": round(rate_a, 4), "churn_b": round(rate_b, 4), "delta_pp": round((rate_b - rate_a) * 100, 2),
                    "p_value": round(overall_p, 4) if overall_p is not None else None},
        "headline": headline,
        "km": {"a": _km_curve(a), "b": _km_curve(b)},
        "segments": segments,
        "drivers": drivers[:12],
        "tests_run": len(shared),
        "significant_changes": len(sig),
    }
