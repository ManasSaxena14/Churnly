/* Numbers shown on the landing page. Copied from
   backend/evals/results/stats-latest.md — regenerate with `make eval` in
   backend/ and update these when they change. Never hand-edit a number that
   didn't come out of the harness. */
export const EVAL_RESULTS = {
  source: "50 synthetic datasets with planted churn drivers · deterministic stats layer",
  datasets: 50,
  withBH: {
    driverRecall: 0.929,
    driverPrecision: 0.886,
    falsePositiveRate: 0.06,
    noiseFalseAlarmDatasets: 0.16,
    coxDriverRecall: 0.821,
  },
  rawP: {
    driverRecall: 0.988,
    driverPrecision: 0.755,
    falsePositiveRate: 0.163,
    noiseFalseAlarmDatasets: 0.34,
    coxDriverRecall: 0.917,
  },
} as const;
