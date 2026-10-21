"""
Node 9a: Unit Economist (Execution Agent)
==========================================
Runs as a standalone LangGraph node for native parallel execution.
"""

from __future__ import annotations

from app.graph.state import RetentionGraphState
from app.graph.agents.execution.unit_economist import run_unit_economist


def unit_economist_node(state: RetentionGraphState) -> dict:
    """Run the Unit Economist agent."""
    output = run_unit_economist(state)
    return {
        "unit_economist_output": output,
        "current_node": "unit_economist",
    }
