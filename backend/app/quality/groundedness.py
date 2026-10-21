"""
Groundedness check — does every playbook problem carry a real receipt?
=======================================================================
Rule-based, no LLM. For each problem in the final playbook we look at its
rationale_chain (attached from evidence_dossier) and ask:

  stat      — is it tied to a statistical bucket that survived BH correction?
  citation  — does its root cause cite at least one knowledge-base source?
  simulated — did Monte Carlo produce a lift estimate for its tactic?

A problem is "grounded" only when all three hold. The run-level rate is what
the README / resume quotes ("X% of playbook claims are fully grounded").
"""

from __future__ import annotations

from typing import Any


def _problem_checks(problem: dict[str, Any]) -> dict[str, bool]:
    chain = problem.get("rationale_chain") or {}
    stat = chain.get("stat") or {}
    cause = chain.get("cause") or {}
    sim = chain.get("simulated_outcome") or {}

    stat_id = stat.get("stat_id")
    has_stat = bool(stat_id) and stat_id != "(none)"
    # Older runs (before BH) have no `significant` key on the dossier stat —
    # treat a present stat id as supported in that case.
    stat_significant = has_stat and stat.get("significant", True) is not False
    has_citation = bool(cause.get("citations"))
    has_sim = sim.get("mean_lift") is not None
    return {
        "stat": stat_significant,
        "stat_present": has_stat,
        "citation": has_citation,
        "simulated": has_sim,
    }


def groundedness_report(playbook: dict[str, Any] | None) -> dict[str, Any]:
    problems = (playbook or {}).get("problems_and_solutions") or []
    rows = []
    for p in problems:
        if not isinstance(p, dict):
            continue
        checks = _problem_checks(p)
        rows.append({
            "priority": p.get("priority"),
            "title": ((p.get("problem") or {}).get("title") or "")[:120],
            **checks,
            "grounded": checks["stat"] and checks["citation"] and checks["simulated"],
        })

    n = len(rows)

    def rate(key: str) -> float | None:
        return round(sum(1 for r in rows if r[key]) / n, 3) if n else None

    return {
        "problems": n,
        "grounded_rate": rate("grounded"),
        "stat_rate": rate("stat"),
        "citation_rate": rate("citation"),
        "simulation_rate": rate("simulated"),
        "unsupported": [r["title"] for r in rows if not r["grounded"]],
        "rows": rows,
    }
