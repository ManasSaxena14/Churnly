"""
Accounts and sessions — self-hosted, no third-party service.
=============================================================
Storage   SQLite (AUTH_DB_PATH, default backend/data/churnly.sqlite3).
Passwords scrypt (stdlib hashlib) with a per-user random salt; verified in
          constant time. Unknown emails still pay a hash so login timing
          doesn't reveal which emails have accounts.
Sessions  32-byte random token in an HttpOnly cookie. Only its SHA-256 is
          stored, so a leaked database can't be replayed as live sessions.
          Sliding 30-day expiry.
Abuse     Failed logins are rate-limited per email and per client IP.
Reset     No email service is needed: an admin resets a password from the
          server with `python -m app.auth reset-password <email>`, which
          also signs that account out everywhere.

Cookie settings for deployment:
  COOKIE_SECURE=1          send the cookie over HTTPS only (set in production)
  COOKIE_SAMESITE=none     needed when the frontend and API are on different
                           sites (e.g. *.vercel.app → *.onrender.com); requires
                           COOKIE_SECURE=1. Default "lax" works for localhost
                           and same-site deployments.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import pathlib
import re
import secrets
import sqlite3
import threading
import time
import uuid
from collections import defaultdict, deque
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Request, Response

_BACKEND_ROOT = pathlib.Path(__file__).resolve().parent.parent
DB_PATH = pathlib.Path(os.getenv("AUTH_DB_PATH") or (_BACKEND_ROOT / "data" / "churnly.sqlite3"))

COOKIE_NAME = "churnly_session"
SESSION_DAYS = 30
_SCRYPT = {"n": 2 ** 14, "r": 8, "p": 1, "dklen": 64}
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MIN_PASSWORD = 8

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None


# ── storage ──────────────────────────────────────────────────────────────

def _db() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.executescript(
            """
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                created_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at REAL NOT NULL,
                expires_at REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
            """
        )
    return _conn


def reset_for_tests(path: pathlib.Path) -> None:
    global _conn, DB_PATH
    with _lock:
        if _conn is not None:
            _conn.close()
        _conn = None
        DB_PATH = path
        _attempts.clear()


# ── passwords ────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(password.encode(), salt=salt, **_SCRYPT)
    return f"scrypt${_SCRYPT['n']}${_SCRYPT['r']}${_SCRYPT['p']}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt_hex, dk_hex = stored.split("$")
        if algo != "scrypt":
            return False
        dk = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=int(n), r=int(r), p=int(p), dklen=len(dk_hex) // 2)
        return hmac.compare_digest(dk.hex(), dk_hex)
    except Exception:
        return False


_DUMMY_HASH = hash_password(secrets.token_hex(8))


# ── sessions ─────────────────────────────────────────────────────────────

def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _public(row: sqlite3.Row) -> dict[str, Any]:
    return {"id": row["id"], "email": row["email"], "name": row["name"], "created_at": row["created_at"]}


def create_user(email: str, name: str, password: str) -> dict[str, Any]:
    email = email.strip().lower()
    name = name.strip()
    if not _EMAIL_RE.match(email) or len(email) > 254:
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    if not name or len(name) > 80:
        raise HTTPException(status_code=400, detail="Enter your name (up to 80 characters).")
    if len(password) < MIN_PASSWORD:
        raise HTTPException(status_code=400, detail=f"Use at least {MIN_PASSWORD} characters for your password.")
    if len(password) > 256:
        raise HTTPException(status_code=400, detail="That password is too long.")
    row = {"id": str(uuid.uuid4()), "email": email, "name": name, "password_hash": hash_password(password), "created_at": time.time()}
    with _lock:
        try:
            _db().execute(
                "INSERT INTO users (id, email, name, password_hash, created_at) VALUES (:id, :email, :name, :password_hash, :created_at)", row,
            )
            _db().commit()
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="An account with this email already exists — log in instead.")
    return {k: row[k] for k in ("id", "email", "name", "created_at")}


def authenticate(email: str, password: str) -> dict[str, Any] | None:
    with _lock:
        row = _db().execute("SELECT * FROM users WHERE email = ?", (email.strip().lower(),)).fetchone()
    if row is None:
        verify_password(password, _DUMMY_HASH)  # equalise timing
        return None
    return _public(row) if verify_password(password, row["password_hash"]) else None


def reset_password(email: str, new_password: str) -> bool:
    """Set a new password and end every session for that account."""
    if len(new_password) < MIN_PASSWORD:
        raise ValueError(f"Use at least {MIN_PASSWORD} characters for the password.")
    with _lock:
        row = _db().execute("SELECT id FROM users WHERE email = ?", (email.strip().lower(),)).fetchone()
        if row is None:
            return False
        _db().execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(new_password), row["id"]))
        _db().execute("DELETE FROM sessions WHERE user_id = ?", (row["id"],))
        _db().commit()
    return True


def start_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    now = time.time()
    with _lock:
        _db().execute(
            "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (_token_hash(token), user_id, now, now + SESSION_DAYS * 86400),
        )
        _db().execute("DELETE FROM sessions WHERE expires_at < ?", (now,))
        _db().commit()
    return token


def end_session(token: str | None) -> None:
    if not token:
        return
    with _lock:
        _db().execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))
        _db().commit()


def user_for_token(token: str | None) -> dict[str, Any] | None:
    if not token or len(token) > 200:
        return None
    now = time.time()
    with _lock:
        row = _db().execute(
            "SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
            (_token_hash(token),),
        ).fetchone()
        if row is None or row["expires_at"] < now:
            return None
        # sliding expiry: refresh at most once a day
        if row["expires_at"] - now < (SESSION_DAYS - 1) * 86400:
            _db().execute("UPDATE sessions SET expires_at = ? WHERE token_hash = ?", (now + SESSION_DAYS * 86400, _token_hash(token)))
            _db().commit()
    return _public(row)


# ── rate limiting (failed logins) ────────────────────────────────────────

_attempts: dict[str, deque] = defaultdict(deque)
_WINDOW_S = 15 * 60
_MAX_PER_EMAIL = 8
_MAX_PER_IP = 30


def _too_many(key: str, limit: int) -> bool:
    q = _attempts[key]
    cutoff = time.time() - _WINDOW_S
    while q and q[0] < cutoff:
        q.popleft()
    return len(q) >= limit


def _record_failure(*keys: str) -> None:
    now = time.time()
    for k in keys:
        _attempts[k].append(now)


# ── FastAPI wiring ───────────────────────────────────────────────────────

def _cookie_kwargs() -> dict[str, Any]:
    secure = (os.getenv("COOKIE_SECURE") or "").lower() in ("1", "true", "yes")
    samesite = (os.getenv("COOKIE_SAMESITE") or "lax").lower()
    if samesite not in ("lax", "strict", "none"):
        samesite = "lax"
    if samesite == "none":
        secure = True  # browsers reject SameSite=None without Secure
    return {"httponly": True, "secure": secure, "samesite": samesite, "path": "/"}


def _set_cookie(response: Response, token: str) -> None:
    response.set_cookie(COOKIE_NAME, token, max_age=SESSION_DAYS * 86400, **_cookie_kwargs())


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    return (fwd.split(",")[0].strip() if fwd else None) or (request.client.host if request.client else "unknown")


def optional_user(request: Request) -> dict[str, Any] | None:
    return user_for_token(request.cookies.get(COOKIE_NAME))


def require_user(request: Request) -> dict[str, Any]:
    user = optional_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Please log in to continue.")
    return user


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup")
def signup(response: Response, body: dict[str, Any] = Body(...)):
    user = create_user(str(body.get("email") or ""), str(body.get("name") or ""), str(body.get("password") or ""))
    _set_cookie(response, start_session(user["id"]))
    return {"user": user}


@router.post("/login")
def login(request: Request, response: Response, body: dict[str, Any] = Body(...)):
    email = str(body.get("email") or "").strip().lower()
    ip_key, email_key = f"ip:{_client_ip(request)}", f"email:{email}"
    if _too_many(email_key, _MAX_PER_EMAIL) or _too_many(ip_key, _MAX_PER_IP):
        raise HTTPException(status_code=429, detail="Too many attempts. Wait a few minutes and try again.")
    user = authenticate(email, str(body.get("password") or ""))
    if user is None:
        _record_failure(email_key, ip_key)
        raise HTTPException(status_code=401, detail="That email and password don't match.")
    _attempts.pop(email_key, None)
    _set_cookie(response, start_session(user["id"]))
    return {"user": user}


@router.post("/logout")
def logout(request: Request, response: Response):
    end_session(request.cookies.get(COOKIE_NAME))
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me")
def me(user: dict[str, Any] = Depends(require_user)):
    return {"user": user}


if __name__ == "__main__":
    import getpass
    import sys

    if len(sys.argv) != 3 or sys.argv[1] != "reset-password":
        sys.exit("usage: python -m app.auth reset-password <email>")
    pw = getpass.getpass("New password: ")
    if pw != getpass.getpass("Repeat it: "):
        sys.exit("Passwords don't match.")
    try:
        ok = reset_password(sys.argv[2], pw)
    except ValueError as e:
        sys.exit(str(e))
    if not ok:
        sys.exit("No account with that email.")
    print("Password updated; that account was signed out everywhere.")
