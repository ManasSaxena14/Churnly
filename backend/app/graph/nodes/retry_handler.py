"""
Retry Handler
==============
Triggered when Data Audit (Node 2) score < threshold.
Requests better data from the user and loops back to Node 1.
"""

from __future__ import annotations

from app.graph.state import RetentionGraphState


def retry_handler_node(state: RetentionGraphState) -> dict:
    """Handle data-quality failure by requesting better data."""
    try:
        data_quality_score = state.get("data_quality_score", 0.0)
        data_quality_logs = state.get("data_quality_logs", [])
        retry_count = state.get("retry_count", 0) + 1
        max_retries = state.get("max_retries", 3)

        # Compile specific issues from logs
        quality_issues = []
        for log in data_quality_logs:
            if "Null" in log or "missing" in log:
                quality_issues.append("High percentage of missing values")
            if "Duplicate" in log:
                quality_issues.append("Duplicate records detected")
            if "rows" in log.lower() and ("<50" in log or "low" in log.lower()):
                quality_issues.append("Insufficient data volume (minimum 50 rows required)")

        # Generate human-readable message
        if retry_count >= max_retries:
            # Max retries exceeded
            message = (
                f"Unable to process data after {max_retries} attempts. "
                f"Current quality score: {data_quality_score:.1%}. "
                f"Please review your data and contact support."
            )
            status = "FAILED_MAX_RETRIES"
            user_action = "Contact support with your CSV file for manual review"

        else:
            # Request better data
            issues_text = "\n- ".join(quality_issues) if quality_issues else "Unspecified quality issue"
            message = (
                f"Data quality check failed (Score: {data_quality_score:.1%}, Threshold: 70%). "
                f"Issues detected:\n- {issues_text}\n"
                f"Please provide a cleaned dataset and try again. "
                f"(Attempt {retry_count}/{max_retries})"
            )
            status = "AWAITING_USER_DATA"
            user_action = "Upload a cleaned CSV with fewer nulls and duplicates"

        return {
            "retry_count": retry_count,
            "max_retries": max_retries,
            "quality_score": data_quality_score,
            "quality_issues": quality_issues,
            "status": status,
            "user_message": message,
            "user_action": user_action,
            "suggestion": generate_data_quality_suggestions(data_quality_logs),
            "current_node": "retry_handler",
        }

    except Exception as e:
        return {
            "retry_count": state.get("retry_count", 0) + 1,
            "status": "ERROR",
            "user_message": f"Error processing retry: {str(e)}",
            "errors": [*state.get("errors", []), f"Retry handler error: {str(e)}"],
            "current_node": "retry_handler",
        }


def generate_data_quality_suggestions(logs: list) -> list[str]:
    """Generate specific suggestions for data improvement."""
    suggestions = []

    for log in logs:
        if "Null" in log or "missing" in log:
            suggestions.append(
                "Remove rows with >20% missing values or impute using domain knowledge"
            )
        if "Duplicate" in log:
            suggestions.append(
                "Remove or merge duplicate customer records (deduplicate by ID)"
            )
        if "Date range" in log or "type" in log.lower():
            suggestions.append(
                "Ensure date columns are properly formatted; expected format: YYYY-MM-DD"
            )
        if "column" in log.lower():
            suggestions.append(
                "Verify all required columns are present: User_ID, Tenure, Usage, Support"
            )

    # Add defaults if no specific issues found
    if not suggestions:
        suggestions = [
            "Ensure customer ID is unique and non-null",
            "Include engagement metrics (usage, logins, activity)",
            "Provide at least 50+ customer records for statistical significance",
            "Include time-based columns (tenure, signup_date)",
        ]

    return suggestions[:3]  # Return top 3 suggestions
