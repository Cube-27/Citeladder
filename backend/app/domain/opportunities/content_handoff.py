"""Typed bounded Content handoff projected by the Opportunity owner."""

from __future__ import annotations

from app.core.config.content import CONTENT_DEFAULT_SKILL, CONTENT_SKILLS
from app.core.config.earned_actions import ACTION_PATH_OWNED
from app.core.config.source_patterns import CONTENT_HANDOFF_TEMPLATE_VERSION
from app.models.opportunity import Opportunity


def persisted_handoff(row: Opportunity) -> dict:
    """The brief a detector froze on this row, or empty when it froze none.

    The shape of ``evidence.content_handoff`` has one owner, here, so a reader
    reaching into the evidence blob by hand cannot drift from it.
    """
    return dict((row.evidence or {}).get("content_handoff") or {})


def project_content_handoff(row: Opportunity) -> dict:
    persisted = persisted_handoff(row)
    snapshot_versions = {
        "detector": row.analyzer_version,
        "rule": row.rule_version,
        "formula": row.formula_version,
        "handoff_template": persisted.get("handoff_template_version")
        or CONTENT_HANDOFF_TEMPLATE_VERSION,
    }
    if persisted:
        skill = str(persisted.get("suggested_skill_id") or CONTENT_DEFAULT_SKILL)
        persisted["suggested_skill_id"] = (
            skill if skill in CONTENT_SKILLS else CONTENT_DEFAULT_SKILL
        )
        persisted["opportunity_id"] = str(row.id)
        persisted["snapshot_versions"] = snapshot_versions
        return persisted
    return {
        "opportunity_id": str(row.id),
        "pathway": ACTION_PATH_OWNED,
        "source_class": None,
        "canonical_domain": None,
        "suggested_role": "Content",
        "suggested_skill_id": CONTENT_DEFAULT_SKILL,
        "target_url": row.target_url,
        "target_theme": row.target_theme,
        "representative_citations": [],
        "affected_prompt_indices": [],
        "affected_themes": [row.target_theme] if row.target_theme else [],
        "observed_competitors": list(
            (row.evidence or {}).get("competitor_names") or []
        ),
        "coverage": {},
        "limitations": [],
        "truncated": False,
        "source_analysis_ids": list(row.source_analysis_ids or []),
        "snapshot_versions": snapshot_versions,
    }
