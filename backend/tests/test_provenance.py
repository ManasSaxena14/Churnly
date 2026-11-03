"""Root-cause citations survive validation, and only real knowledge-base
documents count as citations (LLMs sometimes cite made-up labels)."""

from app.graph.nodes.hypothesis_validation import hypothesis_validation_node
from app.quality.groundedness import groundedness_report
from app.rag.store import known_source_ids, valid_citations


def test_valid_citations_keeps_only_real_documents():
    real = sorted(known_source_ids())[:2]
    assert valid_citations(real + ["CoxPH Driver Features", "commitment_gap"]) == real
    assert valid_citations(None) == []


def test_verified_causes_keep_real_citations():
    real = sorted(known_source_ids())[0]
    state = {
        "diagnosis_results": {"merged_hypotheses": [
            {"hypothesis": "Monthly contracts churn", "confidence": 0.9,
             "citations": [real, "made_up_label"], "supported_by": ["forensic_detective"]},
            {"hypothesis": "Support friction", "confidence": 0.4, "citations": ["made_up_label"]},
        ]},
        "professional_skeptic_output": {"robustness_scores": {}},
    }
    causes = hypothesis_validation_node(state)["verified_root_causes"]
    assert causes[0]["citations"] == [real]
    assert causes[0]["supported_by"] == ["forensic_detective"]
    assert causes[1]["citations"] == []


def _problem(citations):
    return {"rationale_chain": {
        "stat": {"stat_id": "contract::Monthly", "significant": True},
        "cause": {"citations": citations},
        "simulated_outcome": {"mean_lift": 0.1},
    }}


def test_groundedness_ignores_made_up_citations():
    real = sorted(known_source_ids())[0]
    report = groundedness_report({"problems_and_solutions": [_problem([real]), _problem(["CoxPH Driver Features"])]})
    assert report["citation_rate"] == 0.5 and report["grounded_rate"] == 0.5
