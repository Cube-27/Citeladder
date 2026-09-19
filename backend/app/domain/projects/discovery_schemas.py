"""Typed contracts for persisted onboarding discovery."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.config.brand_discovery import (
    BUSINESS_MODELS,
    BUYER_REGISTERS,
    DISCOVERY_CONFIRM_DOMAIN_MAX_CHARS,
    DISCOVERY_CONFIRM_MAX_DOMAINS,
    KNOWLEDGE_STRENGTHS,
    MARKET_SCOPES,
    PRICE_TIERS,
    brand_discovery_settings,
)
from app.core.config.brand_profile import (
    BRAND_PROFILE_PRODUCT_MAX_CHARS,
    BRAND_PROFILE_PRODUCTS_MAX_COUNT,
    BRAND_PROFILE_TEXT_MAX_CHARS,
)
from app.core.config.projects import MAX_PROJECT_COMPETITORS
from app.core.literals import lock_literal
from app.domain.projects.normalization import normalize_primary_market
from app.domain.projects.schemas import CompetitorInput

ConfirmedDomain = Annotated[
    str, Field(min_length=1, max_length=DISCOVERY_CONFIRM_DOMAIN_MAX_CHARS)
]
PriceTier = Literal["budget", "mid_market", "premium", "luxury", "unknown"]
lock_literal(PriceTier, PRICE_TIERS, name="PriceTier")

# Business-context facets. Declared here rather than in the onboarding package
# because `onboarding/__init__` pulls in the service, which imports this module.
# Each is locked to its config vocabulary so the two cannot drift.
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


class BrandDiscoveryCreate(BaseModel):
    brand_name: str = Field(min_length=1, max_length=255)
    website_url: str = Field(min_length=1, max_length=1024)
    industry: str = Field(default="General", max_length=255)
    subindustry: str = Field(default="", max_length=255)
    primary_market: str = Field(min_length=2, max_length=8)
    language_code: str = Field(default="en", max_length=16)

    _normalize_primary_market = field_validator("primary_market", mode="before")(
        normalize_primary_market
    )


class DiscoveryEvidence(BaseModel):
    source_url: str
    capture_method: str
    confidence: float = Field(ge=0, le=1)
    captured_at: datetime
    supports: list[str] = Field(default_factory=list)
    provider: str = ""
    model: str = ""
    method: str = ""


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


class DiscoveryCompetitorSuggestion(CompetitorInput):
    """Provisional identity, pending user selection and domain resolution."""


class DiscoveryTopic(BaseModel):
    """A canonical topic, persisted before any prompt references it.

    ``source_refs`` point at the offering-list entries or fetched pages that
    supported this topic, so a portfolio can always be traced back to what was
    actually read.
    """

    topic_id: uuid.UUID
    name: str = Field(min_length=1, max_length=255)
    description: str = Field(default="", max_length=1024)
    source_refs: list[str] = Field(min_length=1)


class DiscoveryPromptSuggestion(BaseModel):
    # Brand-diagnostic prompts deliberately span the whole brand rather than a
    # single topic. Older workers persisted that unbound state as an empty
    # string, so accept it at the read boundary and render the canonical null.
    topic_id: uuid.UUID | None
    text: str = Field(min_length=1, max_length=2000)
    intent: Literal["discovery", "comparison", "purchase", "service", "local"]
    cohort: Literal["core", "brand_diagnostic", "comparison"]

    @field_validator("topic_id", mode="before")
    @classmethod
    def normalize_unbound_topic(cls, value: object) -> object:
        return None if value == "" else value


class BrandDiscoveryProgress(BaseModel):
    phase: Literal[
        "opening_website",
        "understanding_business",
        "finding_competitors",
        "preparing_review",
        "complete",
    ]
    completed_steps: int = Field(ge=0)
    total_steps: int = Field(ge=1)
    pages_read: int = Field(default=0, ge=0)
    competitors_found: int = Field(default=0, ge=0)
    prompts_prepared: int = Field(default=0, ge=0)
    updated_at: datetime


class DiscoveryCompetitorCandidates(BaseModel):
    competitors: list[DiscoveryCompetitorSuggestion] = Field(
        default_factory=list,
        max_length=brand_discovery_settings.competitor_suggestion_maximum,
    )


class BrandDiscoveryComplete(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    profile: ConfirmedDiscoveryProfile
    domains: list[ConfirmedDomain] = Field(
        min_length=1, max_length=DISCOVERY_CONFIRM_MAX_DOMAINS
    )
    competitors: list[CompetitorInput] = Field(
        default_factory=list, max_length=MAX_PROJECT_COMPETITORS
    )


class BrandDiscoveryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workspace_id: uuid.UUID
    project_id: uuid.UUID | None
    status: str
    progress: BrandDiscoveryProgress
    input_data: dict
    profile: DiscoveryProfile
    domains: list[str]
    competitors: list[DiscoveryCompetitorSuggestion]
    topics: list[DiscoveryTopic]
    prompt_suggestions: list[DiscoveryPromptSuggestion]
    evidence: list[DiscoveryEvidence]
    warnings: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    error_code: str = ""
    created_at: datetime
    updated_at: datetime


class BrandDiscoveryCatalogResponse(BaseModel):
    business_types: list[str]
    price_tiers: list[str]
    required_fields: list[str]
    optional_fields: list[str]
    capture_methods: list[str]
    maximum_competitors: int
    industries: list[str]
    subindustries: dict[str, list[str]]
    prompt_cohorts: list[str]


class BrandDiscoveryCompleteResponse(BaseModel):
    """The accepted completion, which is a job -- not a finished project.

    ``project_id`` identifies the committed, immediately usable shell while
    ``status`` remains ``completing``. The worker fills its existing prompt set
    and then advances the discovery to ``project_created``.

    ``failed`` is the third terminal answer. It reports exhausted background
    generation honestly even though the previously committed shell can remain
    available through ``project_id``.
    """

    discovery_id: uuid.UUID
    status: Literal["completing", "project_created", "failed"]
    project_id: uuid.UUID | None = None
    crawl_id: uuid.UUID | None = None
    activation_state: Literal["queued"] = "queued"
    page_limit: int | None = None
    warnings: list[str] = Field(default_factory=list)
