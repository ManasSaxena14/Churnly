"""
"Ask your data" copilot.
=========================
A tool-calling agent scoped to ONE finished run. It can only answer from:
  run_sql            read-only SQL on the run's customer table
  segment_stats      the z-tested, BH-corrected bucket stats (with stat_ids)
  churn_drivers      CoxPH hazard ratios
  risk_summary       per-customer risk tiers and the riskiest customers
  simulate_scenario  the what-if lab
  playbook           the run's final playbook
Every claim must cite a stat_id or a tool result; citations are checked
against the real stat_ids and unknown ones are reported back as unverified.

`ask_copilot` is a generator of UI events, so the API can stream the agent's
steps (tool calls, results) and then the answer.
"""

from __future__ import annotations

import os

import json
import re
from typing import Any, Iterator

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from app.analytics.dataset import RunDataset
from app.copilot.sql import SqlRejected, run_readonly_sql
from app.stats import compute_bucket_stats

MAX_STEPS = 6
_CITE_RE = re.compile(r"\[([a-z_]+::[^\]]+)\]")


class _SqlArgs(BaseModel):
    query: str = Field(description="One DuckDB SELECT over the table `customers`.")


class _FamilyArgs(BaseModel):
    family: str | None = Field(default=None, description="Optional: contract, plan_tier, support, usage, channel, tenure, integration.")


class _HorizonArgs(BaseModel):
    horizon: float = Field(default=3, description="Periods ahead (same unit as tenure).")


class _Lever(BaseModel):
    kind: str = Field(description="shift | scale | cap")
    column: str
    from_: str | None = Field(default=None, alias="from")
    to: str | None = None
    share: float | None = None
    factor: float | None = None
    max: float | None = None


class _ScenarioArgs(BaseModel):
    levers: list[_Lever]
    horizon: float = 3


def _schema(ds: RunDataset) -> str:
    roles = {v: k for k, v in ds.detected.items() if v}
    lines = []
    for c in ds.df.columns:
        s = ds.df[c]
        kind = "number" if str(s.dtype) not in ("object", "string", "category") else "text"
        sample = ", ".join(str(v) for v in s.dropna().unique()[:4])
        role = f" — role: {roles[c]}" if c in roles else ""
        lines.append(f'  "{c}" ({kind}{role}) e.g. {sample}')
    return "\n".join(lines)


def _run_context(ds: RunDataset) -> str:
    ev = {e.get("type"): e.get("data") or {} for e in ds.run.get("events", []) if e.get("type") != "run_metrics"}
    dx = ev.get("diagnosis_ready", {})
    pb = (ev.get("solution_ready", {}) or {}).get("final_playbook") or {}
    causes = [h.get("hypothesis") for h in dx.get("merged_hypotheses") or []][:3]
    problems = [p.get("problem", {}).get("title") for p in pb.get("problems_and_solutions") or []][:3]
    return json.dumps({"diagnosed_causes": causes, "playbook_problems": problems}, default=str)


def build_tools(ds: RunDataset) -> tuple[list[StructuredTool], set[str]]:
    from app.analytics.risk import risk_report
    from app.analytics.whatif import run_scenario

    stats = compute_bucket_stats(ds.df, ds.churn_col, ds.detected)
    stat_ids: set[str] = set()
    flat: list[dict[str, Any]] = []
    for fam, bucket in stats.items():
        if isinstance(bucket, dict):
            for p in bucket.values():
                if isinstance(p, dict) and "stat_id" in p:
                    stat_ids.add(p["stat_id"])
                    flat.append({k: p.get(k) for k in ("stat_id", "churn_rate", "size", "p_adj", "significant")})

    def run_sql(query: str) -> str:
        try:
            return json.dumps(run_readonly_sql(ds.df, query))
        except SqlRejected as e:
            return json.dumps({"error": str(e)})

    def segment_stats(family: str | None = None) -> str:
        rows = [r for r in flat if not family or r["stat_id"].startswith(f"{family}::")]
        return json.dumps({"overall_churn_rate": stats.get("churn_rate"), "segments": rows,
                           "note": "significant = BH-adjusted p < 0.05; cite as [stat_id]"})

    def churn_drivers() -> str:
        m = ds.model
        if m is None:
            return json.dumps({"error": "no survival model for this dataset"})
        s = m.cph.summary
        rows = [{"feature": f, "hazard_ratio": round(float(r["exp(coef)"]), 3), "p": round(float(r["p"]), 4)}
                for f, r in s.sort_values("p").head(10).iterrows()]
        return json.dumps({"drivers": rows, "concordance": round(float(m.cph.concordance_index_), 3)})

    def risk_summary(horizon: float = 3) -> str:
        rep = risk_report(ds, horizon=horizon, limit=5)
        return json.dumps({"summary": rep["summary"], "top_customers": rep["customers"]}, default=str)

    def simulate_scenario(levers: list[dict[str, Any]], horizon: float = 3) -> str:
        clean = [{("from" if k == "from_" else k): v for k, v in (l if isinstance(l, dict) else l.model_dump(by_alias=True)).items() if v is not None} for l in levers]
        try:
            res = run_scenario(ds, clean, horizon=horizon)
        except Exception as e:
            return json.dumps({"error": str(e)})
        res.pop("curve", None)
        return json.dumps(res)

    def playbook() -> str:
        ev = {e.get("type"): e.get("data") or {} for e in ds.run.get("events", [])}
        pb = (ev.get("solution_ready", {}) or {}).get("final_playbook") or {}
        if not pb.get("executive_summary"):
            return json.dumps({"error": "no playbook for this run"})
        return json.dumps({
            "title": pb.get("title"),
            "problems": [{"title": p["problem"]["title"], "solution": p["solution"]["title"],
                          "lift": p["retention_impact"]["estimated_lift_percent"]} for p in pb.get("problems_and_solutions", [])],
            "roadmap": {k: v.get("theme") for k, v in (pb.get("30_60_90_roadmap") or {}).items()},
        })

    tools = [
        StructuredTool.from_function(run_sql, name="run_sql", args_schema=_SqlArgs,
            description="Read-only SQL on the customer table `customers`. Use for any count, rate or breakdown."),
        StructuredTool.from_function(segment_stats, name="segment_stats", args_schema=_FamilyArgs,
            description="Churn rate per segment with BH-corrected significance and stat_ids to cite."),
        StructuredTool.from_function(churn_drivers, name="churn_drivers",
            description="CoxPH hazard ratios: which features raise or lower churn hazard."),
        StructuredTool.from_function(risk_summary, name="risk_summary", args_schema=_HorizonArgs,
            description="Per-customer churn risk tiers, expected churners and the riskiest customers."),
        StructuredTool.from_function(simulate_scenario, name="simulate_scenario", args_schema=_ScenarioArgs,
            description="What-if: shift customers between categories, scale or cap a numeric column; returns customers saved."),
        StructuredTool.from_function(playbook, name="playbook", description="The run's final retention playbook."),
    ]
    return tools, stat_ids


