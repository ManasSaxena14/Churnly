"""
Observability — per-run LLM metrics + optional Langfuse tracing.
==================================================================
Every LLM call made through `app.config.FailoverLLM` is recorded against the
job that triggered it: provider, model, latency, tokens, fallbacks, failures.
Node wall-times are recorded by the graph wrapper in builder.py.

`snapshot(job_id)` is pushed to the UI as a `run_metrics` SSE event after each
node, so the results page can show a live cost / latency panel.

Langfuse is enabled automatically when LANGFUSE_PUBLIC_KEY and
LANGFUSE_SECRET_KEY are set (and LANGFUSE_HOST / LANGFUSE_BASE_URL if you
self-host). Without them, nothing is sent anywhere.

Cost: provider free tiers bill $0, so cost is only computed for models listed
in LLM_PRICES_JSON, e.g.
  LLM_PRICES_JSON='{"openai/gpt-oss-120b": [0.15, 0.60]}'
(USD per 1M input tokens, per 1M output tokens). Unpriced models report
cost_usd = null instead of a made-up number.
"""

from __future__ import annotations

import json
import os
import threading
import time
from contextvars import ContextVar
from typing import Any

from langchain_core.callbacks import BaseCallbackHandler

# Set by the graph node wrapper (builder._wrap_node) so LLM calls deep inside
# agents know which job / node they belong to without threading args through.
current_job_id: ContextVar[str | None] = ContextVar("current_job_id", default=None)
current_node: ContextVar[str | None] = ContextVar("current_node", default=None)

_lock = threading.Lock()
_runs: dict[str, dict[str, Any]] = {}
_MAX_CALL_LOG = 400  # cap per run so a runaway retry loop can't grow memory forever


def _prices() -> dict[str, tuple[float, float]]:
    raw = os.getenv("LLM_PRICES_JSON") or ""
    if not raw.strip():
        return {}
    try:
        parsed = json.loads(raw)
        return {k: (float(v[0]), float(v[1])) for k, v in parsed.items()}
    except Exception:
        print("[observability] LLM_PRICES_JSON is not valid JSON — ignoring", flush=True)
        return {}


def _run(job_id: str) -> dict[str, Any]:
    run = _runs.get(job_id)
    if run is None:
        run = {
            "started_at": time.time(),
            "calls": [],
            "nodes": {},
        }
        _runs[job_id] = run
    return run


def record_llm_call(
    *,
    provider: str,
    model: str,
    agent: str | None,
    latency_s: float,
    input_tokens: int = 0,
    output_tokens: int = 0,
    ok: bool = True,
    fallback_from: str | None = None,
    error: str | None = None,
    job_id: str | None = None,
    node: str | None = None,
) -> None:
    job_id = job_id or current_job_id.get()
    if not job_id:
        return
    entry = {
        "ts": time.time(),
        "node": node or current_node.get(),
        "agent": agent,
        "provider": provider,
        "model": model,
        "latency_s": round(latency_s, 3),
        "input_tokens": int(input_tokens or 0),
        "output_tokens": int(output_tokens or 0),
        "ok": ok,
        "fallback_from": fallback_from,
        "error": (error or "")[:160] or None,
    }
    with _lock:
        calls = _run(job_id)["calls"]
        if len(calls) < _MAX_CALL_LOG:
            calls.append(entry)


def record_node(job_id: str | None, node: str, seconds: float) -> None:
    if not job_id:
        return
    with _lock:
        nodes = _run(job_id)["nodes"]
        prev = nodes.get(node, {"seconds": 0.0, "runs": 0})
        nodes[node] = {"seconds": round(prev["seconds"] + seconds, 3), "runs": prev["runs"] + 1}


