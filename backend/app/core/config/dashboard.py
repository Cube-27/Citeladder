"""AI Presence projection policy (config-owned; invariants 1, 7 and 9)."""

from __future__ import annotations

from typing import Final

AI_PRESENCE_FORMULA_VERSION: Final = "ai-presence-v1"
FORMULA_KIND_STANDARD: Final = "standard"
FORMULA_KIND_COMMERCE: Final = "commerce"

COMPONENT_BRAND_MENTION_RATE: Final = "brand_mention_rate"
COMPONENT_NORMALIZED_SOV: Final = "normalized_share_of_voice"
COMPONENT_OWNED_CITATION_RATE: Final = "owned_citation_rate"
COMPONENT_WEB_FUNDAMENTALS: Final = "web_fundamentals"
COMPONENT_BRAND_VISIBILITY: Final = "brand_visibility"
COMPONENT_PRODUCT_PRESENCE: Final = "product_presence"
COMPONENT_OPPORTUNITY_EXECUTION: Final = "opportunity_execution"

STANDARD_WEIGHTS: Final[dict[str, float]] = {
    COMPONENT_BRAND_MENTION_RATE: 0.30,
    COMPONENT_NORMALIZED_SOV: 0.20,
    COMPONENT_OWNED_CITATION_RATE: 0.20,
    COMPONENT_WEB_FUNDAMENTALS: 0.30,
}
COMMERCE_WEIGHTS: Final[dict[str, float]] = {
    COMPONENT_BRAND_VISIBILITY: 0.25,
    COMPONENT_PRODUCT_PRESENCE: 0.30,
    COMPONENT_WEB_FUNDAMENTALS: 0.20,
    COMPONENT_OWNED_CITATION_RATE: 0.15,
    COMPONENT_OPPORTUNITY_EXECUTION: 0.10,
}
BRAND_VISIBILITY_WEIGHTS: Final[dict[str, float]] = {
    COMPONENT_BRAND_MENTION_RATE: 0.60,
    COMPONENT_NORMALIZED_SOV: 0.40,
}
PRODUCT_PRESENCE_WEIGHTS: Final[dict[str, float]] = {
    "product_share_of_voice": 0.40,
    "product_prompt_mention_coverage": 0.25,
    "normalized_rank_performance": 0.20,
    "verifiable_price_accuracy": 0.15,
}

SCORE_SCALE: Final = 100.0
SCORE_ROUNDING_DECIMALS: Final = 2
MOMENTUM_WINDOW_DAYS: Final = 30
DASHBOARD_MAX_AI_PRESENCE_POINTS: Final = 100
# A catalog is only commerce-ready when at least this many own product snapshot
# rows contain immutable analysis provenance. This prevents zero-filled catalog
# rows from activating the commerce formula.
COMMERCE_MIN_PRODUCT_EVIDENCE_ROWS: Final = 1
