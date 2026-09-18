"""Published rates for the observed Google AI Overview surface.

Keeping the surface in the composite visibility score is a product decision.
It is not a substitute for deciding what each RATE divides by, and these
answer different questions that are easy to confuse:

    With 100 successful observations, 40 AI Overviews and 10 naming the
    brand — the trigger rate is 40%, the conditional mention rate is 25%,
    and the overall AIO visibility is 10%.

All three are true and none of them is "how visible are we". A number
published without its denominator is a number that will be read as whichever
of the three the reader already had in mind.

Two rules run through every function here.

**Failed and pending observations are excluded from every denominator.** A
task CiteLadder could not retrieve says nothing about whether Google showed
the brand, so counting it as an absence would report our own failures as the
brand's.

**An empty denominator is UNAVAILABLE, never 0%.** The codebase already
treats unknown, zero and unavailable as three distinct states, and a rate
with nothing to divide is unknown — a displayed 0% would be a measurement
claim nobody made.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from app.connectors.search_surfaces.contracts import (
    OUTCOME_AI_OVERVIEW_PRESENT,
    SUCCESSFUL_OUTCOMES,
)

# What each rate divides by, as a token the UI renders beside the number. The
# label is part of the contract: a rate whose denominator is not stated is not
# publishable.
DENOMINATOR_SUCCESSFUL_OBSERVATIONS: Final = "successful_observations"
DENOMINATOR_OBSERVATIONS_WITH_AIO: Final = "observations_with_ai_overview"


@dataclass(frozen=True, slots=True)
class AioRate:
    """One published rate, inseparable from what it divided by.

    ``value`` is ``None`` for unavailable. It is not 0.0, and there is no
    method that turns it into 0.0 — the absence has to survive all the way to
    the renderer or the distinction was pointless.
    """

    numerator: int
    denominator: int
    denominator_kind: str
    value: float | None

    @property
    def available(self) -> bool:
        return self.value is not None


def _rate(numerator: int, denominator: int, kind: str) -> AioRate:
    return AioRate(
        numerator=numerator,
        denominator=denominator,
        denominator_kind=kind,
        value=(numerator / denominator) if denominator else None,
    )


@dataclass(frozen=True, slots=True)
class AioObservationCounts:
    """The counted inputs every rate below is derived from.

    Counted once, from the observation rows, so the five rates cannot drift
    apart by each recomputing its own idea of what happened.
    """

    successful: int = 0
    with_overview: int = 0
    brand_mentioned: int = 0
    owned_citation: int = 0
    excluded: int = 0


def count_observations(
    rows: list[tuple[str, bool | None, bool, bool]],
) -> AioObservationCounts:
    """Fold ``(outcome, aio_present, named_brand, cited_owned)`` rows.

    Failed and pending observations land in ``excluded`` rather than being
    dropped silently: how many observations were unusable is itself something
    worth being able to show.
    """
    successful = with_overview = mentioned = cited = excluded = 0
    for outcome, aio_present, named_brand, cited_owned in rows:
        if outcome not in SUCCESSFUL_OUTCOMES:
            excluded += 1
            continue
        successful += 1
        if outcome != OUTCOME_AI_OVERVIEW_PRESENT:
            continue
        if aio_present is not True:
            # The outcome says an overview was present and the flag disagrees.
            # These rows come from the database, where nothing enforces the
            # result contract, so a contradiction here is a persistence bug —
            # and folding it silently into a denominator would publish a rate
            # derived from data known to be wrong.
            raise ValueError(
                f"{OUTCOME_AI_OVERVIEW_PRESENT} observation has "
                f"aio_present={aio_present!r}"
            )
        with_overview += 1
        if named_brand:
            mentioned += 1
        if cited_owned:
            cited += 1
    return AioObservationCounts(
        successful=successful,
        with_overview=with_overview,
        brand_mentioned=mentioned,
        owned_citation=cited,
        excluded=excluded,
    )


def trigger_rate(counts: AioObservationCounts) -> AioRate:
    """How often Google shows an AI Overview at all for these prompts.

    A property of the QUERIES, not of the brand. It moves when Google changes
    what it answers with, and reading it as a visibility change is the most
    likely misreading of this whole surface.
    """
    return _rate(
        counts.with_overview,
        counts.successful,
        DENOMINATOR_SUCCESSFUL_OBSERVATIONS,
    )


def brand_mention_rate_when_present(counts: AioObservationCounts) -> AioRate:
    """Of the overviews that appeared, how many named the brand.

    CONDITIONAL. It answers "when there is an overview, are we in it", and it
    can rise while overall visibility falls — if Google shows fewer overviews
    but the brand appears in more of the ones it does show.
    """
    return _rate(
        counts.brand_mentioned,
        counts.with_overview,
        DENOMINATOR_OBSERVATIONS_WITH_AIO,
    )


def overall_brand_visibility(counts: AioObservationCounts) -> AioRate:
    """Of every successful observation, how many named the brand.

    The unconditional one, and the closest of the three to "how visible are
    we on this surface". It folds the trigger rate in: no overview counts
    against it, because the brand was not shown.
    """
    return _rate(
        counts.brand_mentioned,
        counts.successful,
        DENOMINATOR_SUCCESSFUL_OBSERVATIONS,
    )


def owned_citation_rate_when_present(counts: AioObservationCounts) -> AioRate:
    """Of the overviews that appeared, how many cited an owned domain.

    Conditional, like the mention rate, and deliberately independent of it:
    an overview can name the brand without citing it, and cite it without
    naming it.
    """
    return _rate(
        counts.owned_citation,
        counts.with_overview,
        DENOMINATOR_OBSERVATIONS_WITH_AIO,
    )


def competitor_mention_rate(
    counts: AioObservationCounts, *, competitor_mentions: int
) -> AioRate:
    """Per competitor, over the overviews that appeared.

    Conditional so it is comparable with the brand's own mention rate. Two
    rates over different denominators would not be.
    """
    return _rate(
        competitor_mentions,
        counts.with_overview,
        DENOMINATOR_OBSERVATIONS_WITH_AIO,
    )
