"""Page-keyed earned-source detector (pure — no DB, no I/O, invariants 7+9).

One inspected page, one intended outcome, one task. The target is
``earned-page:{url_hash}``; source class and page format are evidence fields
and never key fields, which is what permanently retires the lost-status defect
in the domain-keyed detector it replaces.

Three things here are load-bearing.

Qualification precedes ranking, and it is hard.
    No ACTION rule fires without sufficient extraction coverage, a relevant
    market and topic, correct entity matching and a feasible action. An
    unqualified candidate stays a source state or a research candidate; it
    never becomes a fabricated action. ``earned_page_research_source`` is the
    deliberate exception, because it exists precisely for what this gate
    rejects -- applying the gate to it would put every unresolved source back
    in the silent-drop path this detector was written to close.

Defence needs a BEFORE.
    A placement cannot deteriorate without a prior snapshot to deteriorate
    from. Brand and competitors both being present is a healthy watch state
    and produces nothing. Where the evidence would satisfy both defence and
    acquisition -- a brand that was there and is now gone -- defence wins,
    because it carries the snapshot that explains what changed.

Only on-page presence scores.
    ``page_competitor_presence_factor`` reads verified verdicts about this
    page. Answer-level co-occurrence travels as descriptive evidence and is
    labelled as such.
"""

from __future__ import annotations

from app.analysis.opportunities.detectors import DetectorHit
from app.analysis.opportunities.earned_page_brief import earned_page_brief
from app.analysis.opportunities.earned_page_evidence import (
    EarnedPageEvidence,
    PriorPageEvidence,
    SourcePageEvidence,
)
from app.analysis.opportunities.page_predicates import (
    links_to_owned,
    listed_in_headings,
)
from app.analysis.opportunities.scoring import (
    page_competitor_presence_factor,
    page_recurrence_factor,
)
from app.core.config.earned_actions import (
    DISCREPANCY_NOT_LISTED_AS_ENTRY,
    DISCREPANCY_OWNED_DOMAIN_MISSING,
    EARNED_PAGE_INCLUDABLE_FORMATS,
    EARNED_PAGE_MIN_RECURRENCE,
    EARNED_PAGE_RESEARCH_MIN_RECURRENCE,
    RULE_EARNED_PAGE_ACQUIRE,
    RULE_EARNED_PAGE_CORRECT,
    RULE_EARNED_PAGE_DEFEND,
    RULE_EARNED_PAGE_RESEARCH,
    earned_page_target_key,
)
from app.core.config.opportunities import OPPORTUNITY_RULES_BY_ID
from app.core.config.source_pages import (
    INSPECTION_FAILED,
    INSPECTION_INSPECTED,
    INSPECTION_NOT_INSPECTED,
    INSPECTION_QUEUED,
    PAGE_FORMAT_UNRESOLVED,
)

__all__ = ["detect_earned_page_opportunities", "qualification"]

# Page states that the next inspection run resolves by itself. A page in one
# of them is inventory, visible in Sources, and not somebody's task. Notably
# absent: ``blocked``. A publisher that refuses automated access will refuse
# it again forever, so that one needs a person.
_SELF_RESOLVING_STATES = frozenset(
    {INSPECTION_NOT_INSPECTED, INSPECTION_QUEUED, INSPECTION_FAILED}
)


def _relevant(page: SourcePageEvidence) -> bool:
    """Cited by this audit's answers, on a prompt we are tracking."""
    return page.answer_count >= 1 and bool(page.prompt_indices)


def _recurrent(page: SourcePageEvidence, minimum: int) -> bool:
    """Seen often enough to be worth a person's time.

    Either measure counts: recurrence across audits is the scheduling signal,
    and answers within this audit is the in-run one. A page cited by four
    answers today is recurrent even on its first appearance.
    """
    return max(page.recurrence_count, page.answer_count) >= minimum


def qualification(page: SourcePageEvidence) -> tuple[bool, tuple[str, ...]]:
    """Whether an ACTION may be proposed for this page, and what is missing.

    The reasons are returned rather than swallowed because they are what the
    research rule and the Sources surface report instead of an action.
    """
    missing: list[str] = []
    if page.inspection_state != INSPECTION_INSPECTED or page.snapshot_id is None:
        missing.append("not_inspected")
    if not page.sufficient_coverage:
        missing.append("insufficient_coverage")
    if not _relevant(page):
        missing.append("no_tracked_prompt")
    if not _recurrent(page, EARNED_PAGE_MIN_RECURRENCE):
        missing.append("not_recurrent")
    if page.brand is None or not page.roster_current:
        missing.append("entity_matching_unresolved")
    if page.page_format == PAGE_FORMAT_UNRESOLVED:
        missing.append("page_format_unresolved")
    return not missing, tuple(missing)


