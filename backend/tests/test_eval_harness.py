"""The deterministic layer must recover strong planted drivers and ignore noise."""

from evals.run_evals import _deterministic_layer, aggregate_stats, score_stats
from evals.synth_data import DatasetSpec, generate


def _run(tmp_path, spec):
    path = tmp_path / f"{spec.name}.csv"
    generate(spec).to_csv(path, index=False)
    return score_stats(spec, _deterministic_layer(path))


def test_strong_planted_drivers_are_recovered(tmp_path):
    spec = DatasetSpec(name="strong", seed=101, n_rows=2500, planted={"contract": 2.5, "support": 2.2, "usage": 2.2})
    row = _run(tmp_path, spec)
    for fam in ("contract", "support", "usage"):
        assert row["families"][fam]["correct_bucket"], fam
        assert row["families"][fam]["cox_detected"], fam


def test_no_planted_drivers_means_few_detections(tmp_path):
    rows = [
        _run(tmp_path, DatasetSpec(name=f"null_{i}", seed=500 + i, n_rows=1500, planted={}))
        for i in range(3)
    ]
    summary = aggregate_stats(rows)
    assert summary["driver_recall"] is None  # nothing planted
    assert summary["false_positive_rate"] <= 0.2
