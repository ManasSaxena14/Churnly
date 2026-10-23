"""
Centralized LLM Factory with Round-Robin, Failover and a Model Fallback Chain
=============================================================================
Provides `get_llm()` returning a `FailoverLLM` wrapper:
- Picks next key via round-robin on each new instance.
- On a rate-limit / quota / bad-key error, rotates to the next key of the same
  provider until that provider's pool is exhausted.
- On transient errors (timeouts, 5xx, "overloaded") retries with exponential
  backoff + jitter.
- When a provider/model can't serve the call (pool exhausted, model not found,
  retries used up) it falls back to the next (provider, model) in the chain,
  e.g. gemini-deep → gemini-fast → groq. Providers with no keys are skipped.
- Caps concurrent calls per provider (LLM_MAX_CONCURRENCY) so parallel pods
  don't stampede a free-tier quota.
- Records latency / tokens / fallbacks per job (app.observability) and attaches
  Langfuse tracing when configured.
- Auto-discovers all keys named `GOOGLE_API_KEY[_N]` and `GROQ_API_KEY[_N]`.
"""

from __future__ import annotations

import os
import random
import threading
import time
from typing import Any, Literal

from dotenv import load_dotenv

load_dotenv()

# ── Key discovery ────────────────────────────────────────────────────────

def _discover_keys(base: str, max_slots: int = 32) -> list[str]:
    """Find all env vars matching BASE, BASE_1 .. BASE_N (in numeric order)."""
    keys: list[str] = []
    seen: set[str] = set()
    plain = os.getenv(base)
    if plain and plain not in seen:
        keys.append(plain)
        seen.add(plain)
    for i in range(1, max_slots + 1):
        v = os.getenv(f"{base}_{i}")
        if v and v not in seen:
            keys.append(v)
            seen.add(v)
    return keys


_GEMINI_KEYS: list[str] = _discover_keys("GOOGLE_API_KEY")
_GROQ_KEYS:   list[str] = _discover_keys("GROQ_API_KEY")

# ── Model selection ──────────────────────────────────────────────────────
# Latency bench 2026-07-07: gemini-3-flash-preview
# had 15s–350s tail latency on structured calls; 3.1-flash-lite does the same
# call in ~2s. Lite thinks OFF by default — do NOT pass thinking_level to it.
# Override with env vars if your key doesn't have access to these models.
GEMINI_FAST_MODEL = os.getenv("GEMINI_FAST_MODEL", "gemini-3.1-flash-lite")  # every structured/shallow call
# Both defaults are on the Gemini API free tier (Pro models are paid-only).
# If a model ever disappears or loses free access, the fallback chain drops
# to the fast model, then to Groq.
GEMINI_DEEP_MODEL = os.getenv("GEMINI_DEEP_MODEL", "gemini-3-flash-preview")  # deep mode only: reasoning-heavy calls
# Groq shootout 2026-07-07: gpt-oss-120b beat llama-3.3-70b on answer depth
# (cites HR/p/significance correctly) at ~3s for 4k-token prompts. It rejects
# forced tool-choice, so structured output must use method="json_schema" —
# FailoverLLM injects that automatically for gpt-oss models.
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")


def gemini_model(depth: str | None = None, deep_call: bool = False) -> str:
    """Pick the Gemini model for a call site.

    `deep_call=True` marks reasoning-heavy sites (forensic runs, skeptics,
    critic, architect). They get GEMINI_DEEP_MODEL only when the user chose
    depth="deep" in the questionnaire; everything else stays on the fast model.
    """
    if deep_call and (depth or "").strip().lower() == "deep":
        return GEMINI_DEEP_MODEL
    return GEMINI_FAST_MODEL

# ── State ────────────────────────────────────────────────────────────────

# Rate-limited keys revive after this many seconds — provider RPM windows
# reset in ~60s, so a permanently-dead key just shrinks the pool for nothing.
_DEAD_KEY_COOLDOWN_SECONDS = 75.0

_lock = threading.Lock()
_counters: dict[str, int] = {"gemini": 0, "groq": 0}
_dead_keys: dict[str, dict[int, float]] = {"gemini": {}, "groq": {}}  # idx → death timestamp


def _is_dead(provider: str, idx: int) -> bool:
    """True if key is inside its cool-down window; expired entries are purged."""
    died_at = _dead_keys[provider].get(idx)
    if died_at is None:
        return False
    if time.monotonic() - died_at >= _DEAD_KEY_COOLDOWN_SECONDS:
        del _dead_keys[provider][idx]
        return False
    return True


def _pool(provider: str) -> list[str]:
    return _GEMINI_KEYS if provider == "gemini" else _GROQ_KEYS if provider == "groq" else []


