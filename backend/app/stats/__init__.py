"""
Stats engine — pure math, no LLM.
==================================
Everything the agents reason over is computed here first:
two-proportion z-tests per bucket, Benjamini-Hochberg correction across all
tests, and the bucket tables the forensic detective + eval harness share.
"""

from app.stats.multiple_testing import benjamini_hochberg
from app.stats.ztest import apply_significance, two_proportion_pvalue, multiple_testing_mode
from app.stats.buckets import compute_bucket_stats

__all__ = [
    "benjamini_hochberg",
    "apply_significance",
    "two_proportion_pvalue",
    "multiple_testing_mode",
    "compute_bucket_stats",
]
