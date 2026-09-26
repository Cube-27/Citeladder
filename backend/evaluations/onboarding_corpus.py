"""Golden corpus of real businesses used to specify onboarding context quality.

This corpus is the *specification* for onboarding research, not a regression
fixture: the expected context and competitors were authored first, and the
pipeline is built backwards from them. Onboarding generates no prompts, so the
corpus carries no prompt expectations.

Facet coverage is deliberate.  Cases were chosen to span business model, market
scope, buyer type, company size and — critically — *model prior strength*, so
the corpus exercises both well-known brands and brands the model barely knows.

The corpus contains public, well-known brands only.  It is a quality gate for a
generated review payload, never a source of production facts.
"""

from __future__ import annotations

from dataclasses import dataclass

# Re-exported from the product's own config so the corpus can never expect a
# facet the pipeline cannot produce.  `core.config.brand_discovery` is the sole
# owner of these vocabularies.
from app.core.config.brand_discovery import (
    BUSINESS_MODELS,
    BUYER_REGISTERS,
    KNOWLEDGE_STRENGTHS,
    MARKET_SCOPES,
    SECTORS,
)
from app.core.config.brand_discovery import (
    BUSINESS_TYPES as BUYER_TYPES,
)

__all__ = [
    "BUSINESS_MODELS",
    "BUYER_REGISTERS",
    "BUYER_TYPES",
    "KNOWLEDGE_STRENGTHS",
    "MARKET_SCOPES",
    "SECTORS",
    "GoldenOnboardingCase",
]


@dataclass(frozen=True, slots=True)
class GoldenOnboardingCase:
    """Expected onboarding context and competitors for one real business."""

    slug: str
    brand_name: str
    primary_market: str
    website_url: str

    # --- expected context -------------------------------------------------
    sector: str
    category: str
    category_aliases: tuple[str, ...]
    business_model: str
    market_scope: str
    buyer_type: str
    knowledge_strength: str
    jobs_to_be_done: tuple[str, ...]
    category_terms: tuple[str, ...]
    expected_competitors: tuple[str, ...]

    buyer_register: str
