"""
Node 6: Hypothesis Validation
===============================
Action:  Scientific proof check
Tools:   Statistical analysis
Adds:    hypothesis_status, verified_root_causes
"""

from __future__ import annotations

from app.graph.state import RetentionGraphState
from app.rag.store import valid_citations
from app.stats.evidence import cause_evidence


def hypothesis_validation_node(state: RetentionGraphState) -> dict:
    """Validate hypotheses using statistical tests."""
    try:
        diagnosis_results = state.get("diagnosis_results", {})
        merged_hypotheses = diagnosis_results.get("merged_hypotheses", [])
        skeptic_findings = state.get("professional_skeptic_output", {})

        verified_root_causes = []
        rejected_causes = []
        hypothesis_status = "unverified"

        # Validate each hypothesis against skeptic's robustness scores
        robustness_scores = skeptic_findings.get("robustness_scores", {})

        # Evidence gate: a cause must point at a statistic that survived
        # correction (or a significant CoxPH driver). Skipped only when no
        # statistics exist at all, since then there is nothing to check against.
        stats = (state.get("forensic_detective_output") or {}).get("statistical_evidence") or {}
        drivers = ((state.get("feature_store") or {}).get("predictive_churn_risk") or {}).get("driver_features") or []
        gate = bool(stats.get("significance_summary"))

        for hypothesis in merged_hypotheses:
            cause = hypothesis.get("hypothesis", "")
            confidence = hypothesis.get("confidence", 0)
            robustness = robustness_scores.get(cause, 0.5)
            evidence = cause_evidence(cause, stats, drivers) if gate else None
            if evidence is not None and not evidence["supported"]:
                rejected_causes.append({
                    "cause": cause,
                    "reason": "No statistically significant evidence for this in your data.",
                    "families": evidence["families"],
                })
                continue
            # Keep the knowledge-base sources behind each cause: the evidence
            # dossier and groundedness check read them from here.
            provenance = {
                "citations": valid_citations(hypothesis.get("citations")),
                "supported_by": list(hypothesis.get("supported_by") or []),
            }

            # Hypothesis is "verified" if:
            # - Confidence > 0.50 AND
            # - Robustness > 0.35
            if confidence > 0.50 and robustness > 0.35:
                verified_root_causes.append({
                    "cause": cause,
                    "confidence": round(confidence, 3),
                    "robustness": round(robustness, 3),
                    "evidence": "Statistical validation passed",
                    "p_value": evidence["best_p_adj"] if evidence else None,
                    "evidence_stats": evidence["stat_ids"] if evidence else [],
                    "evidence_drivers": evidence["drivers"] if evidence else [],
                    "recommendation": "Proceed to constraint-aware strategy design",
                    **provenance,
                })
                hypothesis_status = "verified"
            elif confidence > 0.35:
                verified_root_causes.append({
                    "cause": cause,
                    "confidence": round(confidence, 3),
                    "robustness": round(robustness, 3),
                    "evidence": "Weak statistical support",
                    "p_value": evidence["best_p_adj"] if evidence else None,
                    "evidence_stats": evidence["stat_ids"] if evidence else [],
                    "evidence_drivers": evidence["drivers"] if evidence else [],
                    "recommendation": "Require additional discovery iterations",
                    **provenance,
                })
                if hypothesis_status != "verified":
                    hypothesis_status = "weak_proof"

        # If no hypotheses could be verified at all, stay unverified
        if not verified_root_causes:
            hypothesis_status = "unverified"

        return {
            "hypothesis_status": hypothesis_status,
            "verified_root_causes": verified_root_causes,
            "validation_metrics": {
                "hypotheses_tested": len(merged_hypotheses),
                "rejected_causes": rejected_causes,
                "hypotheses_verified": len([
                    h for h in verified_root_causes
                    if h.get("evidence") == "Statistical validation passed"
                ]),
                "validation_quality": round(
                    sum(h.get("robustness", 0) for h in verified_root_causes)
                    / max(1, len(verified_root_causes)), 3
                ),
            },
            "current_node": "hypothesis_validation",
        }

    except Exception as e:
        return {
            "hypothesis_status": "unverified",
            "verified_root_causes": [],
            "errors": [f"Hypothesis validation error: {str(e)}"],
            "current_node": "hypothesis_validation",
        }
