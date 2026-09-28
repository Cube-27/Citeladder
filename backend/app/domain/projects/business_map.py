"""The editable business map: per-offering facts that drive prompt generation.

Stored inside ``BrandProfile.business_context`` (``BusinessContext.business_map``).
Each offering lists its attributes, situations or constraints, and audiences;
``exclusions`` name pairs of those entries that do not combine, so generation
uses only compatible cells. Entries carry provenance: a model may suggest
entries (``origin="model"``, ``review_state="suggested"``), and only a human
confirms them. Unknown stays absent; nothing is padded.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, StringConstraints

from app.core.config.brand_profile import BUSINESS_MAP_VALUE_MAX_CHARS

BusinessMapOrigin = Literal["manual", "model"]
BusinessMapReviewState = Literal["suggested", "confirmed"]
BusinessMapDimension = Literal["attributes", "situations", "audiences"]
DIMENSIONS: tuple[BusinessMapDimension, ...] = (
    "attributes",
    "situations",
    "audiences",
)

MapValue = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=1, max_length=BUSINESS_MAP_VALUE_MAX_CHARS
    ),
]


class BusinessMapEntry(BaseModel):
    value: MapValue
    origin: BusinessMapOrigin = "manual"
    review_state: BusinessMapReviewState = "confirmed"
    reviewed_by: str | None = None
    reviewed_at: str | None = None
    # Model identity and time for a suggestion; empty for manual entries.
    source: dict[str, Any] = Field(default_factory=dict)


class BusinessMapExclusion(BaseModel):
    """Two entries of one offering that never combine in a generation cell."""

    first: MapValue
    second: MapValue


class OfferingMap(BaseModel):
    offering: MapValue
    attributes: list[BusinessMapEntry] = Field(default_factory=list)
    situations: list[BusinessMapEntry] = Field(default_factory=list)
    audiences: list[BusinessMapEntry] = Field(default_factory=list)
    exclusions: list[BusinessMapExclusion] = Field(default_factory=list)


class BusinessMap(BaseModel):
    offerings: list[OfferingMap] = Field(default_factory=list)


def _key(value: str) -> str:
    return value.casefold()


def read_business_map(business_context: object) -> BusinessMap:
    raw = (
        business_context.get("business_map")
        if isinstance(business_context, dict)
        else None
    )
    try:
        return BusinessMap.model_validate(raw or {})
    except ValueError:
        return BusinessMap()


def has_map_entries(offering: OfferingMap | None) -> bool:
    return offering is not None and any(
        getattr(offering, dimension) for dimension in DIMENSIONS
    )


def with_model_suggestions(
    business_context: object,
    suggestions: list[OfferingMap],
    *,
    offerings: list[str],
    run_id: str,
) -> dict[str, Any] | None:
    """``business_context`` with suggestions added where a map is still empty.

    Called under the project lock at write time. An offering that gained
    entries since the suggestion was requested (a person edited the map
    concurrently) keeps them untouched, and an offering no longer confirmed
    is skipped. Returns ``None`` when nothing changes.
    """
    allowed = {_key(name): name for name in offerings}
    current = read_business_map(business_context)
    by_key = {_key(item.offering): item for item in current.offerings}
    changed = False
    for suggestion in suggestions:
        key = _key(suggestion.offering)
        existing = by_key.get(key)
        if key not in allowed or has_map_entries(existing):
            continue
        stamped = {
            dimension: [
                entry.model_copy(
                    update={"source": {**entry.source, "generation_run_id": run_id}}
                )
                for entry in getattr(suggestion, dimension)
            ]
            for dimension in DIMENSIONS
        }
        by_key[key] = OfferingMap(offering=allowed[key], **stamped)
        changed = True
    if not changed:
        return None
    merged = BusinessMap(offerings=list(by_key.values()))
    return {
        **(dict(business_context) if isinstance(business_context, dict) else {}),
        "business_map": merged.model_dump(mode="json"),
    }
