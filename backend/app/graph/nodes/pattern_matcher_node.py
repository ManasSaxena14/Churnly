"""
Node 5b: Pattern Matcher (Discovery Agent)
============================================
Runs as a standalone LangGraph node for native parallel execution.
"""

from __future__ import annotations

from app.graph.state import RetentionGraphState
from app.graph.agents.discovery.pattern_matcher import run_pattern_matcher


def pattern_matcher_node(state: RetentionGraphState) -> dict:
    """Run the Pattern Matcher agent."""
    output = run_pattern_matcher(state)
    return {
        "pattern_matcher_output": output,
        "current_node": "pattern_matcher",
    }