def _next_live_idx(provider: str) -> int:
    """Round-robin index, skipping keys marked dead (cool-down)."""
    pool = _pool(provider)
    if not pool:
        raise ValueError(f"No API keys configured for provider '{provider}'. Check your .env file.")
    with _lock:
        for _ in range(len(pool)):
            idx = _counters[provider] % len(pool)
            _counters[provider] += 1
            if not _is_dead(provider, idx):
                return idx
        # All inside cool-down — reset and try fresh
        _dead_keys[provider].clear()
        idx = _counters[provider] % len(pool)
        _counters[provider] += 1
        return idx


def _build_raw_llm(provider: str, api_key: str, model: str | None, temperature: float, **kwargs):
    if provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model=model or GEMINI_FAST_MODEL,
            google_api_key=api_key,
            temperature=temperature,
            **kwargs,
        )
    if provider == "groq":
        from langchain_groq import ChatGroq
        resolved = model or GROQ_MODEL
        # gpt-oss at reasoning_effort medium/high intermittently leaks the JSON
        # schema into the content channel (bench 2026-07-07: 2/4 structured
        # failures at medium, 4/4 pass at low). Low is also faster (~3s).
        if "gpt-oss" in resolved and "reasoning_effort" not in kwargs:
            kwargs["reasoning_effort"] = "low"
        return ChatGroq(
            model=resolved,
            groq_api_key=api_key,
            temperature=temperature,
            **kwargs,
        )
    raise ValueError(f"Unknown provider: {provider}")




# ── Error classification ─────────────────────────────────────────────────

_RATE_LIMIT_SIGNALS = (
    "rate limit", "ratelimit", "rate-limit",
    "quota", "exhausted", "resourceexhausted",
    "too many request", "429",
    "tokens per minute", "requests per minute",
    "tpm", "rpm",
)
_BAD_KEY_SIGNALS = (
    "api key not valid", "invalid api key", "api_key_invalid", "invalid_api_key",
    "unauthorized", "401", "permission denied", "permission_denied",
)
_MODEL_UNAVAILABLE_SIGNALS = (
    "model not found", "is not found", "not_found", "does not exist",
    "unknown model", "model_not_found", "decommissioned", "is not supported",
    "404",
)
_TRANSIENT_SIGNALS = (
    "timeout", "timed out", "deadline", "temporarily", "unavailable",
    "overloaded", "internal error", "internal server error",
    "500", "502", "503", "504", "connection reset", "connection error",
    "remotedisconnected", "service unavailable",
)


def _is_rate_limit_error(e: Exception) -> bool:
    msg = str(e).lower()
    if any(s in msg for s in _RATE_LIMIT_SIGNALS):
        return True
    # langchain wraps errors — also check class name + nested status
    cls = type(e).__name__.lower()
    if "ratelimit" in cls or "resourceexhausted" in cls or "quotaexceeded" in cls:
        return True
    status = getattr(e, "status_code", None) or getattr(e, "code", None)
    if status == 429:
        return True
    return False


def classify_error(e: Exception) -> Literal["rate_limit", "bad_key", "model_unavailable", "transient", "fatal"]:
    """Decide what the failover loop should do with an exception.

    rate_limit / bad_key  → rotate to the next key of the same provider
    model_unavailable     → skip straight to the next model in the chain
    transient             → back off and retry the same target
    fatal                 → re-raise (bad prompt, schema mismatch, our bug)
    """
    if _is_rate_limit_error(e):
        return "rate_limit"
    msg = str(e).lower()
    cls = type(e).__name__.lower()
    status = getattr(e, "status_code", None) or getattr(e, "code", None)
    if status in (401, 403) or "authentication" in cls or any(s in msg for s in _BAD_KEY_SIGNALS):
        return "bad_key"
    if status == 404 or "notfound" in cls or any(s in msg for s in _MODEL_UNAVAILABLE_SIGNALS):
        return "model_unavailable"
    if (
        status in (500, 502, 503, 504)
        or "timeout" in cls or "connection" in cls or "unavailable" in cls
        or any(s in msg for s in _TRANSIENT_SIGNALS)
    ):
        return "transient"
    return "fatal"


# ── Fallback chain ───────────────────────────────────────────────────────

_MAX_TRANSIENT_RETRIES = int(os.getenv("LLM_MAX_TRANSIENT_RETRIES", "2"))
_BACKOFF_BASE_SECONDS = float(os.getenv("LLM_BACKOFF_BASE_SECONDS", "1.0"))
_BACKOFF_MAX_SECONDS = 8.0
_MAX_CONCURRENCY = max(1, int(os.getenv("LLM_MAX_CONCURRENCY", "6")))
_semaphores = {p: threading.BoundedSemaphore(_MAX_CONCURRENCY) for p in ("gemini", "groq")}


