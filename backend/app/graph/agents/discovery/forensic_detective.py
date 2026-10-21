"""
Discovery Agent: Forensic Detective
=====================================
Investigates data anomalies and traces root causes.
Called by: forensic_detective_node (parallel with pattern_matcher, fan-in at diagnosis_merge)
"""

from __future__ import annotations

import contextvars
import os
import re
from concurrent.futures import ThreadPoolExecutor
from typing import Any, List, Dict, Tuple
from pydantic import BaseModel, Field
from app.graph.utils import get_churn_column, safe_llm_invoke
from app.config import get_llm, gemini_model
from langchain_core.prompts import ChatPromptTemplate
from app.graph.state import RetentionGraphState
from app.rag.store import retrieve as rag_retrieve
from app.rag.hyde import hypothetical_segment_answer
from app.graph.stream_utils import push_progress
from app.stats import compute_bucket_stats


# Self-consistency: run the candidate-cause prompt this many times, at these temps.
# Causes appearing in >= SELF_CONSISTENCY_VOTE_THRESHOLD runs survive the vote.
SELF_CONSISTENCY_TEMPS: List[float] = [0.2, 0.5, 0.7]
SELF_CONSISTENCY_VOTE_THRESHOLD: int = 2


class DetectiveResult(BaseModel):
    suspected_causes: List[str]
    confidence_scores: Dict[str, float]
    citations: Dict[str, List[str]] = Field(default_factory=dict)


def _normalize_cause(s: str) -> str:
    """Lowercase + strip punctuation + collapse whitespace, for cross-run cause matching."""
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", (s or "").lower())).strip()


def _aggregate_detective_runs(
    runs: List[DetectiveResult],
    temps: List[float] | None = None,
    vote_threshold: int | None = None,
) -> Tuple[List[str], Dict[str, float], Dict[str, List[str]], Dict[str, Any]]:
    """Vote causes across self-consistency runs.

    Winner = cause whose normalized text appears in >= vote_threshold runs.
    Canonical phrasing = phrasing from the highest-confidence run that produced it.
    Confidence = mean over runs that produced it. Citations = union across runs.
    Falls back to top-3 by max-confidence if vote yields nothing (e.g. only 1 run survived).
    """
    temps = temps if temps is not None else SELF_CONSISTENCY_TEMPS
    vote_threshold = vote_threshold if vote_threshold is not None else SELF_CONSISTENCY_VOTE_THRESHOLD
    norm_to_records: Dict[str, List[Tuple[str, float, List[str]]]] = {}
    for run in runs:
        for cause in run.suspected_causes:
            norm = _normalize_cause(cause)
            if not norm:
                continue
            conf = float(run.confidence_scores.get(cause, 0.0) or 0.0)
            cites = list(run.citations.get(cause, []) or [])
            norm_to_records.setdefault(norm, []).append((cause, conf, cites))

    voted = [
        (norm, recs) for norm, recs in norm_to_records.items()
        if len(recs) >= vote_threshold
    ]
    fallback_used = False
    if voted:
        # rank by vote count desc, then mean conf desc
        voted.sort(key=lambda kv: (-len(kv[1]), -(sum(r[1] for r in kv[1]) / len(kv[1]))))
        chosen = voted
    else:
        fallback_used = True
        chosen = sorted(
            norm_to_records.items(),
            key=lambda kv: -max((r[1] for r in kv[1]), default=0.0),
        )[:3]

    causes_out: List[str] = []
    conf_out: Dict[str, float] = {}
    cite_out: Dict[str, List[str]] = {}
    vote_meta: List[Dict[str, Any]] = []
    for norm, recs in chosen[:3]:
        canonical = max(recs, key=lambda r: r[1])[0]
        causes_out.append(canonical)
        conf_out[canonical] = round(sum(r[1] for r in recs) / len(recs), 3)
        merged_cites: set[str] = set()
        for _, _, cites in recs:
            merged_cites.update(cites)
        cite_out[canonical] = sorted(merged_cites)
        vote_meta.append({
            "cause": canonical,
            "votes": len(recs),
            "mean_confidence": conf_out[canonical],
            "phrasings": [r[0] for r in recs],
        })

    metadata = {
        "runs_total": len(runs),
        "runs_temps": temps[: len(runs)],
        "vote_threshold": vote_threshold,
        "fallback_used": fallback_used,
        "votes": vote_meta,
    }
    return causes_out, conf_out, cite_out, metadata


