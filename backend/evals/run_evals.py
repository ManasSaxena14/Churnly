"""
Churnly eval harness.
======================
Two modes, both scored against the planted drivers from evals/synth_data.py.

  stats  (default, free, no API keys)
      Runs the deterministic layer only — ingest → feature engineering
      (CoxPH) → bucket z-tests. Measures driver precision / recall and the
      false-positive rate on pure-noise columns, WITH and WITHOUT
      Benjamini-Hochberg correction. This is the ablation that shows what
      multiple-testing correction buys you.

  full   (needs GOOGLE_API_KEY / GROQ_API_KEY in .env)
      Runs the whole LangGraph pipeline on a few datasets and measures
      root-cause recall, unsupported-cause rate, playbook groundedness, and
      cost / latency per run. `--ablate` reruns each dataset with the z-gate
      removed from the forensic prompt (RETAIN_DISABLE_ZGATE=1).

Usage (from backend/):
    python -m evals.run_evals                       # stats mode, 20 datasets
    python -m evals.run_evals --n 50 --seed 11
    python -m evals.run_evals --mode full --n 3
    python -m evals.run_evals --mode full --n 3 --ablate

Results land in evals/results/ as JSON plus a Markdown table you can paste
into the README.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
import os
import pathlib
import statistics
import sys
import time
from dataclasses import asdict
from typing import Any

BACKEND_ROOT = pathlib.Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from evals.synth_data import (  # noqa: E402
    EXPECTED_COX, EXPECTED_STAT_ID, NOISE_FAMILIES, PLANTABLE, DatasetSpec, make_suite, write_suite,
)

RESULTS_DIR = BACKEND_ROOT / "evals" / "results"
EVALUATED_FAMILIES = PLANTABLE + NOISE_FAMILIES

# Keywords used to decide which family an LLM-written root cause is about.
FAMILY_KEYWORDS = {
    "contract": ("contract", "month-to-month", "monthly contract", "monthly plan", "commitment", "cadence", "annual"),
    "support": ("support", "ticket", "friction", "help desk", "complaint"),
    "usage": ("usage", "login", "engagement", "inactive", "activity", "low use", "dormant"),
    "plan_tier": ("plan tier", "tier", "premium", "basic plan", "standard plan", "pricing"),
    "channel": ("channel", "acquisition", "paid ads", "organic", "referral", "outbound", "partner"),
    "tenure": ("tenure", "onboarding", "first 30", "first 90", "early-life", "new customer", "month 1"),
}


@contextlib.contextmanager
def env(**overrides: str | None):
    old = {k: os.environ.get(k) for k in overrides}
    try:
        for k, v in overrides.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        yield
    finally:
        for k, v in old.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v


# ── Stats mode ───────────────────────────────────────────────────────────

def _deterministic_layer(csv_path: pathlib.Path) -> dict[str, Any]:
    """ingest → feature engineering → bucket stats. Zero LLM calls."""
    import duckdb

    from app.graph.nodes.feature_engineering import feature_engineering_node
    from app.graph.nodes.input_ingest import input_ingest_node
    from app.graph.utils import get_churn_column
    from app.stats import compute_bucket_stats

    state: dict[str, Any] = {"raw_csv_path": str(csv_path), "questionnaire": {}, "errors": []}
    state.update(input_ingest_node(state))
    state.update(feature_engineering_node(state))
    df = duckdb.connect(":memory:").execute(f"SELECT * FROM read_csv_auto('{state['raw_csv_path']}')").df()
    detected = state["input_context"]["detected_columns"]
    stats = compute_bucket_stats(df, get_churn_column(df), detected)
    drivers = (state["feature_store"].get("predictive_churn_risk") or {}).get("driver_features", [])
    return {"stats": stats, "drivers": drivers, "detected": detected}


_FAMILY_BUCKET = {
    "contract": "churn_by_contract",
    "support": "churn_by_support_volume",
    "usage": "churn_by_usage_decile",
    "plan_tier": "churn_by_plan_tier",
    "channel": "churn_by_channel",
}


def score_stats(spec: DatasetSpec, layer: dict[str, Any]) -> dict[str, Any]:
    stats, drivers = layer["stats"], layer["drivers"]
    overall = stats.get("churn_rate", 0)
    per_family: dict[str, dict[str, Any]] = {}
    for fam in EVALUATED_FAMILIES:
        bucket = stats.get(_FAMILY_BUCKET[fam]) or {}
        sig = [lbl for lbl, p in bucket.items() if isinstance(p, dict) and p.get("significant")]
        planted = fam in spec.planted
        correct_bucket = False
        if planted:
            exp_label = EXPECTED_STAT_ID[fam].split("::", 1)[1]
            exp = bucket.get(exp_label) or {}
            correct_bucket = bool(exp.get("significant")) and exp.get("churn_rate", 0) > overall
        cox_hit = False
        if fam in EXPECTED_COX:
            prefix, direction = EXPECTED_COX[fam]
            cox_hit = any(
                d["feature"].startswith(prefix) and d.get("significant") and d.get("direction") == direction
                for d in drivers
            )
        per_family[fam] = {
            "planted": planted,
            "detected": bool(sig),
            "significant_buckets": sig,
            "correct_bucket": correct_bucket,
            "cox_detected": cox_hit,
        }
    summary = stats.get("significance_summary", {})
    return {"dataset": spec.name, "n_rows": spec.n_rows, "planted": spec.planted,
            "families": per_family, "significance_summary": summary}


def aggregate_stats(rows: list[dict[str, Any]]) -> dict[str, Any]:
    tp = fp = fn = tn = 0
    correct = planted_total = 0
    noise_datasets_with_fp = 0
    cox_tp = cox_planted = 0
    for r in rows:
        noise_fp_here = False
        for fam, f in r["families"].items():
            if f["planted"]:
                planted_total += 1
                correct += int(f["correct_bucket"])
                tp += int(f["detected"])
                fn += int(not f["detected"])
                if fam in EXPECTED_COX:
                    cox_planted += 1
                    cox_tp += int(f["cox_detected"])
            else:
                fp += int(f["detected"])
                tn += int(not f["detected"])
                if f["detected"] and fam in NOISE_FAMILIES:
                    noise_fp_here = True
        noise_datasets_with_fp += int(noise_fp_here)

    def ratio(a: int, b: int) -> float | None:
        return round(a / b, 3) if b else None

    return {
        "datasets": len(rows),
        "driver_precision": ratio(tp, tp + fp),
        "driver_recall": ratio(tp, tp + fn),
        "correct_bucket_rate": ratio(correct, planted_total),
        "false_positive_rate": ratio(fp, fp + tn),
        "noise_false_alarm_datasets": ratio(noise_datasets_with_fp, len(rows)),
        "cox_driver_recall": ratio(cox_tp, cox_planted),
        "counts": {"tp": tp, "fp": fp, "fn": fn, "tn": tn},
    }


def run_stats_mode(specs: list[DatasetSpec], data_dir: pathlib.Path) -> dict[str, Any]:
    results: dict[str, Any] = {}
    for mode in ("bh", "none"):
        rows = []
        with env(RETAIN_MULTIPLE_TESTING=mode):
            for spec in specs:
                layer = _deterministic_layer(data_dir / f"{spec.name}.csv")
                rows.append(score_stats(spec, layer))
        results[mode] = {"summary": aggregate_stats(rows), "rows": rows}
        print(f"[stats:{mode}] {json.dumps(results[mode]['summary'])}", flush=True)
    return results


# ── Full mode ────────────────────────────────────────────────────────────

def _families_in(text: str) -> set[str]:
    t = (text or "").lower()
    return {fam for fam, kws in FAMILY_KEYWORDS.items() if any(k in t for k in kws)}


EVAL_QUESTIONNAIRE = {
    "business_context": "Subscription SaaS with three plan tiers and three contract cadences.",
    "business_model": "B2B SaaS",
    "goal": "Reduce churn rate",
    "priority_segment": "All customers equally",
    "churn_definition": "Cancelled paid subscription",
    "competitors": [],
    "churn_destination": "We don't know",
    "top_channels": [],
    "edge_cases": [],
    "retention_tactics": [],
    "timeline": "90-day plan",
    "analysis_depth": "quick",
}


async def _run_graph(csv_path: pathlib.Path, job_id: str) -> dict[str, Any]:
    from app.graph.builder import build_retention_graph

    graph = build_retention_graph()
    state = {
        "raw_csv_path": str(csv_path),
        "questionnaire": dict(EVAL_QUESTIONNAIRE),
        "job_id": job_id,
        "iteration_count": 0, "discovery_attempts": 0, "retry_count": 0, "errors": [],
    }
    # No active stream for this job id → adaptive_hitl skips the human wait.
    return await graph.ainvoke(state, config={"configurable": {"job_id": job_id}})


def score_full(spec: DatasetSpec, final: dict[str, Any], metrics: dict[str, Any], seconds: float) -> dict[str, Any]:
    from app.quality import groundedness_report

    forensic = final.get("forensic_detective_output", {}) or {}
    causes = forensic.get("suspected_causes", []) or []
    stats = forensic.get("statistical_evidence", {}) or {}
    sig_families = set()
    for fam, key in {**_FAMILY_BUCKET, "tenure": "churn_rate_by_tenure_bucket"}.items():
        bucket = stats.get(key) or {}
        if any(isinstance(p, dict) and p.get("significant") for p in bucket.values()):
            sig_families.add(fam)

    cause_families = [(_families_in(c), c) for c in causes]
    found = set().union(*[f for f, _ in cause_families]) if cause_families else set()
    planted = set(spec.planted)
    unsupported = [c for fams, c in cause_families if not (fams & sig_families)]
    ground = groundedness_report(final.get("final_playbook") or {})
    return {
        "dataset": spec.name,
        "planted": spec.planted,
        "causes": causes,
        "cause_recall": round(len(planted & found) / len(planted), 3) if planted else None,
        "noise_cause_mentions": sorted(found & set(NOISE_FAMILIES)),
        "unsupported_causes": unsupported,
        "unsupported_rate": round(len(unsupported) / len(causes), 3) if causes else None,
        "groundedness": {k: v for k, v in ground.items() if k != "rows"},
        "seconds": round(seconds, 1),
        "metrics": {k: metrics.get(k) for k in (
            "llm_calls", "total_tokens", "cost_usd", "latency_p50_s", "latency_p95_s", "fallbacks_used", "llm_failures",
        )},
        "errors": final.get("errors", []),
    }


def _mean(xs: list[float | None]) -> float | None:
    vals = [x for x in xs if x is not None]
    return round(statistics.mean(vals), 3) if vals else None


def run_full_mode(specs: list[DatasetSpec], data_dir: pathlib.Path, ablate: bool) -> dict[str, Any]:
    from app import observability as obs

    configs = {"zgate_on": {"RETAIN_DISABLE_ZGATE": None}}
    if ablate:
        configs["zgate_off"] = {"RETAIN_DISABLE_ZGATE": "1"}

    out: dict[str, Any] = {}
    for name, overrides in configs.items():
        rows = []
        with env(**overrides):
            for spec in specs:
                job_id = f"eval-{name}-{spec.name}-{int(time.time())}"
                t0 = time.time()
                try:
                    final = asyncio.run(_run_graph(data_dir / f"{spec.name}.csv", job_id))
                except Exception as e:
                    print(f"[full:{name}] {spec.name} failed: {type(e).__name__}: {e}", flush=True)
                    continue
                rows.append(score_full(spec, final, obs.snapshot(job_id), time.time() - t0))
                obs.drop(job_id)
                print(f"[full:{name}] {spec.name}: recall={rows[-1]['cause_recall']} "
                      f"unsupported={rows[-1]['unsupported_rate']} "
                      f"grounded={rows[-1]['groundedness'].get('grounded_rate')}", flush=True)
        secs = sorted(r["seconds"] for r in rows)
        out[name] = {
            "summary": {
                "runs": len(rows),
                "cause_recall": _mean([r["cause_recall"] for r in rows]),
                "unsupported_cause_rate": _mean([r["unsupported_rate"] for r in rows]),
                "grounded_rate": _mean([r["groundedness"].get("grounded_rate") for r in rows]),
                "p50_seconds": secs[len(secs) // 2] if secs else None,
                "p95_seconds": secs[min(len(secs) - 1, int(round(0.95 * (len(secs) - 1))))] if secs else None,
                "mean_tokens": _mean([r["metrics"]["total_tokens"] for r in rows]),
                "mean_cost_usd": _mean([r["metrics"]["cost_usd"] for r in rows]),
            },
            "rows": rows,
        }
    return out


# ── Reporting ────────────────────────────────────────────────────────────

def _fmt(v: Any, pct: bool = True) -> str:
    if v is None:
        return "—"
    if pct and isinstance(v, float) and v <= 1:
        return f"{v * 100:.1f}%"
    return str(v)


def markdown_report(mode: str, results: dict[str, Any], meta: dict[str, Any]) -> str:
    lines = [f"# Churnly eval — {mode} mode", "",
             f"Datasets: {meta['n']} synthetic (seed {meta['seed']}), planted drivers per evals/synth_data.py.", ""]
    if mode == "stats":
        bh, raw = results["bh"]["summary"], results["none"]["summary"]
        lines += [
            "| Metric | With BH correction | Raw p < 0.05 |",
            "|---|---|---|",
            f"| Driver recall | {_fmt(bh['driver_recall'])} | {_fmt(raw['driver_recall'])} |",
            f"| Driver precision | {_fmt(bh['driver_precision'])} | {_fmt(raw['driver_precision'])} |",
            f"| Correct bucket flagged | {_fmt(bh['correct_bucket_rate'])} | {_fmt(raw['correct_bucket_rate'])} |",
            f"| False-positive rate (unplanted families) | {_fmt(bh['false_positive_rate'])} | {_fmt(raw['false_positive_rate'])} |",
            f"| Datasets with a false alarm on pure-noise columns | {_fmt(bh['noise_false_alarm_datasets'])} | {_fmt(raw['noise_false_alarm_datasets'])} |",
            f"| CoxPH driver recall | {_fmt(bh['cox_driver_recall'])} | {_fmt(raw['cox_driver_recall'])} |",
        ]
    else:
        cols = list(results.keys())
        lines += ["| Metric | " + " | ".join(cols) + " |", "|---" * (len(cols) + 1) + "|"]
        for key, label in (
            ("cause_recall", "Root-cause recall"),
            ("unsupported_cause_rate", "Unsupported-cause rate"),
            ("grounded_rate", "Playbook groundedness"),
            ("p50_seconds", "p50 run time (s)"),
            ("p95_seconds", "p95 run time (s)"),
            ("mean_tokens", "Mean tokens / run"),
            ("mean_cost_usd", "Mean cost / run (USD)"),
        ):
            pct = key in ("cause_recall", "unsupported_cause_rate", "grounded_rate")
            lines.append(f"| {label} | " + " | ".join(_fmt(results[c]["summary"][key], pct) for c in cols) + " |")
    lines += ["", f"_Generated {time.strftime('%Y-%m-%d %H:%M')}_", ""]
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mode", choices=("stats", "full"), default="stats")
    ap.add_argument("--n", type=int, default=None, help="datasets (default 20 stats / 3 full)")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--ablate", action="store_true", help="full mode: also run with the z-gate disabled")
    ap.add_argument("--data-dir", default=str(BACKEND_ROOT / "evals" / "datasets"))
    args = ap.parse_args()

    n = args.n or (20 if args.mode == "stats" else 3)
    specs = make_suite(n, args.seed)
    data_dir = pathlib.Path(args.data_dir)
    write_suite(data_dir, specs)

    if args.mode == "stats":
        results = run_stats_mode(specs, data_dir)
    else:
        results = run_full_mode(specs, data_dir, args.ablate)

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    meta = {"mode": args.mode, "n": n, "seed": args.seed, "specs": [asdict(s) for s in specs]}
    (RESULTS_DIR / f"{args.mode}-{stamp}.json").write_text(json.dumps({"meta": meta, "results": results}, indent=2, default=str))
    report = markdown_report(args.mode, results, meta)
    (RESULTS_DIR / f"{args.mode}-latest.md").write_text(report)
    print("\n" + report)


if __name__ == "__main__":
    main()