def _fallback_enabled() -> bool:
    return (os.getenv("LLM_FALLBACK") or "on").strip().lower() not in ("0", "off", "false", "no")


def build_chain(provider: str, model: str | None) -> list[tuple[str, str]]:
    """Ordered (provider, model) targets to try for a call.

    gemini <deep>  → gemini <fast> → groq
    gemini <fast>  → groq
    groq           → gemini <fast>
    Providers without keys are dropped; duplicates collapse.
    """
    primary_model = model or (GROQ_MODEL if provider == "groq" else GEMINI_FAST_MODEL)
    chain: list[tuple[str, str]] = [(provider, primary_model)]
    if _fallback_enabled():
        if provider == "gemini":
            chain += [("gemini", GEMINI_FAST_MODEL), ("groq", GROQ_MODEL)]
        elif provider == "groq":
            chain += [("gemini", GEMINI_FAST_MODEL)]

    out: list[tuple[str, str]] = []
    for target in chain:
        if target not in out and _pool(target[0]):
            out.append(target)
    return out


def _backoff_sleep(attempt: int) -> None:
    delay = min(_BACKOFF_MAX_SECONDS, _BACKOFF_BASE_SECONDS * (2 ** (attempt - 1)))
    time.sleep(delay * (0.5 + random.random() / 2))


# ── Failover wrapper ─────────────────────────────────────────────────────

class FailoverLLM:
    """Drop-in LLM that survives rate limits, flaky providers and missing models.

    Supports the subset of the langchain LLM interface used here:
    - `.invoke(prompt)`
    - `.with_structured_output(schema).invoke(prompt)`
    """

    def __init__(self, provider: str, model: str | None = None, temperature: float = 0.3, **kwargs):
        self.provider = provider
        self.model = model
        self.temperature = temperature
        self.kwargs = kwargs  # provider-specific; only applied to the primary provider
        self.chain = build_chain(provider, model)
        if not self.chain:
            raise ValueError(
                f"No API keys configured for provider '{provider}' (or any fallback). Check your .env file."
            )
        self._target = 0
        self._idx: int | None = None
        self._llm = None
        self._rotate()

    # ── current target helpers ────────────────────────────────────────
    @property
    def active_provider(self) -> str:
        return self.chain[self._target][0]

    @property
    def active_model(self) -> str:
        return self.chain[self._target][1]

    def _rotate(self) -> None:
        """Pick the next live key for the current target and rebuild the client."""
        provider, model = self.chain[self._target]
        pool = _pool(provider)
        self._idx = _next_live_idx(provider)
        kwargs = self.kwargs if provider == self.provider else {}
        self._llm = _build_raw_llm(provider, pool[self._idx], model, self.temperature, **kwargs)
        print(f"[LLM Factory] {provider}:{model} using slot {self._idx + 1}/{len(pool)}")

    def _structured_kwargs(self, so_kwargs: dict) -> dict:
        # gpt-oss models on Groq 400 on the default forced tool-choice method;
        # they support strict json_schema response format instead. Applied per
        # target so a gemini → groq fallback still gets the right method.
        out = dict(so_kwargs)
        if self.active_provider == "groq" and "gpt-oss" in self.active_model and "method" not in out:
            out["method"] = "json_schema"
        return out

    def _call_with_failover(self, fn, agent: str | None = None, config: dict | None = None):
        """Execute fn(llm, config) across keys, retries and the fallback chain."""
        from app import observability as obs

        last_err: Exception | None = None
        first = self.chain[0]
        for target_i in range(self._target, len(self.chain)):
            if target_i != self._target:
                self._target = target_i
                try:
                    self._rotate()
                except ValueError as e:  # pool vanished mid-run
                    last_err = e
                    continue
                print(f"[LLM Factory] falling back → {self.active_provider}:{self.active_model}", flush=True)

            provider, model = self.chain[self._target]
            pool_size = len(_pool(provider))
            key_failures = 0
            transient_failures = 0
            fallback_from = None if (provider, model) == first else f"{first[0]}:{first[1]}"

            while True:
                call_config, capture = obs.build_call_config(agent, config)
                t0 = time.perf_counter()
                try:
                    with _semaphores.setdefault(provider, threading.BoundedSemaphore(_MAX_CONCURRENCY)):
                        result = fn(self._llm, call_config)
                    obs.record_llm_call(
                        provider=provider, model=model, agent=agent,
                        latency_s=time.perf_counter() - t0,
                        input_tokens=capture.input_tokens, output_tokens=capture.output_tokens,
                        fallback_from=fallback_from,
                    )
                    return result
                except Exception as e:
                    last_err = e
                    kind = classify_error(e)
                    obs.record_llm_call(
                        provider=provider, model=model, agent=agent,
                        latency_s=time.perf_counter() - t0,
                        input_tokens=capture.input_tokens, output_tokens=capture.output_tokens,
                        ok=False, fallback_from=fallback_from, error=f"{kind}: {e}",
                    )
                    if kind == "fatal":
                        raise
                    if kind in ("rate_limit", "bad_key"):
                        with _lock:
                            if self._idx is not None:
                                _dead_keys[provider][self._idx] = time.monotonic()
                        key_failures += 1
                        print(
                            f"[LLM Factory] {provider} slot {(self._idx or 0) + 1} {kind} "
                            f"→ rotating ({key_failures}/{pool_size})", flush=True,
                        )
                        if key_failures >= pool_size:
                            break  # pool exhausted → next target in chain
                        self._rotate()
                        continue
                    if kind == "transient":
                        transient_failures += 1
                        if transient_failures > _MAX_TRANSIENT_RETRIES:
                            break
                        print(
                            f"[LLM Factory] {provider}:{model} transient error, backoff "
                            f"{transient_failures}/{_MAX_TRANSIENT_RETRIES}: {str(e)[:100]}", flush=True,
                        )
                        _backoff_sleep(transient_failures)
                        continue
                    break  # model_unavailable → next target

        raise RuntimeError(
            f"All LLM targets exhausted for {self.provider} "
            f"(chain: {', '.join(f'{p}:{m}' for p, m in self.chain)})."
        ) from last_err

    # ── langchain-compatible surface ──────────────────────────────────
    def invoke(self, input, config: dict | None = None, **kwargs):
        agent = kwargs.pop("agent_name", None)
        return self._call_with_failover(
            lambda llm, cfg: llm.invoke(input, config=cfg, **kwargs),
            agent=agent, config=config,
        )

    def with_structured_output(self, schema, **so_kwargs):
        return _StructuredFailoverProxy(self, schema, so_kwargs)

    def bind_tools(self, tools, **bind_kwargs):
        """Tool calling with the same key rotation / retries / model fallback."""
        return _ToolBoundFailoverProxy(self, tools, bind_kwargs)

    # Forward unknown attribute access (e.g. .bind_tools) to current llm
    def __getattr__(self, name: str) -> Any:
        if name.startswith("_"):
            raise AttributeError(name)
        return getattr(self._llm, name)


