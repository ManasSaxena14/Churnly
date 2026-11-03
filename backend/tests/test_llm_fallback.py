"""FailoverLLM: key rotation, backoff, cross-model fallback, metrics."""

import pytest

from app import config, observability as obs


class FakeLLM:
    """Stands in for ChatGoogleGenerativeAI / ChatGroq."""

    def __init__(self, provider, key, model, script):
        self.provider, self.key, self.model = provider, key, model
        self._script = script  # dict: (provider, model, key) -> list of outcomes

    def _next(self):
        outcomes = self._script.setdefault((self.provider, self.model, self.key), [])
        outcome = outcomes.pop(0) if outcomes else "ok"
        if isinstance(outcome, Exception):
            raise outcome
        return f"{self.provider}:{self.model}:{self.key}"

    def invoke(self, input, config=None, **kwargs):
        self.last_config = config
        return self._next()

    def with_structured_output(self, schema, **kwargs):
        parent = self

        class _S:
            def invoke(self, input, config=None, **kw):
                return {"so_kwargs": kwargs, "who": parent._next()}

        return _S()


@pytest.fixture
def fake_env(monkeypatch):
    script: dict = {}
    monkeypatch.setattr(config, "_GEMINI_KEYS", ["g1", "g2"])
    monkeypatch.setattr(config, "_GROQ_KEYS", ["q1"])
    monkeypatch.setattr(config, "_dead_keys", {"gemini": {}, "groq": {}})
    monkeypatch.setattr(config, "_counters", {"gemini": 0, "groq": 0})
    monkeypatch.setattr(config, "_backoff_sleep", lambda attempt: None)
    monkeypatch.setattr(
        config, "_build_raw_llm",
        lambda provider, key, model, temperature, **kw: FakeLLM(provider, key, model, script),
    )
    monkeypatch.delenv("LLM_FALLBACK", raising=False)
    return script


def test_chain_order_and_missing_providers(fake_env, monkeypatch):
    assert config.build_chain("gemini", "deep-model") == [
        ("gemini", "deep-model"), ("gemini", config.GEMINI_FAST_MODEL), ("groq", config.GROQ_MODEL),
    ]
    assert config.build_chain("groq", None) == [("groq", config.GROQ_MODEL), ("gemini", config.GEMINI_FAST_MODEL)]
    monkeypatch.setattr(config, "_GROQ_KEYS", [])
    assert config.build_chain("groq", None) == [("gemini", config.GEMINI_FAST_MODEL)]
    monkeypatch.setenv("LLM_FALLBACK", "off")
    assert config.build_chain("gemini", None) == [("gemini", config.GEMINI_FAST_MODEL)]


def test_rate_limit_rotates_to_next_key(fake_env):
    fast = config.GEMINI_FAST_MODEL
    fake_env[("gemini", fast, "g1")] = [Exception("429 Resource exhausted")]
    llm = config.get_llm("gemini")
    assert llm.invoke("hi") == f"gemini:{fast}:g2"


def test_exhausted_pool_falls_back_to_next_provider(fake_env):
    fast = config.GEMINI_FAST_MODEL
    fake_env[("gemini", fast, "g1")] = [Exception("quota exceeded")]
    fake_env[("gemini", fast, "g2")] = [Exception("quota exceeded")]
    llm = config.get_llm("gemini")
    assert llm.invoke("hi") == f"groq:{config.GROQ_MODEL}:q1"


def test_missing_model_skips_to_fast_model(fake_env):
    fake_env[("gemini", "ghost-model", "g1")] = [Exception("404 model not found")]
    llm = config.get_llm("gemini", model="ghost-model")
    assert llm.invoke("hi").startswith(f"gemini:{config.GEMINI_FAST_MODEL}:")


def test_transient_errors_back_off_then_succeed(fake_env):
    fast = config.GEMINI_FAST_MODEL
    fake_env[("gemini", fast, "g1")] = [Exception("503 Service Unavailable"), Exception("500 Internal error: overloaded")]
    llm = config.get_llm("gemini")
    assert llm.invoke("hi") == f"gemini:{fast}:g1"


