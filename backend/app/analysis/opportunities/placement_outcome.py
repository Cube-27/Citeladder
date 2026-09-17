"""Did the declared change actually appear on the publisher's page? (pure)

No database, no I/O. One frozen baseline reading, one later reading, and the
SPECIFIC change the declaration was about.

Three things here are the point.

The comparison is against what was NAMED, not against "is the brand there".
    A correction that said "this page links every rival and none of our
    domains" is verified by the page now linking one of ours. A brand that
    happens to appear somewhere in the prose does not satisfy it, and treating
    it as though it did is how a fix nobody made gets reported as verified.

A reading judged against a different roster is not comparable.
    Presence verdicts mean what the names they searched for mean. Adding a
    competitor or an alias changes what an earlier reading would have
    concluded, so a roster change makes the check unavailable rather than
    silently comparing two different questions. This is the same rule
    ``earned_page_hits._prior`` applies to deterioration.

``unavailable`` never decays into ``unmet``.
    A page we could not read tells us nothing about whether the placement went
    live. Reporting "we could not look" as "it did not happen" is the same
    error as reporting an unread page as an absence.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.analysis.opportunities.page_predicates import (
    links_to_owned,
    listed_in_headings,
)
from app.core.config.earned_actions import (
    DISCREPANCY_NOT_LISTED_AS_ENTRY,
    DISCREPANCY_OWNED_DOMAIN_MISSING,
)
from app.core.config.placement import (
    PLACEMENT_CHANGE_BRAND_LISTED,
    PLACEMENT_CHANGE_DISCREPANCY_RESOLVED,
    PLACEMENT_CHANGE_PLACEMENT_RESTORED,
    PLACEMENT_CHANGE_SOURCE_RESOLVED,
    PLACEMENT_REASON_COVERAGE,
    PLACEMENT_REASON_NO_BASELINE,
    PLACEMENT_REASON_NO_VERDICT,
    PLACEMENT_REASON_ROSTER_CHANGED,
    PLACEMENT_REASON_UNKNOWN_CHANGE,
    PLACEMENT_STATE_SATISFIED,
    PLACEMENT_STATE_UNAVAILABLE,
    PLACEMENT_STATE_UNMET,
)
from app.core.config.source_pages import SOURCE_PAGE_MIN_COVERAGE_CHARS

__all__ = ["PlacementReading", "PlacementVerdict", "evaluate_placement"]


@dataclass(frozen=True, slots=True)
class PlacementReading:
    """One reading of the page, reduced to what a placement check compares."""

    snapshot_id: str
    roster_version: str
    extracted_chars: int
    # ``None`` when the reading produced no verdict for the brand at all --
    # distinct from a verdict of "not detected", which is a finding.
    brand_presence: str | None
    brand_present: bool
    brand_match_count: int
    outbound_domains: tuple[str, ...] = ()
    headings: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class PlacementExpectation:
    """What this declaration said would change, frozen when it was made."""

    expected_change: str
    brand_name: str = ""
    owned_domains: tuple[str, ...] = ()
    discrepancies: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class PlacementVerdict:
    state: str
    reason: str | None = None


def _unavailable(reason: str) -> PlacementVerdict:
    return PlacementVerdict(state=PLACEMENT_STATE_UNAVAILABLE, reason=reason)


def _settled(satisfied: bool) -> PlacementVerdict:
    return PlacementVerdict(
        state=PLACEMENT_STATE_SATISFIED if satisfied else PLACEMENT_STATE_UNMET
    )


def _comparable(
    baseline: PlacementReading, observation: PlacementReading
) -> PlacementVerdict | None:
    """Whether these two readings can be compared at all."""
    if baseline.roster_version != observation.roster_version:
        return _unavailable(PLACEMENT_REASON_ROSTER_CHANGED)
    if observation.extracted_chars < SOURCE_PAGE_MIN_COVERAGE_CHARS:
        return _unavailable(PLACEMENT_REASON_COVERAGE)
    if observation.brand_presence is None:
        return _unavailable(PLACEMENT_REASON_NO_VERDICT)
    return None


def _entry_added(
    expectation: PlacementExpectation, obs: PlacementReading
) -> bool | None:
    """The brand now has an entry heading of its own. ``None``: unreadable.

    A reading that produced no headings cannot show an entry either way, so it
    is unverifiable rather than a correction nobody made.
    """
    if not obs.headings:
        return None
    return listed_in_headings(expectation.brand_name, obs.headings)


def _link_added(
    expectation: PlacementExpectation, obs: PlacementReading
) -> bool | None:
    """The page now links to one of the brand's domains. ``None``: unreadable.

    Guarded on the page having extracted links at all, the same way the
    detector guards before asserting the omission. Without that, a reading
    that extracted no links reports a link somebody added as still missing.
    """
    if not obs.outbound_domains or not expectation.owned_domains:
        return None
    return links_to_owned(obs.outbound_domains, expectation.owned_domains)


def _discrepancy_resolved(
    code: str, expectation: PlacementExpectation, obs: PlacementReading
) -> bool | None:
    """Whether one named discrepancy is fixed. ``None`` means unverifiable.

    The codes come from the config the detector raises them with, and the
    matching goes through the predicates the detector used, so a rename or a
    normalisation change cannot leave the two asking different questions about
    the same page.
    """
    if code == DISCREPANCY_NOT_LISTED_AS_ENTRY:
        return _entry_added(expectation, obs)
    if code == DISCREPANCY_OWNED_DOMAIN_MISSING:
        return _link_added(expectation, obs)
    return None


def _corrections(
    expectation: PlacementExpectation, obs: PlacementReading
) -> PlacementVerdict:
    """Every named discrepancy must be gone. One unverifiable code stops all.

    A correction declaration is about the specific thing that was wrong. If
    the page names two problems and one of them cannot be checked from the
    page, the honest answer is that we cannot confirm the correction -- not
    that half of it counts.
    """
    if not expectation.discrepancies:
        return _unavailable(PLACEMENT_REASON_UNKNOWN_CHANGE)
    outcomes = [
        _discrepancy_resolved(code, expectation, obs)
        for code in expectation.discrepancies
    ]
    if any(outcome is None for outcome in outcomes):
        return _unavailable(PLACEMENT_REASON_UNKNOWN_CHANGE)
    return _settled(all(outcomes))


def _restored(baseline: PlacementReading, obs: PlacementReading) -> PlacementVerdict:
    """A defended placement is back to at least where it was.

    The baseline here is the DETERIORATED reading -- the one that raised the
    defence -- so "restored" means present again and mentioned no less than it
    was at the low point.
    """
    return _settled(
        obs.brand_present and obs.brand_match_count >= baseline.brand_match_count
    )


def evaluate_placement(
    *,
    expectation: PlacementExpectation,
    baseline: PlacementReading | None,
    observation: PlacementReading,
) -> PlacementVerdict:
    """Compare one later reading against the frozen baseline, for ONE change."""
    if baseline is None:
        # Nothing had been read when the declaration was made, so there is no
        # before to compare against. Unavailable, never satisfied for free.
        return _unavailable(PLACEMENT_REASON_NO_BASELINE)
    blocked = _comparable(baseline, observation)
    if blocked is not None:
        return blocked
    change = expectation.expected_change
    if change == PLACEMENT_CHANGE_BRAND_LISTED:
        return _settled(observation.brand_present)
    if change == PLACEMENT_CHANGE_DISCREPANCY_RESOLVED:
        return _corrections(expectation, observation)
    if change == PLACEMENT_CHANGE_PLACEMENT_RESTORED:
        return _restored(baseline, observation)
    if change == PLACEMENT_CHANGE_SOURCE_RESOLVED:
        # A research declaration asserts the source is now resolvable. Getting
        # this far IS that: the page was read with enough coverage and yielded
        # a verdict against the current roster.
        return _settled(True)
    return _unavailable(PLACEMENT_REASON_UNKNOWN_CHANGE)
