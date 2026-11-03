"""Risk scoring, what-if, drift comparison, workspace list, API surface."""

import pytest

from app import runs
from app.analytics import dataset as dataset_mod, risk as risk_mod
from app.analytics.compare import compare_runs
from app.analytics.dataset import DatasetUnavailable, load_run_dataset
from app.analytics.whatif import levers, run_scenario
from app.analytics.workspace import list_runs
from evals.synth_data import DatasetSpec, generate


@pytest.fixture
def store(tmp_path, monkeypatch):
    monkeypatch.setattr(runs, "RUNS_DIR", tmp_path / "runs")
    monkeypatch.setattr("app.analytics.workspace.RUNS_DIR", tmp_path / "runs")
    dataset_mod.clear_cache()
    risk_mod.clear_cache()

    def make(job_id, spec, events=None, status="complete"):
        csv = tmp_path / f"{job_id}.csv"
        generate(spec).to_csv(csv, index=False)
        runs.save_run(job_id, events or [{"type": "complete", "data": {}}], status, {"llm_calls": 3},
                      {"raw_csv_path": str(csv), "dataset_name": f"{job_id}.csv",
                       "detected_columns": {"churn": "churned", "tenure": "tenure_months"}})
        return csv

    yield make
    dataset_mod.clear_cache()
    risk_mod.clear_cache()


def test_risk_scores_concentrate_on_planted_driver(store):
    store("run-a", DatasetSpec(name="a", seed=11, n_rows=2500, planted={"contract": 2.6}))
    ds = load_run_dataset("run-a")
    rep = risk_mod.risk_report(ds, horizon=6, limit=200)
    s = rep["summary"]
    assert s["active_customers"] == sum(s["tiers"].values())
    assert 0 < s["expected_churners"] < s["active_customers"]
    top = rep["customers"][:100]
    assert all(top[i]["risk"] >= top[i + 1]["risk"] for i in range(len(top) - 1))
    monthly = sum(1 for c in top if any("contract_length = Monthly" in d["label"] for d in c["drivers"]))
    assert monthly / len(top) > 0.8  # the riskiest customers are the planted segment
    assert s["top_drivers"][0]["driver"].startswith("contract_length")
    csv_text = risk_mod.risk_csv(ds, horizon=6)
    assert csv_text.splitlines()[0].startswith("customer_id,tenure,churn_probability_next_6,tier,top_drivers")


def test_whatif_moving_customers_off_risky_contract_saves_them(store):
    store("run-w", DatasetSpec(name="w", seed=12, n_rows=2000, planted={"contract": 2.4, "support": 2.0}))
    ds = load_run_dataset("run-w")
    lv = levers(ds)
    assert any(c["column"] == "contract_length" for c in lv["categorical"])
    res = run_scenario(ds, [{"kind": "shift", "column": "contract_length", "from": "Monthly", "to": "Annual", "share": 0.5}], horizon=6)
    assert res["customers_saved"] > 0
    assert res["scenario"]["churn_rate"] < res["baseline"]["churn_rate"]
    assert len(res["curve"]) == 40 and res["curve"][-1]["scenario"] >= res["curve"][-1]["baseline"]
    support = run_scenario(ds, [{"kind": "scale", "column": "support_tickets", "factor": 0.3}], horizon=6)
    assert support["customers_saved"] > 0
    noop = run_scenario(ds, [{"kind": "shift", "column": "contract_length", "from": "Monthly", "to": "Lifetime", "share": 1}])
    assert noop["applied"] == [] and noop["customers_saved"] == 0


def test_compare_flags_real_drift_only(store):
    store("before", DatasetSpec(name="b", seed=21, n_rows=3000, planted={}))
    store("after", DatasetSpec(name="c", seed=22, n_rows=3000, planted={"contract": 2.6}))
    store("again", DatasetSpec(name="d", seed=23, n_rows=3000, planted={}))
    drift = compare_runs(load_run_dataset("before"), load_run_dataset("after"))
    flagged = {s["stat_id"] for s in drift["segments"] if s["significant"]}
    assert "contract::Monthly" in flagged
    assert drift["overall"]["delta_pp"] > 0 and len(drift["km"]["a"]) == 30
    calm = compare_runs(load_run_dataset("before"), load_run_dataset("again"))
    assert calm["significant_changes"] <= 1  # BH keeps null-vs-null drift quiet


def test_workspace_lists_runs_and_missing_data(store, tmp_path):
    csv = store("run-x", DatasetSpec(name="x", seed=31, n_rows=400, planted={}),
                events=[{"type": "risk_ready", "data": {"total_active": 250, "high_risk_count": 40}},
                        {"type": "churn_profile_ready", "data": {"churn_probability": 31.5, "milestone_retention": {"month_1": 0.9, "month_6": 0.7}}},
                        {"type": "complete", "data": {}}])
    out = list_runs()
    row = out["runs"][0]
    assert row["job_id"] == "run-x" and row["data_available"] is True
    assert row["retention_curve"] == [(1, 0.9), (6, 0.7)]
    assert out["kpis"]["customers_analyzed"] == 250
    csv.unlink()
    dataset_mod.clear_cache()
    assert list_runs()["runs"][0]["data_available"] is False
    with pytest.raises(DatasetUnavailable):
        load_run_dataset("run-x")


def test_api_endpoints(store, monkeypatch, tmp_path):
    monkeypatch.setenv("INNGEST_DEV", "1")
    from fastapi.testclient import TestClient
    import app.main as main

    from app import auth
    auth.reset_for_tests(tmp_path / "auth.sqlite3")
    store("api-run", DatasetSpec(name="api", seed=41, n_rows=1500, planted={"contract": 2.2}))
    client = TestClient(main.app)
    assert client.get("/runs").status_code == 401  # login required
    client.post("/auth/signup", json={"name": "Ana", "email": "ana@example.com", "password": "correct horse"})
    assert client.get("/runs").json()["kpis"]["runs"] == 1
    r = client.get("/runs/api-run/risk", params={"horizon": 3, "tier": "high", "limit": 5})
    assert r.status_code == 200 and all(c["tier"] == "high" for c in r.json()["customers"])
    assert client.get("/runs/api-run/risk.csv").headers["content-type"].startswith("text/csv")
    w = client.post("/runs/api-run/whatif", json={"levers": [{"kind": "cap", "column": "support_tickets", "max": 2}]})
    assert w.status_code == 200 and "customers_saved" in w.json()
    assert client.get("/runs/nope/risk").status_code == 404
    assert client.get("/compare", params={"a": "api-run", "b": "api-run"}).status_code == 400
