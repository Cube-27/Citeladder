"""Every published rate states what it divided by, and never fabricates one.

The worked example in the module docstring is the whole point of this file:
three true rates over the same data that a reader will confuse unless each
one carries its denominator.
"""

from __future__ import annotations

from app.connectors.search_surfaces.contracts import (
    OUTCOME_AI_OVERVIEW_PRESENT,
    OUTCOME_EXECUTION_FAILURE,
    OUTCOME_NO_AI_OVERVIEW,
    OUTCOME_PARSER_ERROR,
    OUTCOME_PROVIDER_ERROR,
)
from app.domain.analysis.aio_rates import (
    DENOMINATOR_OBSERVATIONS_WITH_AIO,
    DENOMINATOR_SUCCESSFUL_OBSERVATIONS,
    AioObservationCounts,
    brand_mention_rate_when_present,
    competitor_mention_rate,
    count_observations,
    overall_brand_visibility,
    owned_citation_rate_when_present,
    trigger_rate,
)


def _rows(
    *,
    present_named: int = 0,
    present_unnamed: int = 0,
    absent: int = 0,
    failed: int = 0,
) -> list[tuple[str, bool | None, bool, bool]]:
    rows: list[tuple[str, bool | None, bool, bool]] = []
    rows += [(OUTCOME_AI_OVERVIEW_PRESENT, True, True, False)] * present_named
    rows += [(OUTCOME_AI_OVERVIEW_PRESENT, True, False, False)] * present_unnamed
    rows += [(OUTCOME_NO_AI_OVERVIEW, False, False, False)] * absent
    rows += [(OUTCOME_EXECUTION_FAILURE, None, False, False)] * failed
    return rows


class TestTheWorkedExample:
    """100 successful observations, 40 overviews, 10 naming the brand."""

    counts = count_observations(_rows(present_named=10, present_unnamed=30, absent=60))

    def test_the_three_rates_are_all_true_and_all_different(self) -> None:
        assert self.counts.successful == 100
        assert self.counts.with_overview == 40
        assert trigger_rate(self.counts).value == 0.40
        assert brand_mention_rate_when_present(self.counts).value == 0.25
        assert overall_brand_visibility(self.counts).value == 0.10

    def test_each_rate_names_what_it_divided_by(self) -> None:
        assert (
            trigger_rate(self.counts).denominator_kind
            == DENOMINATOR_SUCCESSFUL_OBSERVATIONS
        )
        assert (
            brand_mention_rate_when_present(self.counts).denominator_kind
            == DENOMINATOR_OBSERVATIONS_WITH_AIO
        )
        assert (
            overall_brand_visibility(self.counts).denominator_kind
            == DENOMINATOR_SUCCESSFUL_OBSERVATIONS
        )

    def test_the_conditional_rate_can_rise_while_visibility_falls(self) -> None:
        """Why publishing one without the other misleads.

        Google shows far fewer overviews, but the brand is in a bigger share
        of the ones it does show. The conditional rate improves; the brand is
        in fact less visible.
        """
        fewer = count_observations(_rows(present_named=5, present_unnamed=5, absent=90))
        assert brand_mention_rate_when_present(fewer).value == 0.50  # was 0.25
        assert overall_brand_visibility(fewer).value == 0.05  # was 0.10


class TestExcludedObservations:
    def test_failed_observations_leave_every_denominator(self) -> None:
        # A task we could not retrieve says nothing about whether Google
        # showed the brand. Counting it as an absence would report our own
        # failures as the brand's.
        counts = count_observations(_rows(present_named=1, absent=1, failed=8))
        assert counts.successful == 2
        assert counts.excluded == 8
        assert overall_brand_visibility(counts).denominator == 2

    def test_every_unsuccessful_outcome_is_excluded(self) -> None:
        rows: list[tuple[str, bool | None, bool, bool]] = [
            (OUTCOME_PROVIDER_ERROR, None, False, False),
            (OUTCOME_PARSER_ERROR, None, False, False),
            (OUTCOME_EXECUTION_FAILURE, None, False, False),
        ]
        counts = count_observations(rows)
        assert counts.successful == 0
        assert counts.excluded == 3

    def test_a_measured_absence_stays_in_the_denominator(self) -> None:
        """`no_ai_overview` is an observation, not a failure.

        It is the one outcome that means "we looked and there was nothing",
        so it belongs in every rate's denominator.
        """
        counts = count_observations(_rows(absent=5))
        assert counts.successful == 5
        assert trigger_rate(counts).value == 0.0


class TestUnavailableVersusZero:
    def test_an_empty_denominator_is_unavailable_not_zero(self) -> None:
        empty = AioObservationCounts()
        rate = trigger_rate(empty)
        assert rate.value is None
        assert rate.available is False
        # Specifically NOT 0.0: a displayed 0% would be a measurement claim
        # nobody made.
        assert rate.value != 0.0

    def test_a_genuine_zero_is_available_and_zero(self) -> None:
        counts = count_observations(_rows(absent=10))
        rate = overall_brand_visibility(counts)
        assert rate.available is True
        assert rate.value == 0.0

    def test_conditional_rates_are_unavailable_when_no_overview_appeared(
        self,
    ) -> None:
        # Ten successful observations, none with an overview. "How often were
        # we named IN an overview" has no answer, and 0% would be the wrong
        # one.
        counts = count_observations(_rows(absent=10))
        assert brand_mention_rate_when_present(counts).value is None
        assert owned_citation_rate_when_present(counts).value is None
        # While the unconditional rate is perfectly well defined.
        assert overall_brand_visibility(counts).value == 0.0


class TestIndependentSignals:
    def test_citation_and_mention_rates_are_counted_separately(self) -> None:
        rows: list[tuple[str, bool | None, bool, bool]] = [
            # Named, not cited.
            (OUTCOME_AI_OVERVIEW_PRESENT, True, True, False),
            # Cited, not named.
            (OUTCOME_AI_OVERVIEW_PRESENT, True, False, True),
        ]
        counts = count_observations(rows)
        assert brand_mention_rate_when_present(counts).value == 0.5
        assert owned_citation_rate_when_present(counts).value == 0.5
        assert counts.brand_mentioned == 1
        assert counts.owned_citation == 1

    def test_competitor_rates_share_the_brands_denominator(self) -> None:
        # Comparable only because both divide by the same thing.
        counts = count_observations(_rows(present_named=10, present_unnamed=30))
        brand = brand_mention_rate_when_present(counts)
        competitor = competitor_mention_rate(counts, competitor_mentions=20)
        assert brand.denominator == competitor.denominator == 40
        assert competitor.value == 0.5


class TestContradictoryRows:
    """Rows come from the database, where nothing enforces the contract."""

    def test_a_present_outcome_with_a_false_flag_is_refused(self) -> None:
        # Silently folding it into a denominator would publish a rate derived
        # from data already known to be wrong.
        import pytest

        with pytest.raises(ValueError, match="aio_present"):
            count_observations([(OUTCOME_AI_OVERVIEW_PRESENT, False, True, False)])

    def test_a_present_outcome_with_a_null_flag_is_refused(self) -> None:
        import pytest

        with pytest.raises(ValueError, match="aio_present"):
            count_observations([(OUTCOME_AI_OVERVIEW_PRESENT, None, False, False)])

    def test_a_failed_outcome_with_a_null_flag_is_perfectly_normal(self) -> None:
        # Null is exactly what a non-observation is SUPPOSED to carry.
        counts = count_observations([(OUTCOME_EXECUTION_FAILURE, None, False, False)])
        assert counts.excluded == 1
