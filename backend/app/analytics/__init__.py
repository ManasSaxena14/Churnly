"""
Post-run analytics on a finished run's dataset — no LLM calls.
================================================================
  dataset   reload a run's CSV + confirmed column roles, fit/cache the Cox model
  risk      per-customer churn probability over a horizon + top personal drivers
  whatif    counterfactual scenarios ("move 20% of Monthly to Annual")
  compare   two runs side by side, with BH-corrected drift tests
"""
