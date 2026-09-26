"""Canonical, persisted business facts shared by discovery and generation."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, Field, ValidationError

from app.domain.projects.business_map import BusinessMap
from app.domain.projects.discovery_schemas import (
    BusinessModel,
    BuyerRegister,
    DiscoveryProfile,
    KnowledgeStrength,
    MarketScope,
)

if TYPE_CHECKING:
    from app.models.project import Project


def _normalize_legacy_buyer_type(raw: dict[str, Any]) -> None:
    if "business_type" not in raw:
        return
    legacy_buyer_type = raw.pop("business_type")
    sources = raw.get("field_sources")
    if not isinstance(sources, dict):
        if "buyer_type" not in raw:
            raw["buyer_type"] = legacy_buyer_type
        return
    sources = dict(sources)
    legacy_source = sources.pop("business_type", None)
    if "buyer_type" not in raw or (
        legacy_source == "reviewed" and sources.get("buyer_type") != "reviewed"
    ):
        raw["buyer_type"] = legacy_buyer_type
        if legacy_source is not None:
            sources["buyer_type"] = legacy_source
    raw["field_sources"] = sources


class BusinessContext(BaseModel):
    """Reviewed facts and nullable inferences; BrandProfile remains the store."""

    description: str = ""
    positioning: str = ""
    products_services: list[str] = Field(default_factory=list)
    target_audience: str = ""
    primary_market: str = ""
    language_code: str = ""
    category: str = ""
    category_aliases: list[str] = Field(default_factory=list)
    category_terms: list[str] = Field(default_factory=list)
    jobs_to_be_done: list[str] = Field(default_factory=list)
    sector: str | None = None
    business_model: BusinessModel | None = None
    secondary_business_models: list[BusinessModel] = Field(default_factory=list)
    market_scope: MarketScope | None = None
    buyer_type: str | None = None
    buyer_register: BuyerRegister | None = None
    buyer_roles: list[str] = Field(default_factory=list)
    service_areas: list[str] = Field(default_factory=list)
    price_tier: str | None = None
    knowledge_strength: KnowledgeStrength = "none"
    # Reviewed per-offering facts (domain/projects/business_map.py); consumed
    # explicitly by generation rather than sent as free context.
    business_map: BusinessMap = Field(default_factory=BusinessMap)
    field_sources: dict[str, str] = Field(default_factory=dict)

    @classmethod
    def from_onboarding(
        cls,
        confirmed: DiscoveryProfile,
        inferred: dict[str, Any] | None = None,
        *,
        primary_market: str = "",
        language_code: str = "",
    ) -> BusinessContext:
        values = dict(inferred or {})
        values.pop("business_type", None)
        reviewed = {
            "category",
            "buyer_type",
            "market_scope",
            "primary_market",
            "language_code",
        }
        for field in cls.model_fields:
            # Onboarding never knows the business map; it starts empty.
            if field == "business_map":
                continue
            if field in reviewed or field not in values:
                values[field] = getattr(confirmed, field, None)
        values["buyer_type"] = confirmed.business_type
        values["primary_market"] = primary_market
        values["language_code"] = language_code
        values["field_sources"] = {
            key: "reviewed" if key in reviewed else "inferred"
            for key, value in values.items()
            if key in cls.model_fields
            and key != "field_sources"
            and value not in (None, "", [])
        }
        return cls.model_validate(values)

    @classmethod
    def from_project(cls, project: Project) -> BusinessContext:
        profile = getattr(getattr(project, "brand", None), "profile", None)
        context = cls.from_persisted(getattr(profile, "business_context", None))
        sources = dict(context.field_sources)
        profile_sources = getattr(profile, "sources", None) or {}
        for field in (
            "description",
            "positioning",
            "products_services",
            "target_audience",
        ):
            entry = profile_sources.get(field)
            if isinstance(entry, dict):
                sources[field] = (
                    "reviewed"
                    if entry.get("review_state") in {"confirmed", "edited"}
                    else "inferred"
                )
        return context.model_copy(
            update={
                "description": getattr(profile, "description", "") or "",
                "positioning": getattr(profile, "positioning", "") or "",
                "products_services": list(
                    getattr(profile, "products_services", None) or []
                ),
                "target_audience": getattr(profile, "target_audience", "") or "",
                "primary_market": (
                    getattr(project, "country_code", "")
                    or getattr(project, "primary_market", "")
                    or ""
                ),
                "language_code": getattr(project, "language_code", "") or "",
                "field_sources": sources,
            }
        )

    @classmethod
    def from_persisted(cls, value: object) -> BusinessContext:
        """Read older and public-API context without losing unrelated valid facts."""
        raw = dict(value) if isinstance(value, dict) else {}
        _normalize_legacy_buyer_type(raw)
        try:
            return cls.model_validate(raw)
        except ValidationError:
            valid: dict[str, Any] = {}
            for field, item in raw.items():
                if field not in cls.model_fields:
                    continue
                try:
                    cls.model_validate({field: item})
                except ValidationError:
                    continue
                valid[field] = item
            sources = valid.get("field_sources")
            if isinstance(sources, dict):
                valid["field_sources"] = {
                    field: source for field, source in sources.items() if field in valid
                }
            return cls.model_validate(valid)

    def persisted(self) -> dict[str, Any]:
        separate_columns = {
            "description",
            "positioning",
            "products_services",
            "target_audience",
            "primary_market",
            "language_code",
        }
        return self.model_dump(mode="json", exclude_none=True, exclude=separate_columns)

    def for_generation(self) -> dict[str, Any]:
        return self.model_dump(
            mode="json", exclude_none=True, exclude={"field_sources", "business_map"}
        )
