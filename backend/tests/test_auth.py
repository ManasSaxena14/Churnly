"""Accounts: signup/login/logout, hashing, sessions, rate limits, run ownership."""

import pytest
from fastapi.testclient import TestClient

from app import auth, runs


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("INNGEST_DEV", "1")
    auth.reset_for_tests(tmp_path / "auth.sqlite3")
    monkeypatch.setattr(runs, "RUNS_DIR", tmp_path / "runs")
    monkeypatch.setattr("app.analytics.workspace.RUNS_DIR", tmp_path / "runs")
    import app.main as main
    return TestClient(main.app)


def signup(c, email="ana@example.com", password="correct horse", name="Ana"):
    return c.post("/auth/signup", json={"name": name, "email": email, "password": password})


def test_password_hashing_is_salted_and_verifiable():
    a, b = auth.hash_password("hunter22!"), auth.hash_password("hunter22!")
    assert a != b and a.startswith("scrypt$")
    assert auth.verify_password("hunter22!", a)
    assert not auth.verify_password("hunter23!", a)
    assert not auth.verify_password("x", "garbage")


def test_signup_sets_httponly_cookie_and_me_works(client):
    r = signup(client)
    assert r.status_code == 200 and r.json()["user"]["email"] == "ana@example.com"
    cookie = r.headers["set-cookie"]
    assert "churnly_session=" in cookie and "HttpOnly" in cookie and "samesite=lax" in cookie.lower()
    assert client.get("/auth/me").json()["user"]["name"] == "Ana"
    assert "password_hash" not in client.get("/auth/me").text


def test_validation_and_duplicates(client):
    assert signup(client, email="not-an-email").status_code == 400
    assert signup(client, password="short").status_code == 400
    assert signup(client).status_code == 200
    dup = signup(client, email="ANA@example.com")  # emails are case-insensitive
    assert dup.status_code == 409


def test_login_logout_cycle(client):
    signup(client)
    client.post("/auth/logout")
    assert client.get("/auth/me").status_code == 401
    assert client.post("/auth/login", json={"email": "ana@example.com", "password": "wrong pass"}).status_code == 401
    ok = client.post("/auth/login", json={"email": " Ana@Example.com ", "password": "correct horse"})
    assert ok.status_code == 200
    assert client.get("/auth/me").status_code == 200


def test_sessions_are_stored_hashed(client):
    signup(client)
    token = client.cookies.get("churnly_session")
    rows = auth._db().execute("SELECT token_hash FROM sessions").fetchall()
    assert token and all(r["token_hash"] != token for r in rows)


def test_failed_logins_are_rate_limited(client):
    signup(client)
    client.post("/auth/logout")
    for _ in range(8):
        client.post("/auth/login", json={"email": "ana@example.com", "password": "nope nope"})
    blocked = client.post("/auth/login", json={"email": "ana@example.com", "password": "correct horse"})
    assert blocked.status_code == 429


def test_protected_endpoints_need_login(client):
    for method, path in [("get", "/runs"), ("get", "/compare?a=x&b=y"), ("post", "/analyze"), ("get", "/runs/x")]:
        r = getattr(client, method)(path, **({"json": {}} if method == "post" else {}))
        assert r.status_code == 401, path
    assert client.get("/healthz").status_code == 200


def test_users_only_see_their_own_runs(client):
    signup(client, email="ana@example.com")
    ana = client.get("/auth/me").json()["user"]["id"]
    runs.save_run("run-ana", [{"type": "complete"}], "complete", {}, {"owner": ana})
    runs.save_run("run-legacy", [{"type": "complete"}], "complete", {}, {})
    assert {r["job_id"] for r in client.get("/runs").json()["runs"]} == {"run-ana", "run-legacy"}

    client.post("/auth/logout")
    signup(client, email="ben@example.com", name="Ben")
    seen = {r["job_id"] for r in client.get("/runs").json()["runs"]}
    assert "run-ana" not in seen and "run-legacy" in seen
    assert client.get("/runs/run-ana").status_code == 404  # not 403: don't confirm it exists
    assert client.get("/runs/run-ana/risk").status_code == 404


def test_reset_password_cli_helper(tmp_path):
    auth.reset_for_tests(tmp_path / "auth.sqlite3")
    user = auth.create_user("reset@example.com", "Reset", "old-password-1")
    token = auth.start_session(user["id"])
    assert auth.reset_password("Reset@Example.com", "new-password-2") is True
    assert auth.user_for_token(token) is None
    assert auth.authenticate("reset@example.com", "old-password-1") is None
    assert auth.authenticate("reset@example.com", "new-password-2") is not None
    assert auth.reset_password("nobody@example.com", "new-password-2") is False
