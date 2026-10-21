"""
Per-customer churn risk.
=========================
For every active customer: the probability they churn within the next
`horizon` periods *given they've survived to their current tenure*
(conditional CoxPH survival), a tier, and the three covariates pushing their
hazard up the most relative to the average customer.

Personal drivers use the log-hazard decomposition: contribution_j =
coef_j × (x_ij − mean_j). Positive = raises this customer's risk vs average.
"""

from __future__ import annotations

import io
import threading
from typing import Any

import numpy as np
import pandas as pd

from app.analytics.dataset import RunDataset
from app.stats.survival import churn_within

HIGH, MEDIUM = 0.5, 0.25
MIN_DRIVER_LIFT = 1.05   # a personal driver must raise hazard ≥5% vs average
DRIVER_ALPHA = 0.05      # …and come from a covariate significant after BH
_scored: dict[tuple[str, float], pd.DataFrame] = {}
_lock = threading.Lock()


def _tier(p: float) -> str:
    return "high" if p >= HIGH else "medium" if p >= MEDIUM else "low"


def _label(feature: str, value: float, mean: float) -> str:
    if "=" in feature:
        col, level = feature.split("=", 1)
        return f"{col} = {level}"
    fmt = (lambda v: f"{v:,.0f}") if abs(mean) >= 100 else (lambda v: f"{v:,.1f}")
    return f"{feature} {fmt(value)} (avg {fmt(mean)})"


def score_frame(ds: RunDataset, horizon: float) -> pd.DataFrame:
    """All active customers scored, highest risk first. Cached per run+horizon."""
    key = (ds.job_id, float(horizon))
    with _lock:
        if key in _scored:
            return _scored[key]
    m = ds.model
    if m is None:
        raise ValueError("Not enough signal in this dataset to fit a survival model.")

    active_idx = m.frame.index[m.frame[ds.churn_col] == 0]
    x = m.frame.loc[active_idx, m.features]
    tenure = m.frame.loc[active_idx, ds.tenure_col].to_numpy(dtype=float)
    prob = churn_within(m, x, tenure, horizon)

    coefs = m.coefs.reindex(m.features).to_numpy()
    # Only BH-significant covariates may explain an individual's risk —
    # otherwise noise features show up as "reasons".
    from app.stats import benjamini_hochberg
    pvals = m.cph.summary["p"].reindex(m.features).tolist()
    padj = np.array([q if q is not None else 1.0 for q in benjamini_hochberg(pvals)])
    eligible = padj < DRIVER_ALPHA
    means = m.frame[m.features].mean().to_numpy()
    contrib = (x.to_numpy(dtype=float) - means) * coefs  # rows × features

    drivers: list[list[dict[str, Any]]] = []
    xv = x.to_numpy(dtype=float)
    for r in range(len(x)):
        order = [j for j in np.argsort(-contrib[r]) if eligible[j]][:3]
        drivers.append([
            {"feature": m.features[j], "label": _label(m.features[j], xv[r, j], means[j]),
             "impact": round(float(np.exp(contrib[r, j])), 3)}
            for j in order if eligible[j] and contrib[r, j] > np.log(MIN_DRIVER_LIFT)
        ])

    src = ds.df.loc[active_idx]
    id_col = ds.detected.get("customer_id")
    out = pd.DataFrame({
        "row": active_idx,
        "customer_id": src[id_col].astype(str).to_numpy() if id_col and id_col in src else [str(i) for i in active_idx],
        "tenure": tenure,
        "risk": prob,
        "tier": [_tier(p) for p in prob],
        "drivers": drivers,
    })
    if ds.value_col:
        val = pd.to_numeric(src[ds.value_col], errors="coerce").fillna(0).to_numpy()
        out["value"] = val
        out["value_at_risk"] = val * prob
    out = out.sort_values("risk", ascending=False, kind="stable").reset_index(drop=True)
    with _lock:
        _scored[key] = out
    return out


def risk_report(ds: RunDataset, horizon: float = 3, tier: str | None = None, limit: int = 50, offset: int = 0, q: str | None = None) -> dict[str, Any]:
    scored = score_frame(ds, horizon)
    view = scored
    if tier in ("high", "medium", "low"):
        view = view[view["tier"] == tier]
    if q:
        view = view[view["customer_id"].str.contains(str(q), case=False, regex=False)]

    hist, edges = np.histogram(scored["risk"], bins=10, range=(0, 1))
    counts = scored["tier"].value_counts()
    summary = {
        "active_customers": int(len(scored)),
        "expected_churners": round(float(scored["risk"].sum()), 1),
        "mean_risk": round(float(scored["risk"].mean()), 4) if len(scored) else 0,
        "tiers": {t: int(counts.get(t, 0)) for t in ("high", "medium", "low")},
        "value_column": ds.value_col,
        "value_at_risk": round(float(scored["value_at_risk"].sum()), 2) if "value_at_risk" in scored else None,
        "histogram": [{"from": round(float(edges[i]), 1), "to": round(float(edges[i + 1]), 1), "count": int(hist[i])} for i in range(len(hist))],
        "top_drivers": _population_drivers(scored),
    }
    page = view.iloc[offset: offset + limit]
    return {
        "job_id": ds.job_id,
        "horizon": horizon,
        "tenure_column": ds.tenure_col,
        "thresholds": {"high": HIGH, "medium": MEDIUM},
        "summary": summary,
        "total": int(len(view)),
        "customers": [
            {
                "customer_id": r.customer_id,
                "tenure": round(float(r.tenure), 1),
                "risk": round(float(r.risk), 4),
                "tier": r.tier,
                "drivers": r.drivers,
                **({"value": round(float(r.value), 2), "value_at_risk": round(float(r.value_at_risk), 2)} if "value" in scored else {}),
            }
            for r in page.itertuples()
        ],
    }


def _population_drivers(scored: pd.DataFrame) -> list[dict[str, Any]]:
    """Which personal drivers show up most among the riskiest 10% of customers."""
    top = scored.head(max(1, int(round(len(scored) * 0.1))))
    counts: dict[str, int] = {}
    for drivers in top["drivers"]:
        for d in drivers:
            key = d["label"].split(" (")[0] if "=" in d["feature"] else d["feature"]
            counts[key] = counts.get(key, 0) + 1
    total = max(1, len(top))
    return [{"driver": k, "share_of_top_decile": round(v / total, 3)} for k, v in sorted(counts.items(), key=lambda kv: -kv[1])[:6]]


def risk_csv(ds: RunDataset, horizon: float = 3) -> str:
    scored = score_frame(ds, horizon)
    out = pd.DataFrame({
        "customer_id": scored["customer_id"],
        "tenure": scored["tenure"].round(1),
        f"churn_probability_next_{horizon:g}": scored["risk"].round(4),
        "tier": scored["tier"],
        "top_drivers": ["; ".join(d["label"] for d in ds) for ds in scored["drivers"]],
    })
    if "value" in scored:
        out["value"] = scored["value"].round(2)
        out["value_at_risk"] = scored["value_at_risk"].round(2)
    buf = io.StringIO()
    out.to_csv(buf, index=False)
    return buf.getvalue()


def clear_cache() -> None:
    with _lock:
        _scored.clear()
