"""Comparing a later reading of somebody else's page against a frozen one.

The failure this guards is a placement reported as verified because the brand
turned up somewhere on the page, when what was declared was something else
entirely. A correction that named a missing outbound link is not satisfied by
a mention in the prose.

The second failure is the quieter one: "we could not look" reported as "it did
not happen". Every unavailable state below stays unavailable.
"""

from __future__ import annotations

from app.analysis.opportunities.placement_outcome import (
    PlacementExpectation,
    PlacementReading,
    evaluate_placement,
)
from app.core.config.placement import (
    PLACEMENT_CHANGE_BRAND_LISTED,
    PLACEMENT_CHANGE_DISCREPANCY_RESOLVED,
    PLACEMENT_CHANGE_PLACEMENT_RESTORED,
    PLACEMENT_REASON_COVERAGE,
    PLACEMENT_REASON_NO_BASELINE,
    PLACEMENT_REASON_ROSTER_CHANGED,
    PLACEMENT_REASON_UNKNOWN_CHANGE,
    PLACEMENT_STATE_SATISFIED,
    PLACEMENT_STATE_UNAVAILABLE,
    PLACEMENT_STATE_UNMET,
)

_ROSTER = "roster-abc"


def _reading(
    *,
    roster: str = _ROSTER,
    chars: int = 5_000,
    presence: str | None = "not_detected",
    present: bool = False,
    matches: int = 0,
    outbound: tuple[str, ...] = (),
    headings: tuple[str, ...] = (),
) -> PlacementReading:
    return PlacementReading(
        snapshot_id="snap",
        roster_version=roster,
        extracted_chars=chars,
        brand_presence=presence,
        brand_present=present,
        brand_match_count=matches,
        outbound_domains=outbound,
        headings=headings,
    )


def test_a_listing_that_went_live_is_satisfied() -> None:
    verdict = evaluate_placement(
        expectation=PlacementExpectation(expected_change=PLACEMENT_CHANGE_BRAND_LISTED),
        baseline=_reading(),
        observation=_reading(presence="present", present=True, matches=2),
    )

    assert verdict.state == PLACEMENT_STATE_SATISFIED


def test_a_listing_that_never_appeared_is_unmet() -> None:
    verdict = evaluate_placement(
        expectation=PlacementExpectation(expected_change=PLACEMENT_CHANGE_BRAND_LISTED),
        baseline=_reading(),
        observation=_reading(),
    )

    assert verdict.state == PLACEMENT_STATE_UNMET


def test_a_correction_verifies_the_discrepancy_it_named() -> None:
    """Not merely that the brand appears. The declaration was about a link."""
    expectation = PlacementExpectation(
        expected_change=PLACEMENT_CHANGE_DISCREPANCY_RESOLVED,
        brand_name="Acme Corp",
        owned_domains=("acme.com",),
        discrepancies=("owned_domain_missing",),
    )

    mentioned_only = evaluate_placement(
        expectation=expectation,
        baseline=_reading(),
        observation=_reading(
            presence="present", present=True, matches=3, outbound=("globex.com",)
        ),
    )
    linked = evaluate_placement(
        expectation=expectation,
        baseline=_reading(),
        observation=_reading(
            presence="present", present=True, matches=3, outbound=("www.acme.com",)
        ),
    )

    assert mentioned_only.state == PLACEMENT_STATE_UNMET
    assert linked.state == PLACEMENT_STATE_SATISFIED


def test_a_correction_about_an_entry_checks_the_headings() -> None:
    expectation = PlacementExpectation(
        expected_change=PLACEMENT_CHANGE_DISCREPANCY_RESOLVED,
        brand_name="Acme Corp",
        discrepancies=("not_listed_as_entry",),
    )

    verdict = evaluate_placement(
        expectation=expectation,
        baseline=_reading(),
        observation=_reading(
            presence="present",
            present=True,
            matches=1,
            headings=("2. Acme Corp", "3. Globex"),
        ),
    )

    assert verdict.state == PLACEMENT_STATE_SATISFIED


def test_a_correction_naming_an_uncheckable_code_is_unavailable() -> None:
    """Half a correction is not a correction, and is never reported as one."""
    verdict = evaluate_placement(
        expectation=PlacementExpectation(
            expected_change=PLACEMENT_CHANGE_DISCREPANCY_RESOLVED,
            brand_name="Acme Corp",
            owned_domains=("acme.com",),
            discrepancies=("owned_domain_missing", "invented_future_code"),
        ),
        baseline=_reading(),
        observation=_reading(
            presence="present", present=True, matches=1, outbound=("acme.com",)
        ),
    )

    assert verdict.state == PLACEMENT_STATE_UNAVAILABLE
    assert verdict.reason == PLACEMENT_REASON_UNKNOWN_CHANGE


def test_a_defended_placement_must_be_no_worse_than_the_low_point() -> None:
    baseline = _reading(presence="present", present=True, matches=1)
    expectation = PlacementExpectation(
        expected_change=PLACEMENT_CHANGE_PLACEMENT_RESTORED
    )

    still_thin = evaluate_placement(
        expectation=expectation,
        baseline=baseline,
        observation=_reading(presence="not_detected"),
    )
    restored = evaluate_placement(
        expectation=expectation,
        baseline=baseline,
        observation=_reading(presence="present", present=True, matches=4),
    )

    assert still_thin.state == PLACEMENT_STATE_UNMET
    assert restored.state == PLACEMENT_STATE_SATISFIED


def test_a_reading_judged_against_another_roster_is_not_compared() -> None:
    """The same rule `earned_page_hits._prior` applies to deterioration.

    A roster change makes two readings answer different questions, so
    comparing them would report an alias somebody removed as a placement the
    publisher took down.
    """
    verdict = evaluate_placement(
        expectation=PlacementExpectation(expected_change=PLACEMENT_CHANGE_BRAND_LISTED),
        baseline=_reading(roster="roster-old"),
        observation=_reading(presence="present", present=True, matches=2),
    )

    assert verdict.state == PLACEMENT_STATE_UNAVAILABLE
    assert verdict.reason == PLACEMENT_REASON_ROSTER_CHANGED


def test_a_page_we_barely_read_cannot_settle_anything() -> None:
    verdict = evaluate_placement(
        expectation=PlacementExpectation(expected_change=PLACEMENT_CHANGE_BRAND_LISTED),
        baseline=_reading(),
        observation=_reading(chars=40),
    )

    assert verdict.state == PLACEMENT_STATE_UNAVAILABLE
    assert verdict.reason == PLACEMENT_REASON_COVERAGE


def test_a_declaration_with_no_frozen_baseline_never_passes_for_free() -> None:
    verdict = evaluate_placement(
        expectation=PlacementExpectation(expected_change=PLACEMENT_CHANGE_BRAND_LISTED),
        baseline=None,
        observation=_reading(presence="present", present=True, matches=9),
    )

    assert verdict.state == PLACEMENT_STATE_UNAVAILABLE
    assert verdict.reason == PLACEMENT_REASON_NO_BASELINE
