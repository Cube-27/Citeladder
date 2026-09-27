"""Compatible business-map cells: the buyer needs one Generate request covers.

A cell is one offering plus at most ``GENERATION_CELL_MAX_FACETS`` of its
attribute, situation/constraint and audience entries, a target buyer stage
and optionally a market. Only compatible combinations are
built: a pair the business map excludes never shares a cell, and the full
Cartesian product is never enumerated beyond the bounded per-offering map.

Cells are chosen greedily so each pick uses the values used least so far,
which spreads a small request across the map instead of exhausting the first
attribute. Faceted cells lead, preferring confirmed entries within that group;
an offering without a map still yields bare cells (topic only), never padded
with invented facts.
"""

from __future__ import annotations

import itertools
import uuid
from collections import Counter
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from app.core.config.prompts import GENERATION_CELL_MAX_FACETS
from app.core.config.visibility_prompts import BUYER_STAGES
from app.domain.projects.business_map import (
    DIMENSIONS,
    BusinessMap,
    BusinessMapDimension,
    OfferingMap,
)

# Facet name on a cell for each business-map dimension.
_FACET_BY_DIMENSION: dict[BusinessMapDimension, str] = {
    "attributes": "attribute",
    "situations": "situation",
    "audiences": "audience",
}


@dataclass(frozen=True, slots=True)
class CellTopic:
    """A selected topic and the offering map that grounds it (if any)."""

    topic_id: uuid.UUID
    name: str
    description: str
    offering_map: OfferingMap | None


@dataclass(frozen=True, slots=True)
class GenerationCell:
    topic_id: uuid.UUID
    topic_name: str
    topic_description: str
    offering: str
    attribute: str = ""
    situation: str = ""
    audience: str = ""
    buyer_stage: str = ""
    market: str = ""
    # True when any facet comes from an unreviewed model suggestion.
    suggested: bool = False

    def buyer_need(self) -> dict[str, str]:
        need = {
            "offering": self.offering,
            "attribute": self.attribute,
            "situation_or_constraint": self.situation,
            "audience": self.audience,
            "market": self.market,
        }
        return {key: value for key, value in need.items() if value}

    def evidence_ref(self) -> dict[str, object]:
        return {
            "kind": "business_map_cell",
            **self.buyer_need(),
            "target_buyer_stage": self.buyer_stage,
            "review_state": "suggested" if self.suggested else "confirmed",
            "evidence_type": "hypothesis",
        }


@dataclass(frozen=True, slots=True)
class _Combo:
    facets: tuple[tuple[str, str], ...]  # (facet name, value)
    suggested: int  # number of facets from unreviewed suggestions


def _key(value: str) -> str:
    return value.casefold()


def offering_for_topic(
    business_map: BusinessMap, name: str, parent_name: str | None
) -> OfferingMap | None:
    """The map entry for a topic, falling back to its parent's offering."""
    by_name = {_key(item.offering): item for item in business_map.offerings}
    found = by_name.get(_key(name))
    if found is None and parent_name:
        found = by_name.get(_key(parent_name))
    return found


def _dimension_options(
    offering: OfferingMap | None, dimension: BusinessMapDimension
) -> list[tuple[str, bool]]:
    """Confirmed values first, then suggestions; empty string = facet unused."""
    entries = list(getattr(offering, dimension)) if offering is not None else []
    confirmed = [(e.value, False) for e in entries if e.review_state == "confirmed"]
    suggested = [(e.value, True) for e in entries if e.review_state != "confirmed"]
    return [("", False), *confirmed, *suggested]


def _excluded_pairs(offering: OfferingMap | None) -> set[frozenset[str]]:
    if offering is None:
        return set()
    return {
        frozenset({_key(item.first), _key(item.second)}) for item in offering.exclusions
    }


def _compatible(
    values: Sequence[str], excluded: set[frozenset[str]], max_facets: int
) -> bool:
    used = [_key(value) for value in values if value]
    if len(used) > max_facets:
        return False
    return not any(
        frozenset(pair) in excluded for pair in itertools.combinations(used, 2)
    )


def compatible_combos(
    offering: OfferingMap | None, *, max_facets: int = GENERATION_CELL_MAX_FACETS
) -> list[_Combo]:
    """Every compatible facet combination of one offering, bare combo first."""
    options = [_dimension_options(offering, dimension) for dimension in DIMENSIONS]
    excluded = _excluded_pairs(offering)
    combos: list[_Combo] = []
    for picked in itertools.product(*options):
        values = [value for value, _ in picked]
        if not _compatible(values, excluded, max_facets):
            continue
        combos.append(
            _Combo(
                facets=tuple(
                    (_FACET_BY_DIMENSION[dimension], value)
                    for dimension, (value, _) in zip(DIMENSIONS, picked, strict=True)
                    if value
                ),
                suggested=sum(1 for value, flag in picked if value and flag),
            )
        )
    return combos


class _Spread:
    """Least-used-first picker over one topic's combos, stages and markets."""

    def __init__(self, combos: list[_Combo], markets: Sequence[str]) -> None:
        self._combos = combos
        self._remaining = list(range(len(combos)))
        self._markets = ["", *dict.fromkeys(market for market in markets if market)]
        self._usage: Counter[tuple[str, str]] = Counter()

    def _score(self, index: int) -> tuple[bool, bool, int, int]:
        combo = self._combos[index]
        usage = sum(self._usage[facet] for facet in combo.facets)
        return (not bool(combo.facets), bool(combo.suggested), usage, index)

    def _least_used(self, facet: str, values: Iterable[str]) -> str:
        return min(values, key=lambda value: self._usage[(facet, value)])

    def pick(self) -> tuple[_Combo, str, str]:
        if not self._remaining:
            # A small map is re-used with different stages/markets rather
            # than padded with invented facts.
            self._remaining = list(range(len(self._combos)))
        index = min(self._remaining, key=self._score)
        self._remaining.remove(index)
        combo = self._combos[index]
        stage = self._least_used("buyer_stage", BUYER_STAGES)
        market = self._least_used("market", self._markets)
        for facet in (*combo.facets, ("buyer_stage", stage), ("market", market)):
            self._usage[facet] += 1
        return combo, stage, market


def plan_generation_cells(
    topics: Sequence[CellTopic], *, total: int, markets: Sequence[str] = ()
) -> list[GenerationCell]:
    """``total`` cells, round-robin across topics, spread within each topic."""
    if total <= 0 or not topics:
        return []
    spreads = [
        _Spread(compatible_combos(topic.offering_map), markets) for topic in topics
    ]
    cells: list[GenerationCell] = []
    for index in range(total):
        topic = topics[index % len(topics)]
        combo, stage, market = spreads[index % len(topics)].pick()
        facets = dict(combo.facets)
        cells.append(
            GenerationCell(
                topic_id=topic.topic_id,
                topic_name=topic.name,
                topic_description=topic.description,
                offering=(
                    topic.offering_map.offering if topic.offering_map else topic.name
                ),
                attribute=facets.get("attribute", ""),
                situation=facets.get("situation", ""),
                audience=facets.get("audience", ""),
                buyer_stage=stage,
                market=market,
                suggested=combo.suggested > 0,
            )
        )
    return cells