def _not_listed_as_entry(page: SourcePageEvidence, brand_name: str) -> bool:
    """Named in prose while every rival has its own entry.

    On a page whose shape is a list of entries, a brand described in the body
    but absent from the headings is not included -- it is mentioned. That is a
    different fix from inclusion and a different done-state.
    """
    if page.page_format not in EARNED_PAGE_INCLUDABLE_FORMATS:
        return False
    if not page.headings or listed_in_headings(brand_name, page.headings):
        return False
    return any(
        listed_in_headings(entity.entity_name, page.headings)
        for entity in page.present_competitors
    )


def _owned_domain_missing(
    page: SourcePageEvidence, owned_domains: tuple[str, ...]
) -> bool:
    """The page links out, and to none of the brand's reviewed domains.

    Guarded on the page having outbound links at all: "we extracted no links"
    is a limitation of the reading, not a fact about the entry, so it asserts
    nothing rather than asserting an omission.
    """
    if not owned_domains or not page.outbound_domains:
        return False
    return not links_to_owned(page.outbound_domains, owned_domains)


def _discrepancies(
    page: SourcePageEvidence, owned_domains: tuple[str, ...]
) -> tuple[str, ...]:
    """Specific, checkable disagreements between the page and reviewed facts.

    Brand presence alone is never one of these. Both kinds are decided from
    the page's own extracted facts against reviewed owned domains, so a
    correction always names something a person can verify by opening the page.
    """
    brand = page.brand
    if brand is None or not brand.is_present:
        return ()
    checks = (
        (
            DISCREPANCY_NOT_LISTED_AS_ENTRY,
            _not_listed_as_entry(page, brand.entity_name),
        ),
        (
            DISCREPANCY_OWNED_DOMAIN_MISSING,
            _owned_domain_missing(page, owned_domains),
        ),
    )
    return tuple(kind for kind, failed in checks if failed)


def _placement_reduced(page: SourcePageEvidence, prior: PriorPageEvidence) -> bool:
    """The prose changed AND the brand is mentioned less than it was.

    Either signal alone is noise: a publisher rewrites a page without
    touching our entry, and a match count moves on extraction differences.
    """
    brand = page.brand
    return bool(
        brand
        and prior.content_hash
        and page.content_hash
        and prior.content_hash != page.content_hash
        and brand.match_count < prior.brand_match_count
    )


def _deterioration(page: SourcePageEvidence) -> tuple[str, ...]:
    """How this placement got worse since the last usable snapshot.

    Both brands present is a HEALTHY watch state and returns nothing. So does
    a first inspection: with no prior snapshot there is no before to compare a
    placement against, and an absence found once is an absence, not a loss.
    """
    prior = page.prior
    brand = page.brand
    if prior is None or brand is None or not prior.brand_present:
        return ()
    if not (brand.is_present or brand.is_absent):
        # Ambiguous or partial: this reading could not settle where the brand
        # stands, so there is nothing to compare the prior one against.
        # Reporting an unsettled verdict as a lost placement is the same
        # mistake as reporting an unread page as an absence.
        return ()
    reasons: list[str] = []
    if brand.is_absent:
        reasons.append("brand_removed")
    elif _placement_reduced(page, prior):
        reasons.append("placement_reduced")
    # A rival arriving beside a placement we still hold is not deterioration
    # -- both present is the healthy watch state, and firing on it would put
    # a task on every page a competitor ever joins. It qualifies what
    # DISPLACED us only once something else shows we lost ground.
    if reasons and set(page.present_competitors_named) - set(prior.present_competitors):
        reasons.append("competitor_added")
    return tuple(reasons)


