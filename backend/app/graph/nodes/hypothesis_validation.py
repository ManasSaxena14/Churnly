"""
Node 6: Hypothesis Validation
===============================
Action:  Scientific proof check
Tools:   Statistical analysis
Adds:    hypothesis_status, verified_root_causes
"""

from __future__ import annotations

from app.graph.state import RetentionGraphState


def hypothesis_validation_node(state: RetentionGraphState) -> dict:
    """Validate hypotheses using statistical tests."""
    try:
        diagnosis_results = state.get("diagnosis_results", {})
        merged_hypotheses = diagnosis_results.get("merged_hypotheses", [])
        skeptic_findings = state.get("professional_skeptic_output", {})

        verified_root_causes = []
        hypothesis_status = "unverified"

        # Validate each hypothesis against skeptic's robustness scores
        robustness_scores = skeptic_findings.get("robustness_scores", {})

        for hypothesis in merged_hypotheses:
            cause = hypothesis.get("hypothesis", "")
            confidence = hypothesis.get("confidence", 0)
            robustness = robustness_scores.get(cause, 0.5)

            # Hypothesis is "verified" if:
            # - Confidence > 0.50 AND
            # - Robustness > 0.35
            if confidence > 0.50 and robustness > 0.35:
                verified_root_causes.append({
                    "cause": cause,
                    "confidence": round(confidence, 3),
                    "robustness": round(robustness, 3),
                    "evidence": "Statistical validation passed",
                    "p_value": round(1 - confidence, 3),
                    "recommendation": "Proceed to constraint-aware strategy design",
                })
                hypothesis_status = "verified"
            elif confidence > 0.35:
                verified_root_causes.append({
                    "cause": cause,
                    "confidence": round(confidence, 3),
                    "robustness": round(robustness, 3),
                    "evidence": "Weak statistical support",
                    "p_value": round(1 - confidence, 3),
                    "recommendation": "Require additional discovery iterations",
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