class _StructuredFailoverProxy:
    """Returned from FailoverLLM.with_structured_output(); retries the whole structured call."""

    def __init__(self, parent: FailoverLLM, schema, so_kwargs: dict):
        self.parent = parent
        self.schema = schema
        self.so_kwargs = so_kwargs

    def invoke(self, input, config: dict | None = None, **kwargs):
        agent = kwargs.pop("agent_name", None) or getattr(self.schema, "__name__", None)

        def call(llm, cfg):
            so_kwargs = self.parent._structured_kwargs(self.so_kwargs)
            return llm.with_structured_output(self.schema, **so_kwargs).invoke(input, config=cfg, **kwargs)

        return self.parent._call_with_failover(call, agent=agent, config=config)


class _ToolBoundFailoverProxy:
    """Returned from FailoverLLM.bind_tools(); re-binds on whichever model is live."""

    def __init__(self, parent: FailoverLLM, tools, bind_kwargs: dict):
        self.parent = parent
        self.tools = tools
        self.bind_kwargs = bind_kwargs

    def invoke(self, input, config: dict | None = None, **kwargs):
        agent = kwargs.pop("agent_name", None) or "ToolAgent"

        def call(llm, cfg):
            return llm.bind_tools(self.tools, **self.bind_kwargs).invoke(input, config=cfg, **kwargs)

        return self.parent._call_with_failover(call, agent=agent, config=config)


# ── Public API ───────────────────────────────────────────────────────────

def get_llm(
    provider: Literal["gemini", "groq"] = "gemini",
    model: str | None = None,
    temperature: float = 0.3,
    **kwargs,
) -> FailoverLLM:
    """Return a FailoverLLM. Picks key via round-robin, rotates on rate-limit,
    falls back across models/providers when one can't serve the call."""
    return FailoverLLM(provider, model=model, temperature=temperature, **kwargs)


def pool_status() -> dict[str, dict[str, Any]]:
    """Debug helper — current pool size, counters, dead keys, model chain."""
    return {
        "gemini": {"size": len(_GEMINI_KEYS), "counter": _counters["gemini"], "dead": sorted(_dead_keys["gemini"].keys())},
        "groq":   {"size": len(_GROQ_KEYS),   "counter": _counters["groq"],   "dead": sorted(_dead_keys["groq"].keys())},
        "models": {"gemini_fast": GEMINI_FAST_MODEL, "gemini_deep": GEMINI_DEEP_MODEL, "groq": GROQ_MODEL},
        "fallback_enabled": _fallback_enabled(),
    }
