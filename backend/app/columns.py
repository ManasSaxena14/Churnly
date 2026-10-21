"""
Column detection, user confirmation, and validation.
=====================================================
The pipeline needs to know which CSV column means what (churn flag, tenure,
usage, …). We auto-detect from names, show the guess to the user, and let
them fix it before anything runs — a wrong churn column silently poisons
every statistic downstream.

Flow:
  POST /columns {file_path}              → detected mapping + per-column profile
  POST /columns {file_path, mapping}     → same, validated against the user's mapping
  POST /analyze {..., column_mapping}    → input_ingest applies it (apply_mapping)

A churn column stored as true/false or yes/no is coerced to 0/1 by writing a
normalized copy of the CSV — every node re-reads the file from disk, so the
fix has to live in the file, not in memory.
"""

from __future__ import annotations

import os
import pathlib
import re
from typing import Any

import pandas as pd

ROLES = ("churn", "tenure", "customer_id", "usage", "support", "plan", "contract", "channel")
REQUIRED_ROLES = ("churn", "tenure")

ROLE_LABELS = {
    "churn": "Did the customer leave? (yes/no)",
    "tenure": "How long they've been a customer",
    "customer_id": "Customer ID",
    "usage": "Usage or logins",
    "support": "Support tickets",
    "plan": "Plan",
    "contract": "Contract length",
    "channel": "Where they came from",
}
_REQUIRED_HINT = {
    "churn": "Choose the column that shows whether each customer left — the analysis needs it.",
    "tenure": "Choose the column that shows how long each customer has been with you — the analysis needs it.",
}

_TRUE = {"1", "true", "yes", "y", "t", "churned", "cancelled", "canceled"}
_FALSE = {"0", "false", "no", "n", "f", "active", "retained"}

UPLOAD_NAME_RE = re.compile(r"^[0-9a-f]{32}(\.normalized)?\.csv$")


def detect_columns(df: pd.DataFrame) -> dict[str, str | None]:
    """Name-based guess for every role. Same heuristics the pipeline always used."""
    # Imported here: app.graph's package init builds the whole graph, which
    # imports input_ingest, which imports this module.
    from app.graph.utils import get_churn_column

    cols_lower = {col.lower(): col for col in df.columns}

    def first(pred) -> str | None:
        return next((cols_lower[k] for k in cols_lower if pred(k)), None)

    plan_col = first(lambda k: "plan" in k) or first(lambda k: "contract" in k)
    return {
        "customer_id": first(lambda k: "id" in k or "user" in k),
        "tenure": first(lambda k: "tenure" in k or "months_active" in k or k == "months"),
        "usage": first(lambda k: "usage" in k or "logins" in k),
        "support": first(lambda k: "support" in k or "tickets" in k),
        "plan": plan_col,
        "contract": first(lambda k: "contract" in k and cols_lower[k] != plan_col),
        "channel": first(lambda k: "acquisition" in k or "channel" in k),
        "churn": get_churn_column(df),
    }


def apply_mapping(
    df: pd.DataFrame, detected: dict[str, str | None], mapping: dict[str, Any] | None,
) -> dict[str, str | None]:
    """User choices win over detection. Unknown roles / columns are ignored;
    an explicit empty value means "this file has no such column"."""
    resolved = dict(detected)
    for role, col in (mapping or {}).items():
        if role not in ROLES:
            continue
        if col in (None, ""):
            resolved[role] = None
        elif col in df.columns:
            resolved[role] = col
    return resolved


def _churn_values(series: pd.Series) -> tuple[pd.Series | None, str | None]:
    """Return a 0/1 int series, or (None, reason) if it can't be read as churn."""
    s = series.dropna()
    if s.empty:
        return None, "it's empty"
    if pd.api.types.is_bool_dtype(s):
        return series.astype("float").astype("Int64"), None
    if pd.api.types.is_numeric_dtype(s):
        uniq = set(pd.unique(s))
        if uniq.issubset({0, 1, 0.0, 1.0}):
            return series.astype("Int64"), None
        return None, f"it should only contain 0 and 1, but has values like {sorted(uniq)[:4]}"
    text = s.astype(str).str.strip().str.lower()
    uniq = set(text.unique())
    if uniq.issubset(_TRUE | _FALSE):
        mapped = series.astype(str).str.strip().str.lower().map(lambda v: 1 if v in _TRUE else (0 if v in _FALSE else None))
        return mapped.astype("Int64"), None
    return None, f"it should contain yes/no values, but has values like {sorted(uniq)[:4]}"


