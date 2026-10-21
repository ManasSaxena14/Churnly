"""
Node 9c: Growth Hacker (Execution Agent)
==========================================
Runs as a standalone LangGraph node for native parallel execution.
"""

from __future__ import annotations

from app.graph.state import RetentionGraphState
from app.graph.agents.execution.growth_hacker import run_growth_hacker


def growth_hacker_node(state: RetentionGraphState) -> dict:
    """Run the Growth Hacker agent."""
    output = run_growth_hacker(state)
    return {
        "growth_hacker_output": output,
        "current_node": "growth_hacker",
    }
