"""
Synthetic churn datasets with PLANTED drivers — ground truth for evals.
========================================================================
Real datasets never tell you the true cause of churn, so you can't measure
whether the pipeline found it. Here we generate customers whose churn hazard
we control exactly:

    hazard = base_hazard × Π (multiplier for every planted driver that applies)
    time_to_churn ~ Exponential(hazard)            (months)
    observed_for  ~ Uniform(1, max_months)         (signup date → censoring)
    churned = time_to_churn <= observed_for
    tenure  = min(time_to_churn, observed_for)

Plantable drivers (each dataset gets a random subset):
    contract  contract_length == "Monthly"        raises churn
    support   support_tickets >= 4                raises churn
    usage     usage_logins in lowest quartile     raises churn

Always-noise columns (no effect on churn, so any "significant" finding there
is a false positive): plan_tier, acquisition_channel, region, monthly_spend.

CLI:
    python -m evals.synth_data --out evals/datasets --n 20 --seed 7
"""

from __future__ import annotations

import argparse
import json
import pathlib
from dataclasses import asdict, dataclass, field

import numpy as np
import pandas as pd

PLANTABLE = ("contract", "support", "usage")
NOISE_FAMILIES = ("plan_tier", "channel")

# The bucket each planted driver should light up (stat_id from app.stats.ztest)
EXPECTED_STAT_ID = {
    "contract": "contract::Monthly",
    "support": "support::high_4_plus",
    "usage": "usage::q1_lowest",
}
# Column (prefix) the CoxPH driver should show up as, and the expected direction
EXPECTED_COX = {
    "contract": ("contract_length=Monthly", "raises_churn"),
    "support": ("support_tickets", "raises_churn"),
    "usage": ("usage_logins", "protects"),  # more usage → lower hazard
}


@dataclass
class DatasetSpec:
    name: str
    seed: int
    n_rows: int
    planted: dict[str, float] = field(default_factory=dict)  # driver → hazard multiplier
    base_monthly_hazard: float = 0.035
    max_months: int = 36


def generate(spec: DatasetSpec) -> pd.DataFrame:
    rng = np.random.default_rng(spec.seed)
    n = spec.n_rows

    contract = rng.choice(["Monthly", "Quarterly", "Annual"], size=n, p=[0.45, 0.25, 0.30])
    plan = rng.choice(["Basic", "Standard", "Premium"], size=n, p=[0.4, 0.35, 0.25])
    channel = rng.choice(
        ["Paid ads", "Organic", "Referral", "Outbound", "Partner"], size=n, p=[0.3, 0.25, 0.2, 0.15, 0.1],
    )
    region = rng.choice(["NA", "EU", "APAC", "LATAM"], size=n)
    tickets = rng.poisson(1.8, size=n)
    usage = np.round(rng.gamma(shape=3.0, scale=12.0, size=n), 1)
    spend = np.round(rng.normal(60, 18, size=n).clip(5, None), 2)

    hazard = np.full(n, spec.base_monthly_hazard)
    if "contract" in spec.planted:
        hazard = np.where(contract == "Monthly", hazard * spec.planted["contract"], hazard)
    if "support" in spec.planted:
        hazard = np.where(tickets >= 4, hazard * spec.planted["support"], hazard)
    if "usage" in spec.planted:
        q1 = np.quantile(usage, 0.25)
        hazard = np.where(usage < q1, hazard * spec.planted["usage"], hazard)

    time_to_churn = rng.exponential(1.0 / hazard)
    observed_for = rng.uniform(1, spec.max_months, size=n)
    churned = (time_to_churn <= observed_for).astype(int)
    tenure = np.round(np.minimum(time_to_churn, observed_for), 1).clip(0.1, None)

    return pd.DataFrame({
        "customer_id": [f"C{spec.seed:03d}{i:05d}" for i in range(n)],
        "tenure_months": tenure,
        "usage_logins": usage,
        "support_tickets": tickets,
        "plan_tier": plan,
        "contract_length": contract,
        "acquisition_channel": channel,
        "region": region,
        "monthly_spend": spend,
        "churned": churned,
    })


def make_suite(n_datasets: int, seed: int = 7) -> list[DatasetSpec]:
    """Random suite: every dataset plants 0–3 drivers at random strengths/sizes."""
    rng = np.random.default_rng(seed)
    specs = []
    for i in range(n_datasets):
        k = int(rng.integers(0, len(PLANTABLE) + 1))
        chosen = list(rng.choice(PLANTABLE, size=k, replace=False)) if k else []
        planted = {d: round(float(rng.uniform(1.4, 2.6)), 2) for d in chosen}
        specs.append(DatasetSpec(
            name=f"synth_{i:02d}",
            seed=seed * 1000 + i,
            n_rows=int(rng.integers(600, 3000)),
            planted=planted,
        ))
    return specs


def write_suite(out_dir: pathlib.Path, specs: list[DatasetSpec]) -> list[pathlib.Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for spec in specs:
        path = out_dir / f"{spec.name}.csv"
        generate(spec).to_csv(path, index=False)
        (out_dir / f"{spec.name}.truth.json").write_text(json.dumps(asdict(spec), indent=2))
        paths.append(path)
    return paths


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default="evals/datasets")
    ap.add_argument("--n", type=int, default=20)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()
    written = write_suite(pathlib.Path(args.out), make_suite(args.n, args.seed))
    print(f"Wrote {len(written)} datasets (+ .truth.json) to {args.out}")
