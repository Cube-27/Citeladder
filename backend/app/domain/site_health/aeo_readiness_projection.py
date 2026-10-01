"""Catalog guidance for the Agent's AEO Readiness content hand-off.

The immutable AEO diagnostic itself is frozen into the terminal snapshot by
the TypeScript terminalization owner (``site-health/snapshot-diagnostics.ts``).
"""

from __future__ import annotations

from app.analysis.site_health.rules import rule_for


def rule_guidance(rule_id: str) -> tuple[str, str]:
    rule = rule_for(rule_id)
    return ("", "") if rule is None else (rule.description, rule.remediation)


__all__ = ["rule_guidance"]
