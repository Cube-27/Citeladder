"""Model-suggested business-map entries for offerings that have none.

When a Generate request selects offerings whose business map is empty, one
bounded model call proposes attributes, situations/constraints and audiences.
They ground this run's cells and are persisted as unreviewed suggestions
(``origin="model"``, ``review_state="suggested"``) with provenance, so a person
can confirm, edit or delete them on the business screen. Confirmed entries are
never overwritten, and a failed suggestion call only means bare cells.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.connectors.agent.gateway import ModelGateway
from app.connectors.answer_engines.errors import ProviderError
from app.core.config.brand_profile import BUSINESS_MAP_VALUE_MAX_CHARS
from app.core.config.prompts import (
    MAP_SUGGESTION_MAX_PER_DIMENSION,
    MAP_SUGGESTION_SYSTEM_PROMPT,
)
from app.domain.projects.business_map import (
    DIMENSIONS,
    BusinessMapEntry,
    OfferingMap,
)
from app.domain.prompts.portfolio import contains_tracked_name

logger = logging.getLogger(__name__)

_Values = list[str]


class _SuggestedOffering(BaseModel):
    model_config = ConfigDict(extra="forbid")

    offering: str
    attributes: _Values = Field(
        default_factory=list,
        json_schema_extra={"maxItems": MAP_SUGGESTION_MAX_PER_DIMENSION},
    )
    situations: _Values = Field(
        default_factory=list,
        json_schema_extra={"maxItems": MAP_SUGGESTION_MAX_PER_DIMENSION},
    )
    audiences: _Values = Field(
        default_factory=list,
        json_schema_extra={"maxItems": MAP_SUGGESTION_MAX_PER_DIMENSION},
    )


class _SuggestionOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    offerings: list[_SuggestedOffering] = Field(default_factory=list)


def _user_message(offerings: list[str], brand_context: dict[str, Any]) -> str:
    context = {
        "business_context": brand_context.get("business_context") or {},
        "knowledge_base": brand_context.get("knowledge_base") or {},
        "market_country": brand_context.get("country_code") or "",
    }
    return "\n".join(
        [
            "Business context: "
            + json.dumps(context, ensure_ascii=False, separators=(",", ":")),
            "Offerings to map (use these names exactly): "
            + json.dumps(offerings, ensure_ascii=False),
        ]
    )


def _clean_values(values: list[str], banned_names: list[str]) -> list[str]:
    kept: dict[str, str] = {}
    for raw in values[:MAP_SUGGESTION_MAX_PER_DIMENSION]:
        value = " ".join(str(raw).split())[:BUSINESS_MAP_VALUE_MAX_CHARS].strip()
        if value and not contains_tracked_name(value, banned_names):
            kept.setdefault(value.casefold(), value)
    return list(kept.values())


def _offering_map(
    offering: str,
    item: _SuggestedOffering,
    *,
    banned_names: list[str],
    source: dict[str, Any],
) -> OfferingMap | None:
    dimensions = {
        dimension: [
            BusinessMapEntry(
                value=value,
                origin="model",
                review_state="suggested",
                source=dict(source),
            )
            for value in _clean_values(getattr(item, dimension), banned_names)
        ]
        for dimension in DIMENSIONS
    }
    if not any(dimensions.values()):
        return None
    return OfferingMap(offering=offering, **dimensions)


def _banned_names(brand_context: dict[str, Any]) -> list[str]:
    names = [
        str(brand_context.get("brand_name") or ""),
        *[str(alias) for alias in brand_context.get("brand_aliases") or []],
    ]
    for competitor in brand_context.get("competitors") or []:
        names.append(str(competitor.get("name") or ""))
        names.extend(str(alias) for alias in competitor.get("aliases") or [])
    return [name for name in names if name]


async def suggest_offering_maps(
    agent: ModelGateway,
    *,
    offerings: list[str],
    brand_context: dict[str, Any],
) -> list[OfferingMap]:
    """One bounded call; returns only offerings that were asked about."""
    if not offerings:
        return []
    try:
        raw = await agent.complete_structured_json(
            system=MAP_SUGGESTION_SYSTEM_PROMPT,
            user=_user_message(offerings, brand_context),
            schema_name="business_map_suggestions",
            schema=_SuggestionOutput.model_json_schema(),
        )
        output = _SuggestionOutput.model_validate_json(raw)
    except (ProviderError, ValidationError, ValueError) as exc:
        # Suggestions are an optional grounding step: bare cells still work.
        logger.info(
            "business map suggestion skipped",
            extra={"error_type": type(exc).__name__},
        )
        return []
    requested = {name.casefold(): name for name in offerings}
    source = {
        "transport_host": agent.base_url_host,
        "transport_model": agent.model,
        "suggested_at": datetime.now(UTC).isoformat(),
    }
    banned = _banned_names(brand_context)
    maps: dict[str, OfferingMap] = {}
    for item in output.offerings:
        key = item.offering.strip().casefold()
        if key not in requested or key in maps:
            continue
        built = _offering_map(requested[key], item, banned_names=banned, source=source)
        if built is not None:
            maps[key] = built
    return list(maps.values())
