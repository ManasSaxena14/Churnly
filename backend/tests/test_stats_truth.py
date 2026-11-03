"""The statistics engine recovers known ground truth (synthetic data with
planted effects), so a regression in the maths fails loudly."""

import numpy as np
import pandas as pd

from app.stats import compute_bucket_stats
from app.stats.survival import fit_cox
from evals.synth_data import DatasetSpec, generate


def test_flat_risk_shows_no_tenure_cliff():
    df = generate(DatasetSpec(name="flat", seed=8, n_rows=4000, planted={}))
    buckets = compute_bucket_stats(df, "churned", {"tenure": "tenure_months"})["churn_rate_by_tenure_bucket"]
    true_monthly = 1 - np.exp(-0.035)
    for b in buckets.values():
        assert not b["significant"]
        assert abs(b["churn_rate"] - true_monthly) < 0.012


def test_real_onboarding_cliff_is_detected():
    rng = np.random.default_rng(4)
    n = 4000
    early = rng.exponential(1 / 0.105, n)
    ttc = np.where(early < 1, early, 1 + rng.exponential(1 / 0.035, n))
    obs = rng.uniform(1, 36, n)
    df = pd.DataFrame({"tenure_months": np.minimum(ttc, obs), "churned": (ttc <= obs).astype(int)})
    b = compute_bucket_stats(df, "churned", {"tenure": "tenure_months"})["churn_rate_by_tenure_bucket"]["0_1mo"]
    assert b["significant"] and b["rate_ratio"] > 2


def test_cox_hazard_ratio_is_not_shrunk():
    df = generate(DatasetSpec(name="hr", seed=3, n_rows=6000, planted={"contract": 2.0}))
    m = fit_cox(df[["tenure_months", "churned", "contract_length", "monthly_spend"]], "churned", "tenure_months")
    # Monthly vs the reference level (Annual, first alphabetically): true ratio 2.0
    hr = float(np.exp(m.coefs["contract_length=Monthly"]))
    assert 1.8 < hr < 2.2
