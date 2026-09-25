"""Action grouping, convergence priority and diagnosis-tree decisions."""

from __future__ import annotations

import uuid

from app.analysis.opportunities.actions import ActionMember, group_members
from app.core.config.actions import (
    CONVERGENCE_MULTIPLIER_CAP,
    FAMILY_AI_VISIBILITY,
    FAMILY_LINK_GRAPH,
    FAMILY_SEARCH_CONSOLE,
    FAMILY_SITE_HEALTH,
    FAMILY_SOURCES,
)
from app.core.config.earned_actions import RULE_EARNED_PAGE_ACQUIRE

_ALL_SOURCES = frozenset(
    {FAMILY_AI_VISIBILITY, FAMILY_SEARCH_CONSOLE, FAMILY_SITE_HEALTH, FAMILY_LINK_GRAPH}
)


def _member(
    rule_id: str,
    *,
    target_key: str,
    url: str | None = None,
    prompt_id: uuid.UUID | None = None,
    theme: str | None = None,
    priority: float = 20.0,
) -> ActionMember:
    return ActionMember(
        opportunity_id=uuid.uuid4(),
        rule_id=rule_id,
        target_key=target_key,
        target_url=url,
        target_prompt_id=prompt_id,
        target_theme=theme,
        label_hint=None,
        title=rule_id,
        priority_score=priority,
    )


def test_findings_from_independent_systems_on_one_page_become_one_action() -> None:
    groups = group_members(
        [
            _member(
                "missing_structured_data",
                target_key="url:https://acme.test/baby",
                url="https://acme.test/baby",
                priority=20.0,
            ),
            _member(
                "property_relative_ctr_gap",
                target_key="demand:abc",
                url="https://ACME.test/baby",
                priority=40.0,
            ),
            _member(
                "site_link_weak_authority",
                target_key="url:https://acme.test/baby",
                url="https://acme.test/baby",
                priority=10.0,
            ),
        ],
        available_families=_ALL_SOURCES,
    )

    assert len(groups) == 1
    group = groups[0]
    assert group.target.kind == "page"
    assert group.families == (
        FAMILY_SEARCH_CONSOLE,
        FAMILY_SITE_HEALTH,
        FAMILY_LINK_GRAPH,
    )
    # Strongest member (40.0) raised by two converging families (+15% each).
    assert group.priority_score == 52.0
    # A structured-data defect outranks the demand work on the same page.
    assert group.approach == "fix_technical"
    assert group.skill_id == "technical_health"
    assert [item["rule_id"] for item in group.diagnosis["what_happened"]] == [
        "property_relative_ctr_gap",
        "missing_structured_data",
        "site_link_weak_authority",
    ]


def test_convergence_multiplier_is_capped() -> None:
    families = (
        ("brand_absent_high_value_prompt", "prompt:x"),
        ("search_demand_content_gap", "demand:x"),
        ("thin_content", "url:x"),
        ("site_link_near_orphan", "url:x"),
        ("site_change_cosmetic_refresh", "site-change:x"),
        ("catalog_fields_missing", "catalog:x"),
    )
    groups = group_members(
        [
            _member(rule, target_key=key, url="https://acme.test/x", priority=10.0)
            for rule, key in families
        ],
        available_families=_ALL_SOURCES,
    )

    assert len(groups) == 1
    assert groups[0].priority_score == 10.0 * CONVERGENCE_MULTIPLIER_CAP


def test_earned_page_work_never_merges_with_an_owned_page() -> None:
    groups = group_members(
        [
            _member(
                RULE_EARNED_PAGE_ACQUIRE,
                target_key="earned-page:hash",
                url="https://acme.test/baby",
            ),
            _member(
                "thin_content",
                target_key="url:https://acme.test/baby",
                url="https://acme.test/baby",
            ),
        ],
        available_families=_ALL_SOURCES,
    )

    kinds = {group.target.kind: group for group in groups}
    assert set(kinds) == {"earned_page", "page"}
    assert kinds["earned_page"].approach == "earned_placement"
    assert kinds["earned_page"].families == (FAMILY_SOURCES,)


def test_new_content_is_proposed_only_for_a_prompt_without_a_page() -> None:
    prompt_id = uuid.uuid4()
    (prompt_group,) = group_members(
        [
            _member(
                "brand_absent_high_value_prompt",
                target_key=f"prompt:{prompt_id}",
                prompt_id=prompt_id,
            )
        ],
        available_families=_ALL_SOURCES,
    )
    assert (prompt_group.target.kind, prompt_group.approach) == ("prompt", "create_new")

    (page_group,) = group_members(
        [
            _member(
                "brand_absent_high_value_prompt",
                target_key=f"prompt:{prompt_id}",
                url="https://acme.test/crm",
            )
        ],
        available_families=_ALL_SOURCES,
    )
    assert (page_group.target.kind, page_group.approach) == ("page", "improve_existing")


def test_query_only_demand_signals_for_one_query_share_an_action() -> None:
    groups = group_members(
        [
            _member(
                "striking_distance_query", target_key="demand:1", theme="Baby Clothes"
            ),
            _member("emerging_query", target_key="demand:2", theme="baby clothes "),
        ],
        available_families=_ALL_SOURCES,
    )

    assert len(groups) == 1
    assert groups[0].target.kind == "query"


def test_family_states_keep_unavailable_distinct_from_no_finding() -> None:
    (group,) = group_members(
        [
            _member(
                "thin_content",
                target_key="url:https://acme.test/a",
                url="https://acme.test/a",
            )
        ],
        available_families=frozenset({FAMILY_SITE_HEALTH, FAMILY_AI_VISIBILITY}),
    )

    families = group.diagnosis["families"]
    assert families[FAMILY_SITE_HEALTH] == "observed"
    assert families[FAMILY_AI_VISIBILITY] == "no_finding"
    assert families[FAMILY_SEARCH_CONSOLE] == "unavailable"
    assert group.diagnosis["measure_with"] == ["next_crawl"]
