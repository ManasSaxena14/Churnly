import pathlib

from app import runs
from app.quality import groundedness_report


def _problem(stat_id="contract::Monthly", significant=True, citations=("reforge_aha_001",), mean_lift=0.08):
    return {
        "priority": 1,
        "problem": {"title": "Monthly contracts churn"},
        "rationale_chain": {
            "stat": {"stat_id": stat_id, "significant": significant},
            "cause": {"citations": list(citations)},
            "simulated_outcome": {"mean_lift": mean_lift},
        },
    }


def test_groundedness_requires_all_three_receipts():
    report = groundedness_report({"problems_and_solutions": [
        _problem(),
        _problem(significant=False),
        _problem(citations=()),
        _problem(mean_lift=None),
        _problem(stat_id="(none)"),
    ]})
    assert report["problems"] == 5
    assert report["grounded_rate"] == 0.2
    assert report["citation_rate"] == 0.8
    assert len(report["unsupported"]) == 4


def test_groundedness_handles_empty_playbook():
    assert groundedness_report(None)["grounded_rate"] is None


def test_runs_roundtrip_and_reject_path_traversal(tmp_path, monkeypatch):
    monkeypatch.setattr(runs, "RUNS_DIR", tmp_path)
    runs.save_run("abc-123", [{"type": "complete"}], "complete", {"llm_calls": 3})
    loaded = runs.load_run("abc-123")
    assert loaded["events"] == [{"type": "complete"}]
    assert loaded["metrics"]["llm_calls"] == 3
    assert runs.load_run("../../etc/passwd") is None
    runs.save_run("../evil", [], "complete")
    assert not (tmp_path.parent / "evil.json").exists()


def test_promote_requires_finished_run(tmp_path, monkeypatch):
    import pytest

    monkeypatch.setattr(runs, "RUNS_DIR", tmp_path)
    monkeypatch.setattr(runs, "DEMO_RUN_PATH", tmp_path / "demo" / "demo_run.json")
    monkeypatch.setattr(runs, "FRONTEND_DEMO_PATH", tmp_path / "public" / "demo_run.json")
    runs.save_run("unfinished", [{"type": "risk_ready"}], "error")
    with pytest.raises(SystemExit):
        runs.promote_to_demo("unfinished")
    runs.save_run("good", [{"type": "solution_ready", "data": {}}, {"type": "complete"}], "complete")
    out = runs.promote_to_demo("good")
    assert pathlib.Path(out).exists()
