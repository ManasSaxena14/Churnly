"""
Node 9: Strategy Pod
=====================
Action:  Parallel synthesis via Execution Agents
Tools:   JTBD, Unit Economics, Growth Frameworks
Spawns:  Unit Economist, JTBD Specialist, Growth Hacker
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from app.graph.state import RetentionGraphState
from app.graph.agents.execution.unit_economist import run_unit_economist
from app.graph.agents.execution.jtbd_specialist import run_jtbd_specialist
from app.graph.agents.execution.growth_hacker import run_growth_hacker


def strategy_pod_node(state: RetentionGraphState) -> dict:
    """Run three Execution Agents in parallel and merge strategies."""
    try:
        # Run Execution Agents in parallel
        with ThreadPoolExecutor(max_workers=3) as executor:
            economist_future = executor.submit(run_unit_economist, state)
            jtbd_future = executor.submit(run_jtbd_specialist, state)
            growth_future = executor.submit(run_growth_hacker, state)

            economist_output = economist_future.result()
            jtbd_output = jtbd_future.result()
            growth_output = growth_future.result()

        # Merge results into unified strategy_outputs
        merged_strategies = merge_strategy_outputs(economist_output, jtbd_output, growth_output)

        strategy_outputs = {
            "unit_economics_strategy": economist_output,
            "jtbd_strategy": jtbd_output,
            "growth_strategy": growth_output,
            "merged_strategies": merged_strategies,
            "strategy_summary": {
                "total_recommendations": len(merged_strategies),
                "frameworks_applied": ["Unit Economics", "Jobs-to-be-Done", "Growth Hacking"],
                "consensus_recommendation": merged_strategies[0] if merged_strategies else {},
            },
        }

        # Increment iteration counter
        iteration_count = state.get("iteration_count", 0) + 1

        return {
            "unit_economist_output": economist_output,
            "jtbd_specialist_output": jtbd_output,
            "growth_hacker_output": growth_output,
            "strategy_outputs": strategy_outputs,
            "iteration_count": iteration_count,
            "current_node": "strategy_pod",
        }

    except Exception as e:
        return {
            "unit_economist_output": {},
            "jtbd_specialist_output": {},
            "growth_hacker_output": {},
            "strategy_outputs": {
                "merged_strategies": [],
                "strategy_summary": {"total_recommendations": 0},
            },
            "iteration_count": state.get("iteration_count", 0) + 1,
            "errors": [*state.get("errors", []), f"Strategy pod error: {str(e)}"],
            "current_node": "strategy_pod",
        }


def merge_strategy_outputs(economist: dict, jtbd: dict, growth: dict) -> list[dict]:
    """Merge outputs from three agents into ranked recommendations."""
    merged = []

    # Extract top intervention from each agent
    economist_top = economist.get("top_roi_intervention", {})
    jtbd_interventions = jtbd.get("proposed_interventions", [])
    growth_tactics = growth.get("proposed_tactics", [])

    # Create merged recommendation #1 (Economics-driven)
    if economist_top:
        merged.append({
            "rank": 1,
            "recommendation": economist_top.get("intervention", ""),
            "framework": "Unit Economics",
            "expected_roi": economist_top.get("expected_roi", 0),
            "confidence": 0.68,
            "rationale": "Highest ROI and payback speed",
        })

    # Create merged recommendation #2 (User-centric, JTBD)
    if jtbd_interventions:
        merged.append({
            "rank": 2,
            "recommendation": jtbd_interventions[0].get("intervention", ""),
            "framework": "Jobs-to-be-Done",
            "expected_impact": "Improved job satisfaction",
            "confidence": 0.65,
            "rationale": "Addresses core user motivations",
        })

    # Create merged recommendation #3 (Growth-focused)
    if growth_tactics:
        merged.append({
            "rank": 3,
            "recommendation": growth_tactics[0].get("name", ""),
            "framework": "Growth Hacking",
            "expected_lift": growth_tactics[0].get("expected_lift", 0),
            "confidence": 0.70,
            "rationale": "Fast implementation, measurable impact",
        })

    return merged
