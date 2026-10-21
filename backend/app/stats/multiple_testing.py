"""
Multiple-testing correction.
=============================
Every run fires ~20 z-tests (plan tier × contract × support × usage × tenure
buckets). At alpha=0.05, one of those looks "significant" by pure chance on
most datasets — and the LLM then builds a root cause on it. Benjamini-Hochberg
controls the false discovery rate across the whole family of tests.
"""

from __future__ import annotations

import math
from typing import Sequence


def benjamini_hochberg(p_values: Sequence[float | None]) -> list[float | None]:
    """Return BH-adjusted p-values (q-values), same order as the input.

    `None` / NaN entries are skipped (not counted in m) and stay `None`.
    Matches statsmodels.stats.multitest.multipletests(method="fdr_bh").
    """
    valid = [i for i, p in enumerate(p_values) if p is not None and math.isfinite(p)]
    out: list[float | None] = [None] * len(p_values)
    m = len(valid)
    if m == 0:
        return out

    # Walk ranks from largest p to smallest, enforcing monotonicity:
    # p_adj(k) = min over j>=k of p(j) * m / j
    order = sorted(valid, key=lambda i: p_values[i])  # type: ignore[arg-type]
    running_min = 1.0
    for rank in range(m, 0, -1):
        i = order[rank - 1]
        candidate = float(p_values[i]) * m / rank  # type: ignore[arg-type]
        running_min = min(running_min, candidate)
        out[i] = min(1.0, running_min)
    return out
