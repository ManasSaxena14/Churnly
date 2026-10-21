"""Reload a finished run's dataset and fit (or reuse) its survival model."""

from __future__ import annotations

import os
import pathlib
import threading
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any

import pandas as pd

from app.columns import detect_columns
from app.runs import load_demo, load_run
from app.stats.survival import CoxModel, fit_cox

_BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[2]
# Where bundled sample CSVs may live (the demo dataset ships in frontend/public).
_SAMPLE_DIRS = (_BACKEND_ROOT / "dataForTesting", _BACKEND_ROOT.parent / "frontend" / "public")

# Columns that look like money — used for "revenue at risk".
_VALUE_HINTS = ("mrr", "arr", "revenue", "ltv", "spend", "monthly_charges", "monthlycharges", "value", "price")


class DatasetUnavailable(Exception):
    """The run exists but its CSV is gone (temp dir cleared, other machine…)."""


@dataclass
class RunDataset:
    job_id: str
    df: pd.DataFrame
    detected: dict[str, str | None]
    churn_col: str
    tenure_col: str
    value_col: str | None
    model: CoxModel | None
    run: dict[str, Any]


_cache: "OrderedDict[str, RunDataset]" = OrderedDict()
_lock = threading.Lock()
_MAX_CACHED = 6


def _resolve_path(meta: dict[str, Any]) -> str | None:
    raw = meta.get("raw_csv_path")
    if raw and os.path.exists(raw):
        return raw
    # Promoted demo runs point at a temp file from another machine; fall back
    # to the bundled sample with the same name so the demo stays interactive.
    name = os.path.basename(meta.get("dataset_name") or raw or "")
    for folder in _SAMPLE_DIRS:
        sample = folder / name
        if name and sample.exists():
            return str(sample)
    return None


def _value_column(df: pd.DataFrame, used: set[str]) -> str | None:
    for col in df.columns:
        if col in used or not pd.api.types.is_numeric_dtype(df[col]) or pd.api.types.is_bool_dtype(df[col]):
            continue
        key = col.lower().replace(" ", "_")
        if any(h in key for h in _VALUE_HINTS):
            return col
    return None


def load_run_dataset(job_id: str) -> RunDataset:
    with _lock:
        if job_id in _cache:
            _cache.move_to_end(job_id)
            return _cache[job_id]

    run = load_run(job_id) or (load_demo() if job_id == "demo" else None)
    if run is None:
        raise KeyError(job_id)
    meta = run.get("meta") or {}
    path = _resolve_path(meta)
    if not path:
        raise DatasetUnavailable("The dataset for this run is no longer on the server — re-upload the CSV to use this feature.")

    import duckdb
    df = duckdb.connect(":memory:").execute("SELECT * FROM read_csv_auto(?)", [path]).df()
    detected = dict(detect_columns(df))
    for role, col in (meta.get("detected_columns") or {}).items():
        if col is None or col in df.columns:
            detected[role] = col
    churn_col, tenure_col = detected.get("churn"), detected.get("tenure")
    if not churn_col or not tenure_col:
        raise DatasetUnavailable("This run has no confirmed churn and tenure columns.")

    # A text churn flag was normalised to 0/1 at ingest; do the same here.
    if not pd.api.types.is_numeric_dtype(df[churn_col]) or pd.api.types.is_bool_dtype(df[churn_col]):
        from app.columns import _churn_values
        values, _ = _churn_values(df[churn_col])
        if values is None:
            raise DatasetUnavailable(f"Churn column '{churn_col}' isn't readable as 0/1.")
        df[churn_col] = values

    used = {c for c in detected.values() if c}
    model = fit_cox(df, churn_col, tenure_col, detected.get("customer_id"))
    ds = RunDataset(
        job_id=job_id, df=df, detected=detected, churn_col=churn_col, tenure_col=tenure_col,
        value_col=_value_column(df, used), model=model, run=run,
    )
    with _lock:
        _cache[job_id] = ds
        while len(_cache) > _MAX_CACHED:
            _cache.popitem(last=False)
    return ds


def clear_cache() -> None:
    with _lock:
        _cache.clear()
