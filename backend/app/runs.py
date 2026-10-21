"""
Run storage + cached demo.
===========================
Finished runs (their SSE event history + final metrics) are written to
RUNS_DIR as JSON, so:
  - a page refresh after a backend restart still replays the run,
  - any good run can be promoted to the instant-load demo.

Only the event stream is stored — aggregated stats, LLM findings and the
playbook. The uploaded CSV itself is never copied here.

Promote a finished run to the demo (writes the backend copy and a static
copy the frontend can serve with no backend at all):

    python -m app.runs promote <job_id>
"""

from __future__ import annotations

import json
import os
import pathlib
import re
import sys
import time
from typing import Any

_BACKEND_ROOT = pathlib.Path(__file__).resolve().parent.parent
RUNS_DIR = pathlib.Path(os.getenv("RUNS_DIR") or (_BACKEND_ROOT / "runs"))
DEMO_RUN_PATH = pathlib.Path(__file__).resolve().parent / "demo" / "demo_run.json"
FRONTEND_DEMO_PATH = _BACKEND_ROOT.parent / "frontend" / "public" / "demo_run.json"

_JOB_ID_RE = re.compile(r"^[A-Za-z0-9-]{1,64}$")


def _path_for(job_id: str) -> pathlib.Path | None:
    # job ids are uuid4 strings; refuse anything else so a crafted id can't
    # escape RUNS_DIR.
    if not _JOB_ID_RE.match(job_id or ""):
        return None
    return RUNS_DIR / f"{job_id}.json"


def save_run(
    job_id: str, events: list[dict[str, Any]], status: str,
    metrics: dict[str, Any] | None = None, meta: dict[str, Any] | None = None,
) -> None:
    path = _path_for(job_id)
    if path is None:
        return
    try:
        RUNS_DIR.mkdir(parents=True, exist_ok=True)
        payload = {
            "job_id": job_id,
            "status": status,
            "saved_at": time.time(),
            "metrics": metrics or {},
            # Where the dataset lives + which columns play which role, so the
            # risk list / what-if / copilot can reload it. A path only — the
            # CSV itself is never copied into the run store.
            "meta": meta or {},
            "events": events,
        }
        tmp = path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(payload, default=str))
        tmp.replace(path)
    except Exception as e:
        print(f"[runs] failed to save run {job_id}: {e}", flush=True)


def load_run(job_id: str) -> dict[str, Any] | None:
    path = _path_for(job_id)
    if path is None or not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except Exception:
        return None


def load_demo() -> dict[str, Any] | None:
    if not DEMO_RUN_PATH.exists():
        return None
    try:
        return json.loads(DEMO_RUN_PATH.read_text())
    except Exception:
        return None


def promote_to_demo(job_id: str) -> pathlib.Path:
    run = load_run(job_id)
    if run is None:
        raise SystemExit(f"No saved run for job {job_id} in {RUNS_DIR}")
    if not any(e.get("type") == "solution_ready" for e in run.get("events", [])):
        raise SystemExit(f"Run {job_id} has no solution_ready event — pick a run that finished.")
    run = {**run, "job_id": "demo", "demo": True}
    blob = json.dumps(run, default=str)
    DEMO_RUN_PATH.parent.mkdir(parents=True, exist_ok=True)
    DEMO_RUN_PATH.write_text(blob)
    if FRONTEND_DEMO_PATH.parent.exists():
        FRONTEND_DEMO_PATH.write_text(blob)
    return DEMO_RUN_PATH


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "promote":
        out = promote_to_demo(sys.argv[2])
        print(f"Demo written to {out}" + (f" and {FRONTEND_DEMO_PATH}" if FRONTEND_DEMO_PATH.exists() else ""))
    elif len(sys.argv) == 2 and sys.argv[1] == "list":
        for p in sorted(RUNS_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
            run = json.loads(p.read_text())
            types = {e.get("type") for e in run.get("events", [])}
            print(f"{run['job_id']}  status={run.get('status')}  complete={'solution_ready' in types}")
    else:
        print("usage: python -m app.runs list | promote <job_id>")
