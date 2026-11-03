import pandas as pd
import pytest

from app.columns import apply_mapping, detect_columns, inspect_upload, normalize_churn_file, validate
from app.graph.nodes.input_ingest import input_ingest_node


def _df(**overrides):
    base = {
        "account_ref": [f"A{i}" for i in range(200)],
        "months_on_platform": [i % 30 + 1 for i in range(200)],
        "cancelled": ["yes" if i % 4 == 0 else "no" for i in range(200)],
        "plan": ["Basic", "Pro"] * 100,
        "weekly_sessions": [i % 9 for i in range(200)],
    }
    base.update(overrides)
    return pd.DataFrame(base)


def test_detection_misses_unusual_names_and_mapping_fixes_it():
    df = _df()
    detected = detect_columns(df)
    assert detected["churn"] is None and detected["tenure"] is None
    report = validate(df, detected)
    assert len(report["errors"]) == 2  # churn + tenure both missing

    resolved = apply_mapping(df, detected, {"churn": "cancelled", "tenure": "months_on_platform", "usage": "weekly_sessions"})
    report = validate(df, resolved)
    assert report["errors"] == []
    assert report["summary"]["churn_rate"] == pytest.approx(0.25)
    assert report["summary"]["churn_needs_normalizing"] is True


def test_mapping_ignores_unknown_roles_and_columns_and_allows_clearing():
    df = _df()
    resolved = apply_mapping(df, detect_columns(df), {"bogus": "plan", "usage": "not_a_column", "plan": None})
    assert "bogus" not in resolved
    assert resolved["plan"] is None


def test_validation_rejects_bad_churn_and_duplicate_roles():
    df = _df(cancelled=[i % 5 for i in range(200)])
    resolved = apply_mapping(df, detect_columns(df), {"churn": "cancelled", "tenure": "cancelled"})
    errors = " ".join(validate(df, resolved)["errors"])
    assert "only be used once" in errors
    assert "only contain 0 and 1" in errors


def test_ingest_applies_mapping_and_normalizes_text_churn(tmp_path):
    path = tmp_path / "custom.csv"
    _df().to_csv(path, index=False)
    out = input_ingest_node({
        "raw_csv_path": str(path), "questionnaire": {}, "errors": [],
        "column_mapping": {"churn": "cancelled", "tenure": "months_on_platform"},
    })
    ctx = out["input_context"]
    assert ctx["detected_columns"]["churn"] == "cancelled"
    assert ctx["column_mapping_source"] == "user_confirmed"
    assert out["raw_csv_path"].endswith(".normalized.csv")
    normalized = pd.read_csv(out["raw_csv_path"])
    assert set(normalized["cancelled"].unique()) == {0, 1}


def test_inspect_upload_rejects_path_tricks(tmp_path):
    with pytest.raises(ValueError):
        inspect_upload(str(tmp_path), "../../etc/passwd")
    name = "a" * 32 + ".csv"
    _df().to_csv(tmp_path / name, index=False)
    report = inspect_upload(str(tmp_path), name, {"churn": "cancelled", "tenure": "months_on_platform"})
    assert report["errors"] == []
    assert {c["name"] for c in report["columns"]} >= {"cancelled", "plan"}


def test_normalize_is_noop_for_unreadable_churn(tmp_path):
    path = tmp_path / "x.csv"
    df = _df(cancelled=["maybe"] * 200)
    df.to_csv(path, index=False)
    assert normalize_churn_file(str(path), df, "cancelled") == str(path)
