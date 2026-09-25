# Action grouping, convergence, priority and diagnosis (pure, invariant 9).
#
# An Action is the unit of work over the live Opportunity set: every member
# that shares one target. Grouping, priority and the approach tree are pure
# functions of the member rows and the source availability of one recompute;
# every table comes from ``core/config/actions.py``. Nothing here touches the
# database, the network or a model.
from __future__ import annotations

import uuid
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any

from app.analysis.site_health.indexing import normalized_url_for_compare
from app.core.config.actions import (
    ACTION_DIAGNOSIS_VERSION,
    ACTION_GROUPING_VERSION,
    ACTION_LABEL_MAX_CHARS,
    ACTION_PRIORITY_ROUNDING_DECIMALS,
    ACTION_PRIORITY_VERSION,
    APPROACH_TREE,
    CONVERGENCE_BONUS_PER_FAMILY,
    CONVERGENCE_MULTIPLIER_CAP,
    DEFAULT_APPROACH,
    EVIDENCE_FAMILIES,
    FAMILY_MEASUREMENT_LEG,
    FAMILY_STATE_NO_FINDING,
    FAMILY_STATE_OBSERVED,
    FAMILY_STATE_UNAVAILABLE,
    RULE_EVIDENCE_FAMILY,
    TARGET_CATEGORY,
    TARGET_EARNED_PAGE,
    TARGET_PAGE,
    TARGET_PRODUCT,
    TARGET_PROMPT,
    TARGET_QUERY,
    ApproachRule,
)
from app.core.config.earned_actions import ACTION_PATH_EARNED
from app.core.config.opportunities import OPPORTUNITY_RULES_BY_ID


@dataclass(frozen=True)
class ActionMember:
    """The Opportunity fields grouping and diagnosis read (one live row)."""

    opportunity_id: uuid.UUID
    rule_id: str
    target_key: str
    target_url: str | None
    target_prompt_id: uuid.UUID | None
    target_theme: str | None
    label_hint: str | None
    title: str
    priority_score: float
    source_analysis_ids: tuple[str, ...] = ()
    source_issue_ids: tuple[str, ...] = ()
    source_metric_ids: tuple[str, ...] = ()


@dataclass(frozen=True)
class ActionTarget:
    group_key: str
    kind: str
    label: str
    url: str | None
    prompt_id: uuid.UUID | None


@dataclass(frozen=True)
class ActionGroup:
    target: ActionTarget
    members: tuple[ActionMember, ...]
    families: tuple[str, ...]
    priority_score: float
    approach: str
    skill_id: str
    diagnosis: dict[str, Any] = field(default_factory=dict)


def page_group_key(url: str) -> str:
    """The grouping key for an owned page, shared with agent-created Actions."""
    return f"page:{normalized_url_for_compare(url)}"


def target_for(member: ActionMember) -> ActionTarget:
    """Which one target this member's work happens on."""
    rule = OPPORTUNITY_RULES_BY_ID[member.rule_id]
    key = member.target_key
    if rule.action_path == ACTION_PATH_EARNED:
        return _target(
            f"earned:{key}", TARGET_EARNED_PAGE, member, url=member.target_url
        )
    if key.startswith("product:"):
        return _target(key, TARGET_PRODUCT, member)
    if key.startswith("category:"):
        return _target(key, TARGET_CATEGORY, member)
    if member.target_url:
        return _target(
            page_group_key(member.target_url),
            TARGET_PAGE,
            member,
            url=member.target_url,
        )
    if member.target_prompt_id is not None:
        return _target(
            f"prompt:{member.target_prompt_id}",
            TARGET_PROMPT,
            member,
            prompt_id=member.target_prompt_id,
        )
    if key.startswith("prompt"):
        return _target(key, TARGET_PROMPT, member)
    if key.startswith("demand:") and member.target_theme:
        # A query-only demand signal. Several signal types about one query
        # describe one piece of work, so they share the normalized query key.
        return _target(
            f"query:{member.target_theme.casefold().strip()}", TARGET_QUERY, member
        )
    return _target(key, TARGET_QUERY, member)


