import pytest

from app.stats import apply_significance, benjamini_hochberg, two_proportion_pvalue


def test_bh_matches_hand_computed_values():
    # sorted: .005 .01 .03 .04 → ×4/rank → .02 .02 .04 .04 (already monotone)
    adj = benjamini_hochberg([0.01, 0.04, 0.03, 0.005])
    assert adj == pytest.approx([0.02, 0.04, 0.04, 0.02])


def test_bh_enforces_monotonicity_and_caps_at_one():
    adj = benjamini_hochberg([0.04, 0.041, 0.9])
    # rank 3: .9 ; rank 2: .041*1.5=.0615 ; rank 1: min(.0615, .04*3=.12) = .0615
    assert adj == pytest.approx([0.0615, 0.0615, 0.9])
    assert all(a <= 1 for a in benjamini_hochberg([0.5, 0.9, 0.99]))


def test_bh_skips_missing_values():
    adj = benjamini_hochberg([None, 0.01, float("nan"), 0.02])
    assert adj[0] is None and adj[2] is None
    # m = 2 valid tests
    assert adj[1] == pytest.approx(0.02)
    assert adj[3] == pytest.approx(0.02)


def test_two_proportion_pvalue_edge_cases():
    assert two_proportion_pvalue(1, 1, 5, 10) is None  # too small
    assert two_proportion_pvalue(0, 10, 0, 10) is None  # zero variance
    p = two_proportion_pvalue(80, 100, 20, 100)
    assert p is not None and p < 1e-10


def _stats():
    # 1000 customers, 300 churned. contract::Monthly is a huge real effect;
    # plan buckets are noise-sized wiggles.
    return {
        "churn_rate": 0.3,
        "churn_by_contract": {
            "Monthly": {"churn_rate": 0.6, "size": 300, "churned": 180},
            "Annual": {"churn_rate": 0.171, "size": 700, "churned": 120},
        },
        "churn_by_plan_tier": {
            "Basic": {"churn_rate": 0.33, "size": 300, "churned": 99},
            "Premium": {"churn_rate": 0.287, "size": 700, "churned": 201},
        },
        "time_to_churn_distribution": {"mean": 4.0},
    }


def test_apply_significance_annotates_every_bucket():
    stats = _stats()
    summary = apply_significance(stats, total_churned=300, total_n=1000, mode="bh")
    monthly = stats["churn_by_contract"]["Monthly"]
    assert monthly["stat_id"] == "contract::Monthly"
    assert monthly["significant"] is True
    assert monthly["p_adj"] >= monthly["p_value"]
    basic = stats["churn_by_plan_tier"]["Basic"]
    assert basic["stat_id"] == "plan_tier::Basic"
    assert basic["significant"] is False
    assert summary["tests_run"] == 4
    assert summary["correction"] == "benjamini_hochberg"


def test_raw_mode_uses_unadjusted_p(monkeypatch):
    stats = _stats()
    # A borderline bucket that is significant raw but not after correction.
    stats["churn_by_channel"] = {"Paid": {"churn_rate": 0.36, "size": 250, "churned": 90}}
    apply_significance(stats, total_churned=300, total_n=1000, mode="none")
    paid = stats["churn_by_channel"]["Paid"]
    assert paid["significant"] == paid["significant_raw"]

    monkeypatch.setenv("RETAIN_MULTIPLE_TESTING", "none")
    stats2 = _stats()
    s = apply_significance(stats2, total_churned=300, total_n=1000)
    assert s["correction"] == "none"
