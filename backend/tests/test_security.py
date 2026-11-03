"""Request hardening: uploads can only be referenced by the ids /upload issues,
errors don't leak internals, and the copilot is bounded and rate-limited."""

import pytest
from fastapi.testclient import TestClient

from app import auth, runs
from app.columns import resolve_upload


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("INNGEST_DEV", "1")
    auth.reset_for_tests(tmp_path / "auth.sqlite3")
    monkeypatch.setattr(runs, "RUNS_DIR", tmp_path / "runs")
    monkeypatch.setattr("app.analytics.workspace.RUNS_DIR", tmp_path / "runs")
    import app.main as main
    c = TestClient(main.app)
    c.post("/auth/signup", json={"name": "Ana", "email": "ana@example.com", "password": "correct horse"})
    return c


@pytest.mark.parametrize("bad", [
    "/etc/passwd",
    "../data/churnly.sqlite3",
    "churnly.sqlite3",
    "x'); COPY (SELECT 1) TO '/tmp/pwn.csv'; --",
    "data/" + "a" * 32 + ".csv",
    "",
])
def test_resolve_upload_rejects_anything_but_issued_ids(tmp_path, bad):
    with pytest.raises((ValueError, FileNotFoundError)):
        resolve_upload(str(tmp_path), bad)


def test_resolve_upload_accepts_issued_id(tmp_path):
    name = "a" * 32 + ".csv"
    (tmp_path / name).write_text("id,churn\n1,0\n")
    assert resolve_upload(str(tmp_path), name).endswith(name)


@pytest.mark.parametrize("path", ["/etc/hosts", "../../backend/data/churnly.sqlite3", "x');--"])
def test_analyze_refuses_paths_it_did_not_issue(client, path):
    r = client.post("/analyze", json={"raw_csv_path": path, "questionnaire": {}})
    assert r.status_code == 400
    assert "Traceback" not in r.text


def test_copilot_rejects_oversized_questions(client):
    r = client.post("/runs/demo/copilot", json={"question": "x" * 5000})
    assert r.status_code == 400


def test_copilot_rate_limit(client, monkeypatch):
    import app.main as main
    monkeypatch.setattr(main, "COPILOT_RATE", (2, 600))
    monkeypatch.setattr(main, "_copilot_calls", {})
    codes = [client.post("/runs/nope/copilot", json={"question": "hi"}).status_code for _ in range(3)]
    assert codes[-1] == 429 and 429 not in codes[:2]
