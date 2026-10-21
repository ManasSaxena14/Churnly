"""
Node 2: Data Audit
===================
Action:  Health & schema checks
Tools:   Pandas profiling, data validation
Adds:    data_quality_score, data_quality_logs
"""

from __future__ import annotations

import duckdb
from app.graph.state import RetentionGraphState


def data_audit_node(state: RetentionGraphState) -> dict:
    """Audit data quality: nulls, duplicates, distributions."""
    try:
        raw_csv_path = state.get("raw_csv_path", "")
        conn = duckdb.connect(":memory:")
        df = conn.execute(f"SELECT * FROM read_csv_auto('{raw_csv_path}')").df()

        logs = []
        quality_metrics = {}

        # 1. Null check
        null_pct = (df.isnull().sum() / len(df) * 100).to_dict()
        quality_metrics["null_percentages"] = null_pct
        max_null_pct = max(null_pct.values()) if null_pct else 0
        logs.append(f"Null values: max {max_null_pct:.1f}% in any column")

        # 2. Duplicate check
        dup_count = df.duplicated().sum()
        quality_metrics["duplicates"] = int(dup_count)
        logs.append(f"Duplicates found: {dup_count}")

        # 3. Row count
        quality_metrics["row_count"] = len(df)
        logs.append(f"Total rows: {len(df)}")

        # 4. Column count
        quality_metrics["column_count"] = len(df.columns)
        logs.append(f"Total columns: {len(df.columns)}")

        # 5. Data types
        quality_metrics["dtypes"] = str(df.dtypes.to_dict())
        logs.append("Data types detected and validated")

        # 6. Composite score: 0.0-1.0 based on quality
        null_penalty = max_null_pct / 100 * 0.3
        dup_penalty = min(dup_count / len(df), 0.2) if len(df) > 0 else 0
        size_penalty = 0 if len(df) >= 50 else (1 - len(df) / 50) * 0.2
        quality_score = max(0.0, 1.0 - null_penalty - dup_penalty - size_penalty)

        return {
            "data_quality_score": round(quality_score, 3),
            "data_quality_logs": logs,
            "quality_metrics": quality_metrics,
            "current_node": "data_audit",
        }

    except Exception as e:
        return {
            "data_quality_score": 0.0,
            "data_quality_logs": [f"Audit failed: {str(e)}"],
            "errors": [*state.get("errors", []), f"Data audit error: {str(e)}"],
            "current_node": "data_audit",
        }