def _hit(
    *,
    rule_id: str,
    page: SourcePageEvidence,
    evidence: EarnedPageEvidence,
    qualified: bool,
    missing: tuple[str, ...],
    value_factor: float,
    gap_factor: float,
    extra: dict,
) -> DetectorHit | None:
    rule = OPPORTUNITY_RULES_BY_ID[rule_id]
    if not rule.enabled:
        return None
    brief = earned_page_brief(
        rule_id=rule_id,
        page=page,
        evidence=evidence,
        qualified=qualified,
        unmet=missing,
        extra=extra,
    )
    return DetectorHit(
        rule_id=rule_id,
        target_key=earned_page_target_key(page.url_hash),
        target_prompt_id=None,
        # The canonical page URL, where the domain-keyed rule left null. This
        # is what makes the declaration path reachable, and it is why external
        # implementation targets had to land before this detector was wired in.
        target_url=page.canonical_url,
        target_theme=next(iter(page.themes), None),
        # The brief is where the page evidence lives, ``extra`` included.
        # Spreading it at this level too would persist two copies of one
        # payload and give a reader two places to look for the same fact.
        evidence={
            "content_handoff": brief,
            "priority_factors": {
                "page_recurrence_factor": value_factor,
                "page_competitor_presence_factor": gap_factor,
            },
        },
        source_analysis_ids=tuple(page.analysis_ids),
        source_issue_ids=(),
        source_metric_ids=(),
        value_factor=value_factor,
        gap_factor=gap_factor,
    )


def _qualified_action(
    page: SourcePageEvidence, owned_domains: tuple[str, ...]
) -> tuple[str, dict] | None:
    """Which action a QUALIFIED page earns, with the evidence that decided it.

    The order is the resolution rule, not a preference. Defence outranks
    acquisition because a brand that was present and is now gone is one story
    with a before, and the snapshot that explains it belongs on the task.
    """
    deterioration = _deterioration(page)
    if deterioration:
        return RULE_EARNED_PAGE_DEFEND, {
            "deterioration": list(deterioration),
            "prior_snapshot_id": page.prior.snapshot_id if page.prior else None,
        }
    brand = page.brand
    if (
        page.page_format in EARNED_PAGE_INCLUDABLE_FORMATS
        and page.present_competitors
        and brand is not None
        and brand.is_absent
    ):
        return RULE_EARNED_PAGE_ACQUIRE, {}
    discrepancies = _discrepancies(page, owned_domains)
    if discrepancies:
        return RULE_EARNED_PAGE_CORRECT, {"discrepancies": list(discrepancies)}
    # Everything present and nothing wrong: a healthy placement to watch.
    return None


def _research_extra(page: SourcePageEvidence) -> dict | None:
    """Whether an UNQUALIFIED page is worth resolving, and what is unresolved.

    The explicit exception to the qualification gate. Its own bar is relevance
    and recurrence, or an explicit request; it asserts only that the source is
    worth a look.

    Read from the page STATE rather than from the set of unmet reasons, which
    reads the same for two different situations. A page still waiting in the
    queue, and a page whose fetch failed and will be retried, are visible
    source states that resolve themselves. A page a publisher refuses is not:
    it will never resolve on its own, and deciding what to do about it is
    exactly the human judgement this rule exists to ask for.
    """
    if not _relevant(page):
        return None
    if page.inspection_state in _SELF_RESOLVING_STATES and not page.requested:
        return None
    if not (page.requested or _recurrent(page, EARNED_PAGE_RESEARCH_MIN_RECURRENCE)):
        return None
    # What is unresolved is already on the brief as ``unmet_qualification``;
    # repeating it under a second name would be one fact with two owners.
    return {"requested": page.requested}


def _page_hit(
    page: SourcePageEvidence, evidence: EarnedPageEvidence
) -> DetectorHit | None:
    """The one task this page earns, or nothing. One page, one outcome."""
    qualified, missing = qualification(page)
    if qualified:
        selected = _qualified_action(page, evidence.owned_domains)
    else:
        extra = _research_extra(page)
        selected = None if extra is None else (RULE_EARNED_PAGE_RESEARCH, extra)
    if selected is None:
        return None
    rule_id, extra = selected
    return _hit(
        rule_id=rule_id,
        page=page,
        evidence=evidence,
        qualified=qualified,
        missing=missing,
        value_factor=page_recurrence_factor(
            answer_count=page.answer_count,
            eligible_answers=evidence.eligible_answers,
        ),
        gap_factor=page_competitor_presence_factor(len(page.present_competitors)),
        extra=extra,
    )


def detect_earned_page_opportunities(
    evidence: EarnedPageEvidence,
) -> list[DetectorHit]:
    """One hit per page that earns one. Deterministic in ``url_hash`` order."""
    return [
        hit
        for page in sorted(evidence.pages, key=lambda row: row.url_hash)
        if (hit := _page_hit(page, evidence)) is not None
    ]