SYSTEM = """You are Churnly's analyst copilot for ONE customer dataset and its finished retention analysis.

Rules:
- Answer only from tool results. Never guess a number — call a tool.
- Use run_sql for counts/rates/breakdowns. The table is `customers`. Quote column names with double quotes.
- When a claim rests on a segment statistic, cite it inline as [stat_id] exactly as returned by segment_stats (e.g. [contract::Monthly]).
- Say when a difference is not statistically significant. Correlation is not causation — say so for what-if results.
- Be concise: 2-6 sentences or a short list. Use plain language a product manager understands.

Dataset: {rows} rows. Columns:
{schema}

Run context: {context}
"""


def _summ(tool: str, raw: str) -> str:
    try:
        d = json.loads(raw)
    except Exception:
        return raw[:160]
    if "error" in d:
        return f"error: {d['error']}"
    if tool == "run_sql":
        return f"{d.get('row_count', 0)} row(s){' (truncated)' if d.get('truncated') else ''}"
    if tool == "segment_stats":
        segs = d.get("segments", [])
        return f"{len(segs)} segments, {sum(1 for s in segs if s.get('significant'))} significant"
    if tool == "churn_drivers":
        return f"{len(d.get('drivers', []))} drivers · c-index {d.get('concordance')}"
    if tool == "risk_summary":
        t = (d.get("summary") or {}).get("tiers", {})
        return f"high {t.get('high', 0)} · medium {t.get('medium', 0)} · low {t.get('low', 0)}"
    if tool == "simulate_scenario":
        return f"{d.get('customers_saved')} customers saved"
    return "ok"


def ask_copilot(ds: RunDataset, question: str, history: list[dict[str, str]] | None = None, llm=None) -> Iterator[dict[str, Any]]:
    """Yield UI events: step / tool_result / answer / error."""
    tools, stat_ids = build_tools(ds)
    by_name = {t.name: t for t in tools}
    if llm is None:
        from app.config import get_llm
        # Interactive: give up on a slow model sooner and use the next one.
        llm = get_llm("gemini", temperature=0.1, timeout_s=float(os.getenv("COPILOT_TIMEOUT_S", "20")))
    bound = llm.bind_tools(tools)

    msgs: list[Any] = [SystemMessage(content=SYSTEM.format(rows=len(ds.df), schema=_schema(ds), context=_run_context(ds)))]
    for turn in (history or [])[-6:]:
        if turn.get("role") == "user":
            msgs.append(HumanMessage(content=str(turn.get("content", ""))[:2000]))
        elif turn.get("role") == "assistant":
            msgs.append(AIMessage(content=str(turn.get("content", ""))[:2000]))
    msgs.append(HumanMessage(content=question[:2000]))

    for _ in range(MAX_STEPS):
        ai = bound.invoke(msgs)
        calls = getattr(ai, "tool_calls", None) or []
        if not calls:
            text = ai.content if isinstance(ai.content, str) else "".join(
                p.get("text", "") if isinstance(p, dict) else str(p) for p in (ai.content or [])
            )
            cited = sorted(set(_CITE_RE.findall(text)))
            yield {
                "type": "answer",
                "text": text.strip(),
                "citations": [c for c in cited if c in stat_ids],
                "unverified": [c for c in cited if c not in stat_ids],
            }
            return
        msgs.append(ai)
        for call in calls:
            name, args = call.get("name"), call.get("args") or {}
            yield {"type": "step", "tool": name, "args": args}
            tool = by_name.get(name)
            if tool is None:
                out = json.dumps({"error": f"unknown tool {name}"})
            else:
                try:
                    out = tool.invoke(args)
                except Exception as e:
                    out = json.dumps({"error": f"{type(e).__name__}: {str(e)[:200]}"})
            out = out if isinstance(out, str) else json.dumps(out, default=str)
            preview = None
            if name == "run_sql":
                try:
                    preview = json.loads(out)
                except Exception:
                    preview = None
            yield {"type": "tool_result", "tool": name, "summary": _summ(name, out), "table": preview}
            msgs.append(ToolMessage(content=out[:8000], tool_call_id=call.get("id") or name))

    yield {"type": "answer", "text": "I couldn't finish within my step budget — try a narrower question.", "citations": [], "unverified": []}