def _extract_rates(bucket_dict: dict) -> List[float]:
    """Extract churn_rate floats from a {label: {churn_rate, size}} mapping."""
    rates = []
    for v in (bucket_dict or {}).values():
        if isinstance(v, dict) and "churn_rate" in v:
            rates.append(float(v["churn_rate"]))
        elif isinstance(v, (int, float)):
            rates.append(float(v))
    return rates


def _derive_signals(stats: dict, behavior_curves: dict) -> List[str]:
    """Translate detected data patterns into RAG signal tags."""
    signals: List[str] = []

    churn_rate = stats.get("churn_rate", 0) or 0
    if churn_rate > 0.25:
        signals.append("high_churn")

    channel_rates = _extract_rates(stats.get("churn_by_channel"))
    if channel_rates and (max(channel_rates) - min(channel_rates)) > 0.15:
        signals.extend(["channel_churn", "channel_variance", "bad_fit"])

    if stats.get("churn_by_integration"):
        signals.extend(["low_integration", "integration_failure", "b2b_churn"])

    plan_rates = _extract_rates(stats.get("churn_by_plan_tier"))
    if plan_rates and (max(plan_rates) - min(plan_rates)) > 0.15:
        signals.extend(["plan_tier_churn", "price_sensitivity"])

    contract_rates = _extract_rates(stats.get("churn_by_contract"))
    if contract_rates and (max(contract_rates) - min(contract_rates)) > 0.15:
        signals.extend(["contract_cadence_churn", "commitment_gap", "price_sensitivity"])

    support_buckets = stats.get("churn_by_support_volume", {}) or {}
    high_support = support_buckets.get("high_4_plus", {})
    no_support = support_buckets.get("none_0", {})
    if isinstance(high_support, dict) and isinstance(no_support, dict):
        if (high_support.get("churn_rate", 0) - no_support.get("churn_rate", 0)) > 0.1:
            signals.extend(["high_support_volume", "early_friction"])

    usage_buckets = stats.get("churn_by_usage_decile", {}) or {}
    low_usage = usage_buckets.get("q1_lowest", {})
    high_usage = usage_buckets.get("q4_highest", {})
    if isinstance(low_usage, dict) and isinstance(high_usage, dict):
        if (low_usage.get("churn_rate", 0) - high_usage.get("churn_rate", 0)) > 0.15:
            signals.extend(["engagement_decay", "low_usage", "shallow_engagement"])

    tenure_buckets = stats.get("churn_rate_by_tenure_bucket", {}) or {}
    early_bucket = tenure_buckets.get("0_1mo", {})
    if isinstance(early_bucket, dict) and early_bucket.get("churn_rate", 0) > 0.15:
        signals.extend(["30_day_cliff", "onboarding_friction"])

    median = behavior_curves.get("median_survival_time")
    max_tenure = behavior_curves.get("max_tenure", 0) or 0
    if median and max_tenure:
        if median <= 3:
            signals.extend(["short_tenure_churn", "30_day_cliff", "onboarding_friction"])
        elif median <= 9:
            signals.extend(["mid_tenure_churn", "90_day_cliff", "engagement_decay"])
        else:
            signals.append("long_tenure_churn")

    milestones = behavior_curves.get("milestone_retention", {}) or {}
    if milestones.get("month_1") is not None and milestones["month_1"] < 0.85:
        signals.append("new_user_drop_off")

    return list(dict.fromkeys(signals))  # dedupe, preserve order

def zgate_enabled() -> bool:
    """Ablation switch: RETAIN_DISABLE_ZGATE=1 hides significance from the prompt."""
    return (os.getenv("RETAIN_DISABLE_ZGATE") or "").strip().lower() not in ("1", "true", "yes")


_PROMPT_BUCKET_KEYS_GATED = ("churn_rate", "size", "churned", "p_adj", "significant")
_PROMPT_BUCKET_KEYS_UNGATED = ("churn_rate", "size", "churned")


def _prompt_view(bucket: dict, gated: bool) -> dict:
    """Compact bucket payloads for the prompt (drops raw p / ids to save tokens)."""
    keys = _PROMPT_BUCKET_KEYS_GATED if gated else _PROMPT_BUCKET_KEYS_UNGATED
    out = {}
    for label, payload in (bucket or {}).items():
        if isinstance(payload, dict):
            out[label] = {k: payload[k] for k in keys if k in payload}
    return out