def test_request_timeout_moves_to_next_target_without_retrying(fake_env):
    fast = config.GEMINI_FAST_MODEL
    fake_env[("gemini", fast, "g1")] = [Exception("ReadTimeout: The read operation timed out")]
    llm = config.get_llm("gemini")
    assert llm.invoke("hi") == f"groq:{config.GROQ_MODEL}:q1"


def test_gemini_deadline_exceeded_counts_as_timeout(fake_env):
    fast = config.GEMINI_FAST_MODEL
    fake_env[("gemini", fast, "g1")] = [Exception("504 DEADLINE_EXCEEDED. Deadline expired before operation could complete.")]
    llm = config.get_llm("gemini")
    assert llm.invoke("hi") == f"groq:{config.GROQ_MODEL}:q1"


def test_fatal_errors_are_not_swallowed(fake_env):
    fake_env[("gemini", config.GEMINI_FAST_MODEL, "g1")] = [ValueError("schema mismatch in prompt")]
    with pytest.raises(ValueError):
        config.get_llm("gemini").invoke("hi")


def test_structured_output_gets_json_schema_on_groq_fallback(fake_env):
    fast = config.GEMINI_FAST_MODEL
    fake_env[("gemini", fast, "g1")] = [Exception("429")]
    fake_env[("gemini", fast, "g2")] = [Exception("429")]
    out = config.get_llm("gemini").with_structured_output(dict).invoke("hi")
    assert out["who"].startswith("groq:")
    assert out["so_kwargs"].get("method") == "json_schema"


def test_calls_are_recorded_against_the_current_job(fake_env):
    fast = config.GEMINI_FAST_MODEL
    fake_env[("gemini", fast, "g1")] = [Exception("429")]
    token_job = obs.current_job_id.set("job-test")
    token_node = obs.current_node.set("forensic_detective")
    try:
        config.get_llm("gemini").invoke("hi", agent_name="Tester")
        snap = obs.snapshot("job-test")
    finally:
        obs.current_job_id.reset(token_job)
        obs.current_node.reset(token_node)
        obs.drop("job-test")
    assert snap["llm_calls"] == 2
    assert snap["llm_failures"] == 1
    assert snap["by_node"]["forensic_detective"]["calls"] == 2
    assert snap["cost_usd"] is None  # no prices configured → no invented number


def test_all_keys_rate_limited_waits_then_retries_once(fake_env, monkeypatch):
    waits = []
    monkeypatch.setattr(config, "RATE_LIMIT_WAIT_S", 30.0)
    monkeypatch.setattr(config.time, "sleep", lambda s: waits.append(s))
    fast = config.GEMINI_FAST_MODEL
    for key in ("g1", "g2"):
        fake_env[("gemini", fast, key)] = [Exception("429 quota exceeded")]
    fake_env[("groq", config.GROQ_MODEL, "q1")] = [Exception("429 rate limit")]
    llm = config.get_llm("gemini")
    assert llm.invoke("hi").startswith(f"gemini:{fast}:")  # limits cleared after the wait
    assert waits == [30.0]


def test_non_rate_limit_failures_do_not_wait(fake_env, monkeypatch):
    waits = []
    monkeypatch.setattr(config, "RATE_LIMIT_WAIT_S", 30.0)
    monkeypatch.setattr(config.time, "sleep", lambda s: waits.append(s))
    fast = config.GEMINI_FAST_MODEL
    for key in ("g1", "g2"):
        fake_env[("gemini", fast, key)] = [Exception("401 invalid api key")]
    fake_env[("groq", config.GROQ_MODEL, "q1")] = [Exception("401 invalid api key")]
    with pytest.raises(RuntimeError):
        config.get_llm("gemini").invoke("hi")
    assert waits == []
