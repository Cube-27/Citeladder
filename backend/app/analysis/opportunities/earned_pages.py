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
    SourcePageEvidence,
)
from app.analysis.opportunities.scoring import (
    page_competitor_presence_factor,
    page_recurrence_factor,
)
from app.core.config.earned_actions import (
    EARNED_PAGE_INCLUDABLE_FORMATS,
    EARNED_PAGE_MIN_RECURRENCE,
    EARNED_PAGE_RESEARCH_MIN_RECURRENCE,
    EARNED_PAGE_TARGET_PREFIX,
    RULE_EARNED_PAGE_ACQUIRE,
    RULE_EARNED_PAGE_CORRECT,
    RULE_EARNED_PAGE_DEFEND,
    RULE_EARNED_PAGE_RESEARCH,
)
from app.core.config.opportunities import OPPORTUNITY_RULES_BY_ID
from app.core.config.source_pages import (
    INSPECTION_INSPECTED,
    PAGE_FORMAT_UNRESOLVED,
)

__all__ = ["detect_earned_page_opportunities", "qualification"]

# A discrepancy a correction task can name and a passage can support. Both
# kinds are checkable from the page itself; neither infers intent from prose.
DISCREPANCY_NOT_LISTED_AS_ENTRY = "not_listed_as_entry"
DISCREPANCY_OWNED_DOMAIN_MISSING = "owned_domain_missing"


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
    headings = " | ".join(page.headings).casefold()
    if not headings or brand_name.casefold() in headings:
        return False
    return any(
        entity.entity_name and entity.entity_name.casefold() in headings
        for entity in page.present_competitors
    )


def _owned_domain_missing(
    page: SourcePageEvidence, owned_domains: tuple[str, ...]
) -> bool:
    """The page links out, and to none of the brand's reviewed domains.

    Guarded on the page having outbound links at all: "we extracted no links"
    is a limitation of the reading, not a fact about the entry.
    """
    owned = {domain.casefold() for domain in owned_domains if domain}
    linked = {domain.casefold() for domain in page.outbound_domains if domain}
    return bool(owned and linked and not (owned & linked))


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
    reasons: list[str] = []
    if not brand.is_present:
        reasons.append("brand_removed")
    elif (
        prior.content_hash
        and page.content_hash
        and prior.content_hash != page.content_hash
        and brand.match_count < prior.brand_match_count
    ):
        # The prose changed AND the brand is mentioned less often than it was.
        # Either alone is noise: a page rewrites without touching our entry,
        # and a match count moves on extraction differences.
        reasons.append("placement_reduced")
    new_competitors = sorted(
        {entity.entity_name for entity in page.present_competitors}
        - set(prior.present_competitors)
    )
    if new_competitors:
        reasons.append("competitor_added")
    return tuple(reasons)


def _hit(
    *,
    rule_id: str,
    page: SourcePageEvidence,
    evidence: EarnedPageEvidence,
    value_factor: float,
    gap_factor: float,
    extra: dict,
) -> DetectorHit | None:
    rule = OPPORTUNITY_RULES_BY_ID[rule_id]
    if not rule.enabled:
        return None
    qualified, missing = qualification(page)
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
        target_key=f"{EARNED_PAGE_TARGET_PREFIX}{page.url_hash}",
        target_prompt_id=None,
        # The canonical page URL, where the domain-keyed rule left null. This
        # is what makes the declaration path reachable, and it is why external
        # implementation targets had to land before this detector was wired in.
        target_url=page.canonical_url,
        target_theme=next(iter(page.themes), None),
        evidence={
            "content_handoff": brief,
            "priority_factors": {
                "page_recurrence_factor": value_factor,
                "page_competitor_presence_factor": gap_factor,
            },
            **extra,
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


def _research_extra(page: SourcePageEvidence, missing: tuple[str, ...]) -> dict | None:
    """Whether an UNQUALIFIED page is worth resolving, and what is unresolved.

    The explicit exception to the qualification gate. Its own bar is relevance
    and recurrence, or an explicit request; it asserts only that the source is
    worth a look. A routine fetch failure is a visible source state and does
    not by itself earn a task.
    """
    if not _relevant(page):
        return None
    if missing == ("not_inspected",) and not page.requested:
        return None
    if not (page.requested or _recurrent(page, EARNED_PAGE_RESEARCH_MIN_RECURRENCE)):
        return None
    return {"unresolved": list(missing), "requested": page.requested}


def _page_hit(
    page: SourcePageEvidence, evidence: EarnedPageEvidence
) -> DetectorHit | None:
    """The one task this page earns, or nothing. One page, one outcome."""
    qualified, missing = qualification(page)
    if qualified:
        selected = _qualified_action(page, evidence.owned_domains)
    else:
        extra = _research_extra(page, missing)
        selected = None if extra is None else (RULE_EARNED_PAGE_RESEARCH, extra)
    if selected is None:
        return None
    rule_id, extra = selected
    return _hit(
        rule_id=rule_id,
        page=page,
        evidence=evidence,
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
    hits = [
        hit
        for page in sorted(evidence.pages, key=lambda row: row.url_hash)
        if (hit := _page_hit(page, evidence)) is not None
    ]
    return hits
