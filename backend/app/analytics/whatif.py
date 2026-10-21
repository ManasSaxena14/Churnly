"""
What-if lab.
=============
Apply interventions to the active customer base and re-score it with the
same fitted CoxPH model:

  {"kind": "shift", "column": "Contract Length", "from": "Monthly", "to": "Annual", "share": 0.2}
      move 20% of Monthly customers to Annual
  {"kind": "scale", "column": "Support Calls", "factor": 0.7}
      cut support calls by 30%
  {"kind": "cap", "column": "Payment Delay", "max": 10}
      no customer above 10

Output: expected churners within the horizon before vs after, customers saved,
revenue saved (when a value column exists) and the population survival curve
for both. This is a model-based estimate of association — the UI says so.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from app.analytics.dataset import RunDataset
from app.stats.survival import churn_within, mean_survival_curve

MAX_ROWS = 4000  # sample cap keeps a scenario under ~1s on large files


def levers(ds: RunDataset) -> dict[str, Any]:
    m = ds.model
    if m is None:
        return {"categorical": [], "numeric": []}
    active = m.source.loc[m.frame[ds.churn_col] == 0]
    cats = []
    for c in m.cat_cols:
        shares = active[c].astype(str).value_counts(normalize=True)
        hr = {}
        for level in m.cat_levels[c]:
            feat = f"{c}={level}"
            hr[level] = round(float(np.exp(m.coefs[feat])), 3) if feat in m.coefs.index else 1.0
        cats.append({
            "column": c,
            "levels": [{"value": v, "share": round(float(shares.get(v, 0)), 4), "hazard_ratio": hr.get(v, 1.0)} for v in m.cat_levels[c]],
        })
    nums = []
    for c in m.numeric_cols:
        if c not in m.features:
            continue
        s = pd.to_numeric(active[c], errors="coerce")
        nums.append({
            "column": c,
            "mean": round(float(s.mean()), 3), "min": round(float(s.min()), 3), "max": round(float(s.max()), 3),
            "hazard_ratio_per_unit": round(float(np.exp(m.coefs[c])), 4),
        })
    return {"categorical": cats, "numeric": nums}


def _apply(raw: pd.DataFrame, scenario: list[dict[str, Any]], rng: np.random.Generator, levels: dict[str, list[str]] | None = None) -> tuple[pd.DataFrame, list[str]]:
    x = raw.copy()
    applied: list[str] = []
    for lever in scenario:
        kind, col = lever.get("kind"), lever.get("column")
        if col not in x.columns:
            continue
        if kind == "shift":
            src, dst = str(lever.get("from")), str(lever.get("to"))
            if levels is not None and dst not in levels.get(col, []):
                continue  # unknown target level — the model can't score it
            share = float(np.clip(lever.get("share", 0), 0, 1))
            idx = x.index[x[col].astype(str) == src]
            n = int(round(len(idx) * share))
            if n and src != dst:
                chosen = rng.choice(idx, size=n, replace=False)
                x.loc[chosen, col] = dst
                applied.append(f"Moved {n:,} customers from {col} = {src} to {dst}")
        elif kind == "scale":
            f = float(lever.get("factor", 1))
            x[col] = pd.to_numeric(x[col], errors="coerce") * f
            applied.append(f"{col} × {f:g}")
        elif kind == "cap":
            mx = float(lever.get("max"))
            x[col] = pd.to_numeric(x[col], errors="coerce").clip(upper=mx)
            applied.append(f"{col} capped at {mx:g}")
    return x, applied


def run_scenario(ds: RunDataset, scenario: list[dict[str, Any]], horizon: float = 3, seed: int = 7) -> dict[str, Any]:
    m = ds.model
    if m is None:
        raise ValueError("Not enough signal in this dataset to fit a survival model.")
    rng = np.random.default_rng(seed)

    active_idx = m.frame.index[m.frame[ds.churn_col] == 0]
    if len(active_idx) > MAX_ROWS:
        active_idx = pd.Index(rng.choice(active_idx, size=MAX_ROWS, replace=False))
    scale = (m.frame[ds.churn_col] == 0).sum() / len(active_idx)  # back to full population

    raw = m.source.loc[active_idx]
    tenure = m.frame.loc[active_idx, ds.tenure_col].to_numpy(dtype=float)
    x_base = m.encode(raw)
    changed_raw, applied = _apply(raw, scenario, rng, m.cat_levels)
    x_new = m.encode(changed_raw)

    p_base = churn_within(m, x_base, tenure, horizon)
    p_new = churn_within(m, x_new, tenure, horizon)

    t_max = float(m.frame[ds.tenure_col].max())
    times = np.linspace(0, t_max, 40)
    curve_sample = min(1500, len(x_base))
    sel = rng.choice(len(x_base), size=curve_sample, replace=False)
    s_base = mean_survival_curve(m, x_base.iloc[sel], times)
    s_new = mean_survival_curve(m, x_new.iloc[sel], times)

    base_churners = float(p_base.sum() * scale)
    new_churners = float(p_new.sum() * scale)
    out: dict[str, Any] = {
        "horizon": horizon,
        "applied": applied,
        "active_customers": int(round(len(active_idx) * scale)),
        "baseline": {"expected_churners": round(base_churners, 1), "churn_rate": round(float(p_base.mean()), 4)},
        "scenario": {"expected_churners": round(new_churners, 1), "churn_rate": round(float(p_new.mean()), 4)},
        "customers_saved": round(base_churners - new_churners, 1),
        "relative_change": round((new_churners - base_churners) / base_churners, 4) if base_churners else 0,
        "curve": [{"t": round(float(t), 2), "baseline": round(float(b), 4), "scenario": round(float(s), 4)} for t, b, s in zip(times, s_base, s_new)],
        "caveat": "Model-based estimate: assumes the levers change churn the way they're associated with it today. Validate with an experiment.",
    }
    if ds.value_col:
        val = pd.to_numeric(raw[ds.value_col], errors="coerce").fillna(0).to_numpy()
        out["value_column"] = ds.value_col
        out["value_saved"] = round(float(((p_base - p_new) * val).sum() * scale), 2)
    return out
