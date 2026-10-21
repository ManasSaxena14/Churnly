"""Workspace dashboard: a summary row per saved run, plus portfolio KPIs."""

from __future__ import annotations

import json
from typing import Any

from app.analytics.dataset import _resolve_path
from app.runs import RUNS_DIR


def _summarize(run: dict[str, Any]) -> dict[str, Any]:
    ev = {}
    for e in run.get("events", []):
        if e.get("type") not in ("run_metrics", "forensic_progress"):
            ev[e.get("type")] = e.get("data") or {}
    risk = ev.get("risk_ready", {})
    churn = ev.get("churn_profile_ready", {})
    dx = ev.get("diagnosis_ready", {})
    sol = ev.get("solution_ready", {})
    sim = ev.get("simulation_ready", {})
    meta = run.get("meta") or {}
    metrics = run.get("metrics") or {}
    playbook = sol.get("final_playbook") or {}
    hyps = dx.get("merged_hypotheses") or []
    drivers = dx.get("driver_features") or []
    curve = churn.get("milestone_retention") or {}
    return {
        "job_id": run.get("job_id"),
        "status": run.get("status"),
        "saved_at": run.get("saved_at"),
        "dataset_name": meta.get("dataset_name"),
        "business_model": meta.get("business_model"),
        "analysis_depth": meta.get("analysis_depth"),
        "data_available": bool(_resolve_path(meta)),
        "active_customers": risk.get("total_active"),
        "high_risk_customers": risk.get("high_risk_count"),
        "model_confidence": risk.get("confidence"),
        "churn_probability": churn.get("churn_probability"),
        "median_survival": churn.get("median_survival_time"),
        "retention_curve": sorted(
            ((int(k.replace("month_", "")), v) for k, v in curve.items() if k.startswith("month_")),
            key=lambda kv: kv[0],
        ),
        "top_cause": hyps[0].get("hypothesis") if hyps else None,
        "top_driver": drivers[0].get("feature") if drivers else None,
        "significant_tests": (dx.get("significance_summary") or {}).get("significant_after_correction"),
        "playbook_title": playbook.get("title") if playbook.get("executive_summary") else None,
        "problems": len(playbook.get("problems_and_solutions") or []),
        "grounded_rate": (sol.get("groundedness") or {}).get("grounded_rate"),
        "expected_lift": sim.get("expected_lift") if sim.get("simulated", True) else None,
        "llm_calls": metrics.get("llm_calls"),
        "total_tokens": metrics.get("total_tokens"),
        "cost_usd": metrics.get("cost_usd"),
        "elapsed_s": metrics.get("elapsed_s"),
    }


def list_runs(limit: int = 50) -> dict[str, Any]:
    rows = []
    if RUNS_DIR.exists():
        files = sorted(RUNS_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)[:limit]
        for p in files:
            try:
                rows.append(_summarize(json.loads(p.read_text())))
            except Exception:
                continue
    done = [r for r in rows if r["status"] == "complete"]

    def avg(key: str) -> float | None:
        vals = [r[key] for r in done if isinstance(r.get(key), (int, float))]
        return round(sum(vals) / len(vals), 3) if vals else None

    return {
        "runs": rows,
        "kpis": {
            "runs": len(rows),
            "completed": len(done),
            "customers_analyzed": sum(int(r["active_customers"] or 0) for r in done),
            "high_risk_customers": sum(int(r["high_risk_customers"] or 0) for r in done),
            "avg_churn_probability": avg("churn_probability"),
            "avg_grounded_rate": avg("grounded_rate"),
            "avg_expected_lift": avg("expected_lift"),
            "total_tokens": sum(int(r["total_tokens"] or 0) for r in rows),
        },
    }
