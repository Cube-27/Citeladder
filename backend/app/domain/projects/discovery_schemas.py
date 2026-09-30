"""Typed contracts for persisted onboarding discovery."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator

from app.core.config.brand_discovery import (
    BUSINESS_MODELS,
    BUYER_REGISTERS,
    KNOWLEDGE_STRENGTHS,
    MARKET_SCOPES,
    PRICE_TIERS,
)
from app.core.config.brand_profile import (
    BRAND_PROFILE_PRODUCT_MAX_CHARS,
    BRAND_PROFILE_PRODUCTS_MAX_COUNT,
    BRAND_PROFILE_TEXT_MAX_CHARS,
)
from app.core.literals import lock_literal

PriceTier = Literal["budget", "mid_market", "premium", "luxury", "unknown"]
lock_literal(PriceTier, PRICE_TIERS, name="PriceTier")

# Business-context facets retained for Python Agent and Commerce consumers.
# The discovery HTTP and worker owners are TypeScript.
BusinessModel = Literal[
    "b2b_saas",
    "marketplace",
    "d2c_product",
    "retail",
    "local_service",
    "professional_service",
    "regulated_finance",
    "healthcare_provider",
    "education_provider",
]
MarketScope = Literal["global", "national", "regional", "local"]
KnowledgeStrength = Literal["strong", "weak", "none"]
BuyerRegister = Literal[
    "terse_transactional",
    "research_comparative",
    "advice_seeking",
    "local_urgent",
]
lock_literal(BusinessModel, BUSINESS_MODELS, name="BusinessModel")
lock_literal(MarketScope, MARKET_SCOPES, name="MarketScope")
lock_literal(KnowledgeStrength, KNOWLEDGE_STRENGTHS, name="KnowledgeStrength")
lock_literal(BuyerRegister, BUYER_REGISTERS, name="BuyerRegister")


class DiscoveryProfile(BaseModel):
    """The reviewable business context, wire-side.

    `category` and `category_terms` are open vocabulary and carry the real
    specificity -- they are what reaches prompt generation. The remaining facets
    are a closed vocabulary that routes archetype selection and buyer register.
    See `projects.business_context` for why a fixed industry tree cannot do
    this job.
    """

    description: str = ""
    positioning: str = ""
    products_services: list[str] = Field(default_factory=list)
    target_audience: str = ""
    industry: str = ""
    business_type: Literal["b2b", "b2c", "both"] | None = None
    price_tier: PriceTier = "unknown"
    field_confidence: dict[str, float] = Field(default_factory=dict)

    # --- resolved business context ---------------------------------------
    category: str = ""
    # Alternative phrasings of the same category, offered to the user as
    # choices. Onboarding is a confirmation step, not an authoring step: people
    # will pick the right label out of a list and will not write one.
    category_options: list[str] = Field(default_factory=list, max_length=5)
    category_aliases: list[str] = Field(default_factory=list)
    category_terms: list[str] = Field(default_factory=list)
    jobs_to_be_done: list[str] = Field(default_factory=list)
    sector: str | None = None
    business_model: BusinessModel | None = None
    # Real businesses are often composite: Urban Company is a marketplace AND a
    # local service, and the half a single enum discards is exactly the half
    # that drives a whole family of buyer queries ("plumber near me").
    secondary_business_models: list[BusinessModel] = Field(default_factory=list)
    market_scope: MarketScope | None = None
    buyer_register: BuyerRegister | None = None
    buyer_roles: list[str] = Field(default_factory=list)
    service_areas: list[str] = Field(default_factory=list)
    knowledge_strength: KnowledgeStrength = "none"


class PersistableDiscoveryProfile(DiscoveryProfile):
    """Discovery profile constrained to the downstream BrandProfile contract."""

    description: str = Field(default="", max_length=BRAND_PROFILE_TEXT_MAX_CHARS)
    positioning: str = Field(default="", max_length=BRAND_PROFILE_TEXT_MAX_CHARS)
    products_services: list[
        Annotated[str, Field(max_length=BRAND_PROFILE_PRODUCT_MAX_CHARS)]
    ] = Field(default_factory=list, max_length=BRAND_PROFILE_PRODUCTS_MAX_COUNT)
    target_audience: str = Field(default="", max_length=BRAND_PROFILE_TEXT_MAX_CHARS)


class ConfirmedDiscoveryProfile(PersistableDiscoveryProfile):
    """Reviewed category and optional inferred brand prose."""

    category: str = Field(min_length=1, max_length=160)

    @field_validator("category")
    @classmethod
    def require_category(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("category must not be blank")
        return value
