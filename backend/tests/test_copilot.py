"""Copilot: SQL sandbox + agent loop with a scripted fake LLM."""

import json

import pandas as pd
import pytest
from langchain_core.messages import AIMessage

from app.analytics.dataset import RunDataset
from app.copilot import SqlRejected, ask_copilot, run_readonly_sql
from app.stats.survival import fit_cox
from evals.synth_data import DatasetSpec, generate

DF = pd.DataFrame({"plan": ["Basic", "Pro", "Pro"], "churned": [1, 0, 1]})


def test_sql_allows_selects_and_limits_rows():
    out = run_readonly_sql(DF, 'SELECT plan, AVG(churned) AS rate FROM customers GROUP BY plan ORDER BY plan')
    assert out["columns"] == ["plan", "rate"] and out["rows"][0] == ["Basic", 1.0]
    big = pd.DataFrame({"x": range(500)})
    res = run_readonly_sql(big, "SELECT * FROM customers")
    assert res["row_count"] == 50 and res["truncated"] is True


@pytest.mark.parametrize("query", [
    "DROP TABLE customers",
    "SELECT 1; SELECT 2",
    "COPY customers TO '/tmp/x.csv'",
    "SELECT * FROM read_csv_auto('/etc/hosts')",
    "WITH x AS (SELECT 1) UPDATE customers SET plan = 'x'",
    "SELECT * FROM '/etc/hosts'",            # slips past the lexical guard → engine sandbox blocks it
    "SELECT current_setting('enable_external_access') FROM customers; SET enable_external_access = true",
])
def test_sql_rejects_anything_unsafe(query):
    with pytest.raises(SqlRejected):
        run_readonly_sql(DF, query)


class FakeLLM:
    """Scripted tool-calling model: returns queued AIMessages in order."""

    def __init__(self, script):
        self.script = list(script)
        self.seen = []

    def bind_tools(self, tools):
        self.tool_names = [t.name for t in tools]
        return self

    def invoke(self, msgs):
        self.seen.append(msgs)
        return self.script.pop(0)


@pytest.fixture
def ds(tmp_path):
    df = generate(DatasetSpec(name="cp", seed=5, n_rows=800, planted={"contract": 2.3}))
    detected = {"churn": "churned", "tenure": "tenure_months", "customer_id": "customer_id",
                "contract": "contract_length", "plan": "plan_tier", "support": "support_tickets",
                "usage": "usage_logins", "channel": "acquisition_channel"}
    return RunDataset(job_id="cp", df=df, detected=detected, churn_col="churned", tenure_col="tenure_months",
                      value_col="monthly_spend", model=fit_cox(df, "churned", "tenure_months", "customer_id"),
                      run={"events": [], "meta": {}})


def test_agent_calls_tools_then_answers_with_checked_citations(ds):
    llm = FakeLLM([
        AIMessage(content="", tool_calls=[{"id": "1", "name": "run_sql",
                  "args": {"query": 'SELECT contract_length, AVG(churned) r FROM customers GROUP BY 1'}}]),
        AIMessage(content="", tool_calls=[{"id": "2", "name": "segment_stats", "args": {"family": "contract"}}]),
        AIMessage(content="Monthly churns most [contract::Monthly]; see also [made::up]."),
    ])
    events = list(ask_copilot(ds, "Which contract churns most?", llm=llm))
    kinds = [e["type"] for e in events]
    assert kinds == ["step", "tool_result", "step", "tool_result", "answer"]
    assert events[1]["table"]["columns"] == ["contract_length", "r"]
    assert "significant" in events[3]["summary"]
    ans = events[-1]
    assert ans["citations"] == ["contract::Monthly"] and ans["unverified"] == ["made::up"]
    assert set(llm.tool_names) >= {"run_sql", "segment_stats", "simulate_scenario", "risk_summary"}
    # the tool result went back to the model
    assert any(getattr(m, "tool_call_id", None) == "1" for m in llm.seen[1])


def test_agent_reports_bad_sql_back_to_the_model(ds):
    llm = FakeLLM([
        AIMessage(content="", tool_calls=[{"id": "1", "name": "run_sql", "args": {"query": "DROP TABLE customers"}}]),
        AIMessage(content="I can only read data."),
    ])
    events = list(ask_copilot(ds, "delete everything", llm=llm))
    assert events[1]["summary"].startswith("error:")
    assert json.loads(llm.seen[1][-1].content)["error"]


def test_agent_scenario_tool_runs_whatif(ds):
    llm = FakeLLM([
        AIMessage(content="", tool_calls=[{"id": "1", "name": "simulate_scenario", "args": {
            "levers": [{"kind": "shift", "column": "contract_length", "from": "Monthly", "to": "Annual", "share": 0.5}], "horizon": 6}}]),
        AIMessage(content="About that many saved."),
    ])
    events = list(ask_copilot(ds, "what if half of monthly go annual?", llm=llm))
    assert events[1]["summary"].endswith("customers saved")
    assert float(events[1]["summary"].split()[0]) > 0
