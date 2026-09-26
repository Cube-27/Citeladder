"""The editable business map: per-offering facts that drive prompt generation.

Stored inside ``BrandProfile.business_context`` (``BusinessContext.business_map``).
Each offering lists its attributes, situations or constraints, and audiences;
``exclusions`` name pairs of those entries that do not combine, so generation
uses only compatible cells. Entries carry provenance: a model may suggest
entries (``origin="model"``, ``review_state="suggested"``), and only a human
confirms them. Unknown stays absent; nothing is padded.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.brand_profile import (
    BUSINESS_MAP_MAX_ENTRIES_PER_DIMENSION,
    BUSINESS_MAP_MAX_EXCLUSIONS,
    BUSINESS_MAP_VALUE_MAX_CHARS,
)
from app.domain.projects.brand_profile import get_brand_profile

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


# --- Update contract ------------------------------------------------------
class BusinessMapEntryInput(BaseModel):
    value: MapValue
    # Keeping a suggestion unconfirmed is allowed; a new entry is always a
    # confirmed manual fact, whatever the request says.
    review_state: BusinessMapReviewState = "confirmed"


class OfferingMapInput(BaseModel):
    offering: MapValue
    attributes: list[BusinessMapEntryInput] = Field(
        default_factory=list, max_length=BUSINESS_MAP_MAX_ENTRIES_PER_DIMENSION
    )
    situations: list[BusinessMapEntryInput] = Field(
        default_factory=list, max_length=BUSINESS_MAP_MAX_ENTRIES_PER_DIMENSION
    )
    audiences: list[BusinessMapEntryInput] = Field(
        default_factory=list, max_length=BUSINESS_MAP_MAX_ENTRIES_PER_DIMENSION
    )
    exclusions: list[BusinessMapExclusion] = Field(
        default_factory=list, max_length=BUSINESS_MAP_MAX_EXCLUSIONS
    )


class BusinessMapUpdate(BaseModel):
    offerings: list[OfferingMapInput] = Field(default_factory=list)


class BusinessMapResponse(BusinessMap):
    # The confirmed offerings a map entry may belong to (products_services).
    available_offerings: list[str] = Field(default_factory=list)


class BusinessMapValidationError(ValueError):
    """The requested map does not fit the profile (422 at the API layer)."""


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


def _merge_entry(
    requested: BusinessMapEntryInput,
    prior: BusinessMapEntry | None,
    *,
    reviewer: str,
    now: str,
) -> BusinessMapEntry:
    if prior is None:
        return BusinessMapEntry(
            value=requested.value, reviewed_by=reviewer, reviewed_at=now
        )
    confirming = (
        prior.review_state == "suggested" and requested.review_state == "confirmed"
    )
    return prior.model_copy(
        update={
            "value": requested.value,
            **(
                {
                    "review_state": "confirmed",
                    "reviewed_by": reviewer,
                    "reviewed_at": now,
                }
                if confirming
                else {}
            ),
        }
    )


def _merge_dimension(
    requested: list[BusinessMapEntryInput],
    prior: list[BusinessMapEntry],
    *,
    reviewer: str,
    now: str,
) -> list[BusinessMapEntry]:
    prior_by_key = {_key(entry.value): entry for entry in prior}
    merged: dict[str, BusinessMapEntry] = {}
    for entry in requested:
        key = _key(entry.value)
        if key not in merged:
            merged[key] = _merge_entry(
                entry, prior_by_key.get(key), reviewer=reviewer, now=now
            )
    return list(merged.values())


def _checked_exclusions(offering: OfferingMap) -> list[BusinessMapExclusion]:
    known = {
        _key(entry.value)
        for dimension in DIMENSIONS
        for entry in getattr(offering, dimension)
    }
    kept: dict[frozenset[str], BusinessMapExclusion] = {}
    for exclusion in offering.exclusions:
        pair = frozenset({_key(exclusion.first), _key(exclusion.second)})
        if len(pair) != 2 or not pair <= known:
            raise BusinessMapValidationError(
                f"Exclusions for {offering.offering!r} must name two of its entries"
            )
        kept.setdefault(pair, exclusion)
    return list(kept.values())


def merge_business_map(
    update: BusinessMapUpdate,
    prior: BusinessMap,
    *,
    offerings: list[str],
    reviewer: str,
) -> BusinessMap:
    """Apply a full-map edit, preserving each surviving entry's provenance."""
    allowed = {_key(name): name for name in offerings}
    prior_by_offering = {_key(item.offering): item for item in prior.offerings}
    now = datetime.now(UTC).isoformat()
    result: dict[str, OfferingMap] = {}
    for item in update.offerings:
        key = _key(item.offering)
        if key not in allowed:
            raise BusinessMapValidationError(
                f"{item.offering!r} is not one of this brand's offerings"
            )
        if key in result:
            raise BusinessMapValidationError(f"{item.offering!r} appears twice")
        previous = prior_by_offering.get(key) or OfferingMap(offering=allowed[key])
        merged = OfferingMap(
            offering=allowed[key],
            **{
                dimension: _merge_dimension(
                    getattr(item, dimension),
                    getattr(previous, dimension),
                    reviewer=reviewer,
                    now=now,
                )
                for dimension in DIMENSIONS
            },
            exclusions=item.exclusions,
        )
        merged.exclusions = _checked_exclusions(merged)
        result[key] = merged
    return BusinessMap(offerings=list(result.values()))


def _response(business_map: BusinessMap, offerings: list[str]) -> BusinessMapResponse:
    return BusinessMapResponse(
        offerings=business_map.offerings, available_offerings=offerings
    )


async def get_business_map(
    session: AsyncSession, *, workspace_id: uuid.UUID, project_id: uuid.UUID
) -> BusinessMapResponse:
    profile = await get_brand_profile(
        session, workspace_id=workspace_id, project_id=project_id
    )
    return _response(
        read_business_map(profile.business_context),
        list(profile.products_services or []),
    )


async def update_business_map(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: BusinessMapUpdate,
) -> BusinessMapResponse:
    profile = await get_brand_profile(
        session, workspace_id=workspace_id, project_id=project_id
    )
    offerings = list(profile.products_services or [])
    merged = merge_business_map(
        payload,
        read_business_map(profile.business_context),
        offerings=offerings,
        reviewer=str(user_id),
    )
    # Replace only the map key so every other persisted fact is untouched.
    profile.business_context = {
        **dict(profile.business_context or {}),
        "business_map": merged.model_dump(mode="json"),
    }
    await session.commit()
    return _response(merged, offerings)