def snapshot(job_id: str | None) -> dict[str, Any]:
    """Aggregate metrics for one run — safe to JSON-serialize and send to the UI."""
    if not job_id:
        return {}
    prices = _prices()
    with _lock:
        run = _runs.get(job_id)
        if run is None:
            return {}
        calls = list(run["calls"])
        nodes = dict(run["nodes"])
        started = run["started_at"]

    by_model: dict[str, dict[str, Any]] = {}
    by_node: dict[str, dict[str, Any]] = {}
    total_in = total_out = 0
    failures = fallbacks = 0
    latencies: list[float] = []
    cost_total = 0.0
    any_unpriced = False

    for c in calls:
        key = f"{c['provider']}:{c['model']}"
        m = by_model.setdefault(key, {
            "provider": c["provider"], "model": c["model"], "calls": 0,
            "input_tokens": 0, "output_tokens": 0, "latency_s": 0.0, "cost_usd": 0.0,
        })
        m["calls"] += 1
        m["input_tokens"] += c["input_tokens"]
        m["output_tokens"] += c["output_tokens"]
        m["latency_s"] = round(m["latency_s"] + c["latency_s"], 3)
        price = prices.get(c["model"])
        if price is not None:
            cost = c["input_tokens"] / 1e6 * price[0] + c["output_tokens"] / 1e6 * price[1]
            m["cost_usd"] = round(m["cost_usd"] + cost, 6)
            cost_total += cost
        elif c["ok"]:
            any_unpriced = True
            m["cost_usd"] = None

        n = by_node.setdefault(c["node"] or "unknown", {"calls": 0, "tokens": 0, "llm_latency_s": 0.0})
        n["calls"] += 1
        n["tokens"] += c["input_tokens"] + c["output_tokens"]
        n["llm_latency_s"] = round(n["llm_latency_s"] + c["latency_s"], 3)

        total_in += c["input_tokens"]
        total_out += c["output_tokens"]
        failures += int(not c["ok"])
        fallbacks += int(bool(c["fallback_from"]))
        if c["ok"]:
            latencies.append(c["latency_s"])

    for name, info in nodes.items():
        by_node.setdefault(name, {"calls": 0, "tokens": 0, "llm_latency_s": 0.0})
        by_node[name]["wall_s"] = info["seconds"]

    latencies.sort()

    def _pct(p: float) -> float | None:
        if not latencies:
            return None
        idx = min(len(latencies) - 1, max(0, int(round(p * (len(latencies) - 1)))))
        return round(latencies[idx], 3)

    return {
        "elapsed_s": round(time.time() - started, 1),
        "llm_calls": len(calls),
        "llm_failures": failures,
        "fallbacks_used": fallbacks,
        "input_tokens": total_in,
        "output_tokens": total_out,
        "total_tokens": total_in + total_out,
        "latency_p50_s": _pct(0.5),
        "latency_p95_s": _pct(0.95),
        # null = at least one model has no price configured (free tier / unknown)
        "cost_usd": round(cost_total, 6) if prices else None,
        "cost_partial": any_unpriced and bool(prices),
        "by_model": sorted(by_model.values(), key=lambda m: -m["calls"]),
        "by_node": by_node,
        "langfuse_enabled": langfuse_enabled(),
    }


def drop(job_id: str | None) -> None:
    if job_id:
        with _lock:
            _runs.pop(job_id, None)


# ── Token capture for a single LLM call ─────────────────────────────────

class UsageCapture(BaseCallbackHandler):
    """Collects token usage from on_llm_end. Works for plain and structured calls."""

    def __init__(self) -> None:
        self.input_tokens = 0
        self.output_tokens = 0

    def on_llm_end(self, response, **kwargs: Any) -> None:  # noqa: ANN001
        got = False
        for gens in getattr(response, "generations", None) or []:
            for g in gens:
                usage = getattr(getattr(g, "message", None), "usage_metadata", None)
                if usage:
                    self.input_tokens += int(usage.get("input_tokens", 0) or 0)
                    self.output_tokens += int(usage.get("output_tokens", 0) or 0)
                    got = True
        if not got:
            usage = (getattr(response, "llm_output", None) or {}).get("token_usage") or {}
            self.input_tokens += int(usage.get("prompt_tokens", 0) or 0)
            self.output_tokens += int(usage.get("completion_tokens", 0) or 0)


# ── Langfuse ─────────────────────────────────────────────────────────────

_langfuse_handler = None
_langfuse_checked = False


def langfuse_enabled() -> bool:
    return bool(os.getenv("LANGFUSE_PUBLIC_KEY") and os.getenv("LANGFUSE_SECRET_KEY"))


def langfuse_handler():
    """Shared Langfuse LangChain callback, or None when keys/package are missing."""
    global _langfuse_handler, _langfuse_checked
    if _langfuse_checked:
        return _langfuse_handler
    _langfuse_checked = True
    if not langfuse_enabled():
        return None
    try:
        from langfuse.langchain import CallbackHandler

        _langfuse_handler = CallbackHandler()
        print("[observability] Langfuse tracing enabled", flush=True)
    except Exception as e:
        print(f"[observability] Langfuse unavailable ({type(e).__name__}: {e}) — tracing off", flush=True)
        _langfuse_handler = None
    return _langfuse_handler


def langfuse_flush() -> None:
    if _langfuse_handler is None:
        return
    try:
        from langfuse import get_client

        get_client().flush()
    except Exception:
        pass


def build_call_config(agent: str | None, extra: dict | None = None) -> tuple[dict, UsageCapture]:
    """LangChain RunnableConfig for one LLM call: usage capture + Langfuse + tags."""
    capture = UsageCapture()
    callbacks: list[Any] = [capture]
    lf = langfuse_handler()
    if lf is not None:
        callbacks.append(lf)

    job_id = current_job_id.get()
    node = current_node.get()
    metadata: dict[str, Any] = {}
    if job_id:
        metadata["langfuse_session_id"] = job_id
        metadata["job_id"] = job_id
    if node:
        metadata["langfuse_tags"] = [node]
        metadata["node"] = node

    config: dict[str, Any] = dict(extra or {})
    config["callbacks"] = list(config.get("callbacks") or []) + callbacks
    config["metadata"] = {**(config.get("metadata") or {}), **metadata}
    if agent and "run_name" not in config:
        config["run_name"] = agent
    return config, capture
