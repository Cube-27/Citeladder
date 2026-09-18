# Observed-search-surface (Google AI Overview) read model.
#
# Separate from ``schemas.py`` because the surface's projections are a
# self-contained read model over two tables the rest of the analysis layer
# never touches, and because ``schemas.py`` is close enough to the module-size
# ceiling that folding them in would leave no room for either.
#
# Everything here is a PROJECTION of persisted rows -- ``AioObservation``,
# ``AioEntityLink`` and the analysis rows the unchanged scorer already wrote.
# No provider is called and nothing is recomputed (invariant 7).
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class AioLinkEvidence(BaseModel):
    """One inline link the overview pointed at from inside its own text.

    Projected from ``AioEntityLink``, which is populated from the block's
    inline ``links[]`` and never from its references.
    """

    model_config = ConfigDict(from_attributes=True)

    url: str = ""
    domain: str = ""
    title: str = ""
    element_index: int = 0


class SurfaceEntityEvidence(BaseModel):
    """One tracked entity's presence, composed from three INDEPENDENT sources.

    ``mentioned`` comes from the persisted mention rows (answer text),
    ``linked`` from ``AioEntityLink`` (inline links) and ``cited`` from
    ``Citation`` (root references). They come apart in both directions and
    none of them is derived from another.

    ``mention_order`` is computed at read time by ``analysis.position`` over
    the offsets the scorer already persists. It is not a stored field, and it
    is null for an entity the answer never named — which is not last place.
    """

    name: str
    kind: Literal["brand", "competitor"]
    mentioned: bool = False
    linked: bool = False
    cited: bool = False
    first_offset: int | None = None
    mention_order: int | None = None


class SearchSurfaceEvidence(BaseModel):
    """What one Google AI Overview execution observed, or did not.

    Present for an observed-surface execution only. ``aio_present`` keeps its
    three states: ``true`` shown, ``false`` observed absence, ``null`` we
    never successfully looked.
    """

    model_config = ConfigDict(from_attributes=True)

    outcome: str
    aio_present: bool | None = None
    # The AI Overview BLOCK's position on the SERP. Never a brand rank.
    aio_serp_position: int | None = None
    provider_status_code: int | None = None
    error_code: str = ""
    element_count: int = 0
    reference_count: int = 0
    location_code: int = 0
    language_code: str = ""
    device: str = ""
    observed_at: datetime | None = None
    retrieved_at: datetime | None = None
    links: list[AioLinkEvidence] = Field(default_factory=list)
    entities: list[SurfaceEntityEvidence] = Field(default_factory=list)


class AioRateValue(BaseModel):
    """One published rate, inseparable from what it divided by.

    ``value`` is null for UNAVAILABLE and is never 0.0. A displayed 0% would
    be a measurement claim nobody made.
    """

    numerator: int = 0
    denominator: int = 0
    denominator_kind: str = ""
    value: float | None = None


class AioCompetitorRate(BaseModel):
    """One competitor's conditional mention rate, over overviews shown."""

    name: str
    rate: AioRateValue


class SurfaceRatesResponse(BaseModel):
    """The five AI Overview rates for one measurement selection.

    ``excluded`` counts the observations that entered no denominator — failed
    retrievals and parser errors. How many observations were unusable is
    itself worth showing, and hiding it would let our own gaps read as the
    brand's absence.
    """

    logical_engine: str = ""
    successful: int = 0
    with_overview: int = 0
    excluded: int = 0
    trigger_rate: AioRateValue = Field(default_factory=AioRateValue)
    brand_mention_rate_when_present: AioRateValue = Field(default_factory=AioRateValue)
    overall_brand_visibility: AioRateValue = Field(default_factory=AioRateValue)
    owned_citation_rate_when_present: AioRateValue = Field(default_factory=AioRateValue)
    competitor_mention_rates: list[AioCompetitorRate] = Field(default_factory=list)
