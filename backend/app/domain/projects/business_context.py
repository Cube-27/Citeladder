"""Canonical, persisted business facts shared by discovery and generation."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, Field

from app.domain.projects.discovery_schemas import (
    BusinessModel,
    BuyerRegister,
    DiscoveryProfile,
    KnowledgeStrength,
    MarketScope,
)

if TYPE_CHECKING:
    from app.models.project import Project


class BusinessContext(BaseModel):
    """Reviewed facts and nullable inferences; BrandProfile remains the store."""

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
    business_type: str | None = None
    price_tier: str | None = None
    knowledge_strength: KnowledgeStrength = "none"
    field_sources: dict[str, str] = Field(default_factory=dict)

    @classmethod
    def from_onboarding(
        cls,
        confirmed: DiscoveryProfile,
        inferred: dict[str, Any] | None = None,
    ) -> BusinessContext:
        values = dict(inferred or {})
        reviewed = {"category", "business_type", "market_scope"}
        for field in cls.model_fields:
            if field in reviewed or field not in values:
                values[field] = getattr(confirmed, field, None)
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
        return cls.model_validate(
            dict(getattr(profile, "business_context", None) or {})
        )

    def persisted(self) -> dict[str, Any]:
        return self.model_dump(mode="json", exclude_none=True)

    def for_generation(self) -> dict[str, Any]:
        return self.model_dump(
            mode="json", exclude_none=True, exclude={"field_sources"}
        )