def validate(df: pd.DataFrame, resolved: dict[str, str | None]) -> dict[str, Any]:
    """Blocking errors + soft warnings + a small summary for the confirm screen."""
    errors: list[str] = []
    warnings: list[str] = []
    summary: dict[str, Any] = {"rows": int(len(df)), "columns": int(len(df.columns))}

    for role in REQUIRED_ROLES:
        if not resolved.get(role):
            errors.append(_REQUIRED_HINT[role])

    used = [c for c in resolved.values() if c]
    dupes = sorted({c for c in used if used.count(c) > 1})
    if dupes:
        errors.append(f"Each column can only be used once. Used more than once: {', '.join(dupes)}")

    churn_col = resolved.get("churn")
    if churn_col:
        values, reason = _churn_values(df[churn_col])
        if values is None:
            errors.append(f"'{churn_col}' can't show whether customers left — {reason}.")
        else:
            rate = float(values.mean())
            summary["churn_rate"] = round(rate, 4)
            summary["churn_needs_normalizing"] = needs_churn_normalizing(df, churn_col)
            if rate in (0.0, 1.0):
                errors.append(f"In '{churn_col}', every customer has the same value — we need both customers who left and customers who stayed.")
            elif rate < 0.02 or rate > 0.98:
                warnings.append(f"Only {rate:.1%} of customers {'left' if rate < 0.5 else 'stayed'} — results may be less reliable with so few.")

    tenure_col = resolved.get("tenure")
    if tenure_col:
        t = pd.to_numeric(df[tenure_col], errors="coerce")
        if t.notna().mean() < 0.9:
            errors.append(f"'{tenure_col}' should contain numbers, like months or days as a customer.")
        else:
            if (t < 0).any():
                errors.append(f"'{tenure_col}' has negative values — time as a customer can't be below zero.")
            summary["tenure_min"] = float(t.min())
            summary["tenure_max"] = float(t.max())

    for role in ("usage", "support"):
        col = resolved.get(role)
        if col and pd.to_numeric(df[col], errors="coerce").notna().mean() < 0.9:
            warnings.append(f"'{col}' should contain numbers, so it will be left out of the {role} analysis.")
    for role in ("plan", "contract", "channel"):
        col = resolved.get(role)
        if col and df[col].nunique(dropna=True) > 30:
            warnings.append(f"'{col}' has {df[col].nunique()} different values — that may be too many groups to compare.")

    if len(df) < 100:
        warnings.append(f"Only {len(df)} customers — with this few, it's hard to find patterns we can be confident in.")

    return {"errors": errors, "warnings": warnings, "summary": summary}


def profile_columns(df: pd.DataFrame) -> list[dict[str, Any]]:
    out = []
    for col in df.columns:
        s = df[col]
        out.append({
            "name": str(col),
            # bool first: pandas counts bool as numeric
            "dtype": "bool" if pd.api.types.is_bool_dtype(s) else "number" if pd.api.types.is_numeric_dtype(s) else "text",
            "unique": int(s.nunique(dropna=True)),
            "nulls": int(s.isna().sum()),
            "sample": [str(v) for v in s.dropna().unique()[:3]],
        })
    return out


def normalize_churn_file(csv_path: str, df: pd.DataFrame, churn_col: str) -> str:
    """Write a copy of the CSV with the churn column coerced to 0/1; return its path."""
    values, _ = _churn_values(df[churn_col])
    if values is None:
        return csv_path
    out = df.copy()
    out[churn_col] = values
    p = pathlib.Path(csv_path)
    target = p.with_name(p.stem.replace(".normalized", "") + ".normalized.csv")
    out.to_csv(target, index=False)
    return str(target)


def needs_churn_normalizing(df: pd.DataFrame, churn_col: str | None) -> bool:
    if not churn_col or churn_col not in df.columns:
        return False
    s = df[churn_col].dropna()
    return not s.empty and (pd.api.types.is_bool_dtype(s) or not pd.api.types.is_numeric_dtype(s))


def inspect_upload(upload_dir: str, file_path: str, mapping: dict[str, Any] | None = None) -> dict[str, Any]:
    """Everything the confirm screen needs for one uploaded file."""
    import duckdb

    name = os.path.basename(file_path or "")
    if not UPLOAD_NAME_RE.match(name):
        raise ValueError("Unknown upload id")
    path = os.path.join(upload_dir, name)
    if not os.path.exists(path):
        raise FileNotFoundError(name)
    df = duckdb.connect(":memory:").execute("SELECT * FROM read_csv_auto(?)", [path]).df()
    detected = detect_columns(df)
    resolved = apply_mapping(df, detected, mapping)
    return {
        "file_path": name,
        "columns": profile_columns(df),
        "roles": [{"role": r, "label": ROLE_LABELS[r], "required": r in REQUIRED_ROLES} for r in ROLES],
        "detected": detected,
        "resolved": resolved,
        **validate(df, resolved),
    }