_GATE_INSTRUCTION = (
    "Each bucket = {churn_rate, size, churned, p_adj, significant}. `p_adj` is a\n"
    "two-proportion z-test (bucket vs rest) after Benjamini-Hochberg correction across\n"
    "every bucket; `significant` means p_adj<0.05. Do NOT build a cause primarily on a\n"
    "bucket with significant=false — treat those as noise."
)
_NO_GATE_INSTRUCTION = "Each bucket = {churn_rate, size, churned}."


def run_forensic_detective(state: RetentionGraphState, job_id: str | None = None) -> dict[str, Any]:
    """Deep forensic investigation of retention patterns.

    `job_id` is optional — when present, interim `forensic_progress` SSE events
    are emitted between self-consistency runs so the UI can show "run 2/3 done"
    instead of a 30s frozen-looking stage.
    """
    stats: dict[str, Any] | None = None
    try:
        import duckdb

        raw_csv_path = state.get("raw_csv_path", "")
        q = state.get("questionnaire", {})

        # Load CSV for actual statistical analysis
        conn = duckdb.connect(":memory:")
        df = conn.execute(f"SELECT * FROM read_csv_auto('{raw_csv_path}')").df()

        # Calculate actual statistics from data (z-tested + BH-corrected in app.stats)
        # Detected columns from input_ingest (user-confirmed when available)
        input_context = state.get("input_context", {}) or {}
        detected = input_context.get("detected_columns", {}) or {}
        churn_col = detected.get("churn") or get_churn_column(df)
        stats = compute_bucket_stats(df, churn_col, detected)

        # Pull CoxPH driver features computed in feature_engineering — biggest depth win
        feature_store = state.get("feature_store", {}) or {}
        driver_features = (feature_store.get("predictive_churn_risk", {}) or {}).get("driver_features", []) or []
        stats["feature_count_used"] = len(driver_features)

        # Build signals + initial broad RAG retrieval.
        # F13: HyDE — embed a hypothetical answer for the priority segment instead of a
        # bare keyword query. Retrieval quality jumps because the embedding lands closer
        # to actual framework chunks than the signal-tag list does.
        behavior_curves = state.get("behavior_curves", {}) or {}
        signals = _derive_signals(stats, behavior_curves)
        priority_segment = q.get("priority_segment", "all users")
        industry = q.get("business_context", q.get("industry", "SaaS"))
        business_model = q.get("business_model", "SaaS")
        hyde_answer = hypothetical_segment_answer(priority_segment, industry, business_model)
        broad_query = (
            f"{hyde_answer}\n\nObserved patterns: {', '.join(signals) or 'general churn'}. "
            f"Churn rate {stats['churn_rate']:.1%}. "
            f"Median survival {behavior_curves.get('median_survival_time')}."
        )
        broad_retrieved = rag_retrieve(broad_query, k=6, signals=signals)
        broad_evidence_block = "\n\n".join(
            f"[{i+1}] Source: {c['source']} (id: {c['id']}, topic: {c['topic']})\n{c['text']}"
            for i, c in enumerate(broad_retrieved)
        ) or "(no retrieved frameworks — reason from stats alone)"

        # Format CoxPH drivers for prompt — quantitative anchor for each cause
        if driver_features:
            drivers_str = "\n".join(
                f"- {d['feature']}: hazard_ratio={d['hazard_ratio']} (coef={d['coef']}, p={d['p_value']}, "
                f"direction={d['direction']}{', significant' if d.get('significant') else ''})"
                for d in driver_features
            )
        else:
            drivers_str = "(no CoxPH driver features available)"

        import json

        # ── Pass 1: Generate candidate causes with broad evidence (self-consistency) ─
        candidate_prompt = ChatPromptTemplate.from_template(
            """You are a retention analyst for a {business_model} company. Diagnose the 3 most likely root causes of churn, ranked by evidence strength.

── Business context ──
Goal: {goal}
Priority segment: {priority_segment}
Named competitors: {competitors}
Churn destination: {churn_destination}
Churn definition used by this business: {churn_definition}
Top acquisition channels (self-reported): {top_channels}
Analyst notes / caveats (ground truth — these may invalidate naive readings of the stats): {edge_cases}

── Dataset statistics ──
{gate_instruction}
Overall Churn Rate: {churn_rate}
Churn by Acquisition Channel: {churn_by_channel}
Churn by Integration Status: {churn_by_integration}
Churn by Plan Tier: {churn_by_plan_tier}
Churn by Contract Cadence: {churn_by_contract}
Churn by Support Ticket Volume: {churn_by_support_volume}
Churn by Usage Decile: {churn_by_usage_decile}
Churn Rate by Tenure Bucket: {churn_rate_by_tenure_bucket}
Time-to-Churn Distribution: {time_to_churn_distribution}
Detected Signals: {signals}

── CoxPH Driver Features (quantitative hazard ratios) ──
{drivers_str}

── Retrieved retention frameworks (broad sweep) ──
{evidence_block}

Requirements:
- Each suspected cause must be a concrete, specific phrase (not "users churn"; instead "users on Starter plan with <2 integrations churn at 38% by month 3").
- Reference the highest-signal numeric evidence — CoxPH hazard ratio, tenure-bucket cliff, support-volume jump.
- If churn_destination names a competitor, weight a "losing to {{competitor}}" hypothesis accordingly.
- Bias causes toward the priority segment when its tenure window matches the data signal.
- Reference frameworks by source id in citations map (e.g., {{"cause text": ["reforge_aha_001"]}}).
- Confidence in [0.7, 1.0]."""
        )

        competitors_val = q.get("competitors", [])
        competitors_str = ", ".join(competitors_val) if isinstance(competitors_val, list) else str(competitors_val or "")

        edge_cases_val = q.get("edge_cases", []) or []
        edge_cases_str = " | ".join(str(e) for e in edge_cases_val) if isinstance(edge_cases_val, list) else str(edge_cases_val)
        top_channels_val = q.get("top_channels", []) or []
        top_channels_str = ", ".join(top_channels_val) if isinstance(top_channels_val, list) else str(top_channels_val)

        gated = zgate_enabled()
        formatted_prompt = candidate_prompt.format(
            gate_instruction=_GATE_INSTRUCTION if gated else _NO_GATE_INSTRUCTION,
            business_model=q.get("business_model", "SaaS"),
            goal=q.get("goal", "Reduce churn"),
            priority_segment=q.get("priority_segment", "all users"),
            competitors=competitors_str or "None named",
            churn_destination=q.get("churn_destination", "Unknown"),
            churn_definition=q.get("churn_definition", "Not specified"),
            top_channels=top_channels_str or "Not specified",
            edge_cases=edge_cases_str or "None",
            churn_rate=f"{stats['churn_rate']:.1%}",
            churn_by_channel=json.dumps(_prompt_view(stats["churn_by_channel"], gated)),
            churn_by_integration=json.dumps(_prompt_view(stats["churn_by_integration"], gated)),
            churn_by_plan_tier=json.dumps(_prompt_view(stats["churn_by_plan_tier"], gated)),
            churn_by_contract=json.dumps(_prompt_view(stats["churn_by_contract"], gated)),
            churn_by_support_volume=json.dumps(_prompt_view(stats["churn_by_support_volume"], gated)),
            churn_by_usage_decile=json.dumps(_prompt_view(stats["churn_by_usage_decile"], gated)),
            churn_rate_by_tenure_bucket=json.dumps(_prompt_view(stats["churn_rate_by_tenure_bucket"], gated)),
            time_to_churn_distribution=json.dumps(stats["time_to_churn_distribution"]),
            signals=", ".join(signals) or "none",
            drivers_str=drivers_str,
            evidence_block=broad_evidence_block,
        )

        # Self-consistency: parallel runs at different temps, vote on recurring causes.
        # Depth mode controls cost: quick = 1 run (no vote), deep = 3 runs w/ 2/3 vote.
        # Runs fire in parallel via ThreadPoolExecutor — each call uses a different Gemini
        # key (round-robin in get_llm) so concurrent requests hit different slots.
        depth = q.get("analysis_depth")
        sc_temps = SELF_CONSISTENCY_TEMPS if (depth or "").lower() == "deep" else [0.3]
        sc_vote_threshold = SELF_CONSISTENCY_VOTE_THRESHOLD if len(sc_temps) >= 2 else 1
        forensic_model = gemini_model(depth, deep_call=True)

        runs: List[DetectiveResult] = []
        run_errors: List[str] = []
        total_runs = len(sc_temps)

        def _run_one(idx_temp: Tuple[int, float]) -> Tuple[int, float, DetectiveResult | None, str | None]:
            idx, t = idx_temp
            push_progress(job_id, "forensic_progress", {
                "run": idx, "total": total_runs, "temp": t, "status": "started",
            })
            try:
                llm_t = get_llm("gemini", model=forensic_model, temperature=t)
                resp = safe_llm_invoke(
                    llm_t, DetectiveResult, formatted_prompt,
                    agent_name=f"ForensicDetective(t={t})",
                )
                push_progress(job_id, "forensic_progress", {
                    "run": idx, "total": total_runs, "temp": t,
                    "status": "completed", "causes_found": len(resp.suspected_causes),
                })
                return idx, t, resp, None
            except Exception as run_err:
                push_progress(job_id, "forensic_progress", {
                    "run": idx, "total": total_runs, "temp": t,
                    "status": "failed", "error": str(run_err)[:120],
                })
                return idx, t, None, f"temp={t}: {run_err}"

        # Copy the caller's contextvars (job id / node for run metrics) into each
        # worker — threads don't inherit them automatically.
        parent_ctx = contextvars.copy_context()
        with ThreadPoolExecutor(max_workers=total_runs) as pool:
            results = list(pool.map(
                lambda item: parent_ctx.copy().run(_run_one, item),
                list(enumerate(sc_temps, start=1)),
            ))

        # Preserve deterministic order (sorted by run idx) for downstream voting.
        for idx, t, resp, err in sorted(results, key=lambda r: r[0]):
            if resp is not None:
                runs.append(resp)
            if err is not None:
                run_errors.append(err)

        if not runs:
            raise RuntimeError(
                "All self-consistency runs failed: " + " | ".join(run_errors)
            )

        candidate_causes, candidate_conf, candidate_citations, consensus_metadata = (
            _aggregate_detective_runs(runs, temps=sc_temps, vote_threshold=sc_vote_threshold)
        )
        if run_errors:
            consensus_metadata["partial_failures"] = run_errors

        # ── Pass 2: Per-cause RAG — each cause gets its own focused retrieval ──
        per_cause_evidence: Dict[str, List[dict]] = {}
        all_cause_sources: List[dict] = list(broad_retrieved)
        seen_ids = {c["id"] for c in broad_retrieved}
        for cause in candidate_causes[:3]:
            cause_query = f"Specific intervention frameworks and root cause patterns for: {cause}. Industry: {q.get('business_model', 'SaaS')}."
            cause_hits = rag_retrieve(cause_query, k=3, signals=signals)
            per_cause_evidence[cause] = [
                {"id": c["id"], "source": c["source"], "topic": c["topic"], "score": c["score"]}
                for c in cause_hits
            ]
            for c in cause_hits:
                if c["id"] not in seen_ids:
                    all_cause_sources.append(c)
                    seen_ids.add(c["id"])

        # Merge citations — per-cause retrieval supplements LLM-self-cited ones
        merged_citations: Dict[str, List[str]] = {}
        for cause in candidate_causes:
            ids = set()
            for cited_id in candidate_citations.get(cause, []) or []:
                ids.add(cited_id)
            for hit in per_cause_evidence.get(cause, []):
                ids.add(hit["id"])
            merged_citations[cause] = sorted(ids)

        return {
            "agent": "forensic_detective",
            "suspected_causes": candidate_causes,
            "confidence_scores": candidate_conf,
            "citations": merged_citations,
            "per_cause_evidence": per_cause_evidence,
            "retrieved_sources": [
                {"id": c["id"], "source": c["source"], "topic": c["topic"], "score": c["score"]}
                for c in all_cause_sources
            ],
            "statistical_evidence": stats,
            "driver_features": driver_features,
            "consensus_metadata": consensus_metadata,
            "zgate_enabled": gated,
            "hyde_answer": hyde_answer,
            "analysis_depth": "high",
        }

    except Exception as e:
        # Keep the pure-math stats even when the LLM part fails — the segment
        # table and evidence dossier still have real numbers to show.
        out: dict[str, Any] = {"agent": "forensic_detective", "error": str(e)}
        if stats is not None:
            out["statistical_evidence"] = stats
        return out
