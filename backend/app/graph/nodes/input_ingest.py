"""
Node 1: Input Ingest
=====================
Action:  Normalize diverse CSV schemas using DuckDB
Tools:   DuckDB
Adds:    input_context, input_constraints
"""

from __future__ import annotations

import duckdb
from app.graph.state import RetentionGraphState
from app.shared import UPLOAD_DIR
from app.columns import apply_mapping, detect_columns, needs_churn_normalizing, normalize_churn_file


def input_ingest_node(state: RetentionGraphState) -> dict:
    """Load CSV and normalize to standard customer schema."""
    import os
    try:
        raw_csv_path = state.get("raw_csv_path", "")
        
        # Path resolution: check temp uploads first, then fallback to local data/ folder
        if raw_csv_path and not os.path.isabs(raw_csv_path):
            basename = os.path.basename(raw_csv_path)
            
            upload_path = os.path.join(UPLOAD_DIR, basename)
            local_data_path = os.path.join(os.getcwd(), "data", basename)
            
            if os.path.exists(upload_path):
                raw_csv_path = upload_path
            elif os.path.exists(local_data_path):
                raw_csv_path = local_data_path
            else:
                raise FileNotFoundError(f"File '{basename}' not found in uploads or local data.")

        questionnaire = state.get("questionnaire", {})

        # Load CSV with DuckDB (auto-detects schema)
        conn = duckdb.connect(":memory:")
        df = conn.execute(f"SELECT * FROM read_csv_auto('{raw_csv_path}')").df()

        # Detect key columns from names, then apply what the user confirmed on
        # the column-confirmation screen (their choice always wins).
        detected = detect_columns(df)
        user_mapping = state.get("column_mapping") or {}
        resolved = apply_mapping(df, detected, user_mapping)

        # A true/false or yes/no churn column is rewritten as 0/1 in a copy of
        # the file — every downstream node re-reads the CSV from disk.
        if needs_churn_normalizing(df, resolved.get("churn")):
            raw_csv_path = normalize_churn_file(raw_csv_path, df, resolved["churn"])

        input_context = {
            "source": raw_csv_path,
            "row_count": len(df),
            "column_count": len(df.columns),
            "detected_columns": resolved,
            "column_mapping_source": "user_confirmed" if user_mapping else "auto_detected",
            "business_context": questionnaire.get("business_context", ""),
            "industry": questionnaire.get("industry", ""),
            "company_size": questionnaire.get("size", ""),
        }

        input_constraints = {
            "time_range": questionnaire.get("time_range", "last_12_months"),
            "product_lines": questionnaire.get("product_lines", []),
            "market_segment": questionnaire.get("market_segment", ""),
            "budget_constraints": questionnaire.get("budget", ""),
            "legal_constraints": questionnaire.get("legal_constraints", []),
        }

        return {
            "raw_csv_path": raw_csv_path,  # propagate resolved absolute path to all downstream nodes
            "normalized_df": df.to_dict(orient="records"),  # serialize for state
            "input_context": input_context,
            "input_constraints": input_constraints,
            "current_node": "input_ingest",
            "retry_count": state.get("retry_count", 0),
        }

    except Exception as e:
        return {
            "errors": [*state.get("errors", []), f"Input ingest error: {str(e)}"],
            "current_node": "input_ingest",
            "retry_count": state.get("retry_count", 0) + 1,
        }
