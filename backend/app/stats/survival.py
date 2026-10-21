"""
Shared CoxPH survival model.
=============================
One place that turns a customer table into a fitted Cox proportional-hazards
model, so the pipeline (feature_engineering), per-customer risk scoring, the
what-if lab and run comparison all see identical features and hazard ratios.

Feature rules (unchanged from the original pipeline):
  - numeric columns, minus churn / tenure / the id column and any near-unique
    (>90% distinct) column — identifiers, not behaviour
  - low-cardinality categoricals (2–6 values) one-hot encoded, drop_first,
    named "Column=Value"
  - rows with missing values dropped; columns that become constant dropped
"""

from __future__ import annotations

import warnings
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore", category=UserWarning, module="lifelines")


@dataclass
class CoxModel:
    cph: Any                      # fitted lifelines.CoxPHFitter
    churn_col: str
    tenure_col: str
    id_col: str | None
    numeric_cols: list[str]       # raw numeric covariates
    cat_cols: list[str]           # raw categorical covariates (pre one-hot)
    features: list[str]           # final model columns (after one-hot)
    frame: pd.DataFrame           # modelling frame: features + churn + tenure (index = source row)
    source: pd.DataFrame          # original rows that survived dropna (same index)
    cat_levels: dict[str, list[str]] = field(default_factory=dict)

    @property
    def coefs(self) -> pd.Series:
        return self.cph.params_

    def encode(self, raw: pd.DataFrame) -> pd.DataFrame:
        """Encode raw rows (same schema as the training CSV) into model features."""
        x = raw[self.numeric_cols + self.cat_cols].copy()
        for c in self.cat_cols:
            x[c] = pd.Categorical(x[c].astype(str), categories=self.cat_levels[c])
        if self.cat_cols:
            x = pd.get_dummies(x, columns=self.cat_cols, drop_first=True, dtype=float, prefix_sep="=")
        return x.reindex(columns=self.features, fill_value=0.0).astype(float)


def select_covariates(df: pd.DataFrame, churn_col: str, tenure_col: str, id_col: str | None) -> tuple[list[str], list[str]]:
    numeric_cols = df.select_dtypes(include=["int64", "float64", "int32", "float32"]).columns.tolist()
    numeric = []
    for c in numeric_cols:
        if c in (churn_col, tenure_col, id_col):
            continue
        nunique = df[c].nunique(dropna=True)
        if len(df) > 20 and nunique / max(1, df[c].count()) > 0.9:
            continue
        numeric.append(c)
    cats = [
        c for c in df.select_dtypes(include=["object", "category", "string"]).columns
        if c not in (churn_col, tenure_col, id_col) and 2 <= df[c].nunique(dropna=True) <= 6
    ]
    return numeric, cats


def build_cox_frame(df: pd.DataFrame, churn_col: str, tenure_col: str, id_col: str | None):
    """Return (frame, source_rows, numeric_cols, cat_cols, features, cat_levels)."""
    numeric, cats = select_covariates(df, churn_col, tenure_col, id_col)
    base = df[numeric + cats + [churn_col, tenure_col]].dropna()
    cat_levels = {c: sorted(base[c].astype(str).unique().tolist()) for c in cats}
    model = base.copy()
    for c in cats:
        model[c] = pd.Categorical(model[c].astype(str), categories=cat_levels[c])
    if cats:
        model = pd.get_dummies(model, columns=cats, drop_first=True, dtype=float, prefix_sep="=")
    features = [c for c in model.columns if c not in (churn_col, tenure_col)]
    constant = [c for c in features if model[c].nunique() <= 1]
    if constant:
        model = model.drop(columns=constant)
        features = [c for c in features if c not in constant]
    return model, df.loc[base.index], numeric, cats, features, cat_levels


def fit_cox(df: pd.DataFrame, churn_col: str, tenure_col: str, id_col: str | None = None) -> CoxModel | None:
    """Fit CoxPH on a raw customer table. None when there's nothing to model."""
    from lifelines import CoxPHFitter

    frame, source, numeric, cats, features, cat_levels = build_cox_frame(df, churn_col, tenure_col, id_col)
    if not features or len(frame) <= 10 or frame[churn_col].nunique() < 2:
        return None
    frame = frame.astype({churn_col: int})
    cph = CoxPHFitter(penalizer=0.1)  # small penalizer for convergence stability
    cph.fit(frame, duration_col=tenure_col, event_col=churn_col)
    return CoxModel(
        cph=cph, churn_col=churn_col, tenure_col=tenure_col, id_col=id_col,
        numeric_cols=numeric, cat_cols=cats, features=features, frame=frame,
        source=source, cat_levels=cat_levels,
    )


def churn_within(model: CoxModel, x: pd.DataFrame, tenure: np.ndarray, horizon: float) -> np.ndarray:
    """P(churn within `horizon` more periods | survived to current tenure), per row."""
    surv = model.cph.predict_survival_function(x, times=[float(horizon)], conditional_after=np.asarray(tenure, dtype=float))
    return np.clip(1.0 - surv.to_numpy().ravel(), 0.0, 1.0)


def mean_survival_curve(model: CoxModel, x: pd.DataFrame, times: np.ndarray) -> np.ndarray:
    """Population-average survival S(t) for covariate rows `x`."""
    surv = model.cph.predict_survival_function(x, times=times)
    return surv.mean(axis=1).to_numpy()
