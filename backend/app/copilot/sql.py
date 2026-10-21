"""
Read-only SQL over one customer table, for the copilot.
========================================================
Two layers, so a prompt-injected or hallucinated query can't do harm:
  1. a lexical guard — a single SELECT/WITH statement, no DDL/DML, no file or
     extension functions;
  2. DuckDB's own sandbox — `enable_external_access=false` and a locked
     configuration, so even a query that slips past (1) can't read files,
     reach the network, or turn the sandbox back off.
Queries are row-limited and interrupted after a timeout.
"""

from __future__ import annotations

import re
import threading
from typing import Any

import pandas as pd

MAX_ROWS = 50
TIMEOUT_S = 5.0

_BANNED = re.compile(
    r"\b(copy|attach|detach|install|load|pragma|export|import|create|insert|update|delete|drop|alter|"
    r"call|set|reset|checkpoint|vacuum|use|read_\w+|glob|sniff_csv|httpfs|parquet_\w+|duckdb_\w+)\b",
    re.IGNORECASE,
)


class SqlRejected(ValueError):
    pass


def check_sql(query: str) -> str:
    q = (query or "").strip().rstrip(";").strip()
    if not q:
        raise SqlRejected("Empty query.")
    if ";" in q:
        raise SqlRejected("Only one statement is allowed.")
    if not re.match(r"^(select|with)\b", q, re.IGNORECASE):
        raise SqlRejected("Only SELECT queries are allowed.")
    m = _BANNED.search(q)
    if m:
        raise SqlRejected(f"'{m.group(0)}' is not allowed.")
    return q


def run_readonly_sql(df: pd.DataFrame, query: str, max_rows: int = MAX_ROWS) -> dict[str, Any]:
    import duckdb

    q = check_sql(query)
    con = duckdb.connect(":memory:")
    try:
        con.register("customers", df)
        con.execute("SET enable_external_access=false")
        con.execute("SET lock_configuration=true")
        timer = threading.Timer(TIMEOUT_S, con.interrupt)
        timer.start()
        try:
            res = con.execute(f"SELECT * FROM ({q}) AS _q LIMIT {max_rows + 1}").df()
        finally:
            timer.cancel()
    except SqlRejected:
        raise
    except Exception as e:
        raise SqlRejected(f"{type(e).__name__}: {str(e)[:200]}") from e
    finally:
        con.close()
    truncated = len(res) > max_rows
    res = res.head(max_rows)
    return {
        "columns": [str(c) for c in res.columns],
        "rows": [[_jsonable(v) for v in row] for row in res.itertuples(index=False)],
        "row_count": len(res),
        "truncated": truncated,
    }


def _jsonable(v: Any) -> Any:
    if v is None or isinstance(v, (str, bool, int)):
        return v
    try:
        f = float(v)
        return None if f != f else round(f, 6)
    except (TypeError, ValueError):
        return str(v)
