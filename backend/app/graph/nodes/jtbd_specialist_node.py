"""
Node 9b: JTBD Specialist (Execution Agent)
============================================
Runs as a standalone LangGraph node for native parallel execution.
"""

from __future__ import annotations

from app.graph.state import RetentionGraphState
from app.graph.agents.execution.jtbd_specialist import run_jtbd_specialist


def jtbd_specialist_node(state: RetentionGraphState) -> dict:
    """Run the JTBD Specialist agent."""
    output = run_jtbd_specialist(state)
    return {
        "jtbd_specialist_output": output,
        "current_node": "jtbd_specialist",
    }
