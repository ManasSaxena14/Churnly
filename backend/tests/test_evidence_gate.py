"""LLM-written root causes only survive when the statistics back them."""

from app.graph.nodes.hypothesis_validation import hypothesis_validation_node

STATS = {
    "significance_summary": {"tests_run": 10},
    "churn_by_contract": {"Monthly": {"churn_rate": 0.7, "size": 300, "significant": True, "stat_id": "contract::Monthly", "p_adj": 0.001}},
    "churn_by_plan_tier": {"Basic": {"churn_rate": 0.47, "size": 300, "significant": False, "stat_id": "plan_tier::Basic", "p_adj": 0.4}},
}
DRIVERS = [
    {"feature": "Last Interaction", "hazard_ratio": 1.02, "p_adj": 0.001, "significant": True},
    {"feature": "usage_logins", "hazard_ratio": 1.001, "p_adj": 0.6, "significant": False},
]


def _run(causes):
    state = {
        "diagnosis_results": {"merged_hypotheses": [{"hypothesis": c, "confidence": 0.9} for c in causes]},
        "professional_skeptic_output": {"robustness_scores": {}},
        "forensic_detective_output": {"statistical_evidence": STATS},
        "feature_store": {"predictive_churn_risk": {"driver_features": DRIVERS}},
    }
    return hypothesis_validation_node(state)


def test_supported_causes_are_kept_with_real_p_values():
    out = _run([
        "Monthly contract customers churn far more than annual ones.",
        "Long gaps since the last interaction raise churn risk.",
    ])
    kept = out["verified_root_causes"]
    assert [c["cause"][:7] for c in kept] == ["Monthly", "Long ga"]
    assert kept[0]["p_value"] == 0.001 and kept[0]["evidence_stats"] == ["contract::Monthly"]
    assert kept[1]["evidence_drivers"] == ["Last Interaction"]


def test_causes_without_significant_evidence_are_rejected():
    out = _run([
        "Value delivery failure in the Basic plan tier.",              # not significant
        "Low engagement: usage_logins hazard ratio 1.001.",           # driver not significant
        "A fundamental product-market fit gap across all segments.",  # no statistic at all
    ])
    assert out["verified_root_causes"] == []
    assert out["hypothesis_status"] == "unverified"
    assert len(out["validation_metrics"]["rejected_causes"]) == 3