def _target(
    group_key: str,
    kind: str,
    member: ActionMember,
    *,
    url: str | None = None,
    prompt_id: uuid.UUID | None = None,
) -> ActionTarget:
    label = url or member.label_hint or member.target_theme or member.title
    return ActionTarget(
        group_key=group_key,
        kind=kind,
        label=label[:ACTION_LABEL_MAX_CHARS],
        url=url,
        prompt_id=prompt_id,
    )


def group_members(
    members: Iterable[ActionMember], *, available_families: frozenset[str]
) -> list[ActionGroup]:
    """Group live members by target and derive each group's projection.

    Groups come back in descending priority, then group key, so the order is
    deterministic for equal scores.
    """
    by_key: dict[str, tuple[ActionTarget, list[ActionMember]]] = {}
    for member in members:
        target = target_for(member)
        entry = by_key.setdefault(target.group_key, (target, []))
        entry[1].append(member)
    groups = [
        _group(target, members, available_families=available_families)
        for target, members in by_key.values()
    ]
    return sorted(
        groups, key=lambda group: (-group.priority_score, group.target.group_key)
    )


def _group(
    target: ActionTarget,
    members: list[ActionMember],
    *,
    available_families: frozenset[str],
) -> ActionGroup:
    ordered = tuple(
        sorted(
            members,
            key=lambda item: (
                -item.priority_score,
                item.rule_id,
                str(item.opportunity_id),
            ),
        )
    )
    families = tuple(
        family
        for family in EVIDENCE_FAMILIES
        if any(RULE_EVIDENCE_FAMILY[member.rule_id] == family for member in ordered)
    )
    branch = select_approach(
        rule_ids={member.rule_id for member in ordered}, target_kind=target.kind
    )
    priority = action_priority(
        strongest=ordered[0].priority_score, observed_families=len(families)
    )
    return ActionGroup(
        target=target,
        members=ordered,
        families=families,
        priority_score=priority,
        approach=branch.approach,
        skill_id=branch.skill_id,
        diagnosis=_diagnosis(
            ordered,
            families=families,
            branch=branch,
            available_families=available_families,
        ),
    )


def action_priority(*, strongest: float, observed_families: int) -> float:
    """Strongest member priority, raised by independent converging families."""
    multiplier = min(
        CONVERGENCE_MULTIPLIER_CAP,
        1.0 + CONVERGENCE_BONUS_PER_FAMILY * max(observed_families - 1, 0),
    )
    return round(strongest * multiplier, ACTION_PRIORITY_ROUNDING_DECIMALS)


def select_approach(*, rule_ids: set[str], target_kind: str) -> ApproachRule:
    """The first approach-tree branch that matches the member rule set."""
    for branch in APPROACH_TREE:
        if branch.target_kinds and target_kind not in branch.target_kinds:
            continue
        if branch.rule_ids & rule_ids:
            return branch
    return DEFAULT_APPROACH


def _diagnosis(
    members: tuple[ActionMember, ...],
    *,
    families: tuple[str, ...],
    branch: ApproachRule,
    available_families: frozenset[str],
) -> dict[str, Any]:
    family_states = {
        family: (
            FAMILY_STATE_OBSERVED
            if family in families
            else FAMILY_STATE_NO_FINDING
            if family in available_families
            else FAMILY_STATE_UNAVAILABLE
        )
        for family in EVIDENCE_FAMILIES
    }
    return {
        "what_happened": [
            {
                "opportunity_id": str(member.opportunity_id),
                "rule_id": member.rule_id,
                "title": member.title,
                "family": RULE_EVIDENCE_FAMILY[member.rule_id],
                "priority_score": member.priority_score,
                "source_analysis_ids": list(member.source_analysis_ids),
                "source_issue_ids": list(member.source_issue_ids),
                "source_metric_ids": list(member.source_metric_ids),
            }
            for member in members
        ],
        "families": family_states,
        "approach": branch.approach,
        "skill_id": branch.skill_id,
        "donts": list(branch.donts),
        "measure_with": list(
            dict.fromkeys(FAMILY_MEASUREMENT_LEG[family] for family in families)
        ),
        "versions": {
            "grouping": ACTION_GROUPING_VERSION,
            "diagnosis": ACTION_DIAGNOSIS_VERSION,
            "priority": ACTION_PRIORITY_VERSION,
        },
    }
