# Agentic-commerce vocabulary + gates (invariant 1).
#
# Owns EVERY deterministic commerce token the M2a analyzer v2 reads: the
# win-rate rule, the attribute-dimension catalog (+ its extraction window),
# the price-relation/merchant-kind vocabularies, the merchant domain map, the
# co-placement cap, the shopping-surface gate, and the evidence-kind/evidence-
# identity tokens. Domain, analysis, worker, and API code READS these; it
# never hard-codes the literals inline.
from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Final

# --- Win rate (§5.1) -------------------------------------------------------
# When True, the win-rate denominator is only the SKU's mention rows with a
# non-null rank_position: an execution that enumerates competitors without
# mentioning the SKU is not a loss (it is invisible to win rate).
PRODUCT_WIN_REQUIRES_ENUMERATION: Final = True

# --- Attribute dimensions (§5.3) -------------------------------------------
# Deterministic phrase-matched attribute mentions. Frequency only — valence
# is not deterministic and is deferred to the sentiment layer.
ATTRIBUTE_DIMENSION_GROUPS: Final[frozenset[str]] = frozenset(
    {"characteristics", "facts", "ratings"}
)

# Character window scanned for attribute phrases / destination URLs around a
# product mention's original-text offset (clipped to the mention's line).
PRODUCT_ATTRIBUTE_WINDOW_CHARS: Final = 200

# Bound on persisted competitor co-placement pairs per entry aggregate
# (O(mentions^2) per execution); ``truncated`` records when the cap is hit.
CO_PLACEMENT_MAX_PAIRS: Final = 1000


@dataclass(frozen=True)
class AttributeDimension:
    """One deterministic attribute dimension: casefolded whole-phrase literals."""

    key: str
    group: str  # characteristics | facts | ratings
    phrases: tuple[str, ...]


# Category-keyed seed catalog. The scorer always evaluates DEFAULT plus the
# category-specific tuple; unknown/empty categories evaluate DEFAULT only.
ATTRIBUTE_DIMENSIONS: Final[dict[str, tuple[AttributeDimension, ...]]] = {
    "DEFAULT": (
        AttributeDimension(
            key="price",
            group="facts",
            phrases=("price", "cost", "priced at", "sale price"),
        ),
        AttributeDimension(
            key="warranty",
            group="facts",
            phrases=("warranty", "guarantee", "coverage"),
        ),
        AttributeDimension(
            key="shipping",
            group="facts",
            phrases=("shipping", "delivery", "ships", "free shipping"),
        ),
        AttributeDimension(
            key="returns",
            group="facts",
            phrases=("returns", "return policy", "refund", "exchange"),
        ),
        AttributeDimension(
            key="materials",
            group="characteristics",
            phrases=("material", "materials", "made from", "made of", "fabric"),
        ),
        AttributeDimension(
            key="sizing",
            group="facts",
            phrases=("size", "sizes", "sizing", "size guide"),
        ),
    ),
    "footwear": (
        AttributeDimension(
            key="fit",
            group="ratings",
            phrases=("fit", "fits", "true to size", "runs small", "runs large"),
        ),
        AttributeDimension(
            key="comfort",
            group="ratings",
            phrases=("comfort", "comfortable", "cushioning", "cushioned"),
        ),
        AttributeDimension(
            key="support",
            group="characteristics",
            phrases=("arch support", "ankle support", "stability"),
        ),
        AttributeDimension(
            key="traction",
            group="characteristics",
            phrases=("traction", "grip", "outsole"),
        ),
        AttributeDimension(
            key="waterproofing",
            group="characteristics",
            phrases=("waterproof", "water resistant", "water-resistant"),
        ),
    ),
    "outerwear": (
        AttributeDimension(
            key="warmth",
            group="ratings",
            phrases=("warmth", "warm", "temperature rating"),
        ),
        AttributeDimension(
            key="insulation",
            group="characteristics",
            phrases=("insulation", "insulated", "down fill", "synthetic fill"),
        ),
        AttributeDimension(
            key="weather_protection",
            group="characteristics",
            phrases=(
                "waterproof",
                "water resistant",
                "water-resistant",
                "windproof",
                "wind resistant",
            ),
        ),
        AttributeDimension(
            key="breathability",
            group="ratings",
            phrases=("breathability", "breathable", "ventilation"),
        ),
        AttributeDimension(
            key="layering",
            group="facts",
            phrases=("layering", "layer", "midlayer", "shell"),
        ),
    ),
    "accessories": (
        AttributeDimension(
            key="compatibility",
            group="facts",
            phrases=("compatibility", "compatible with", "works with", "fits"),
        ),
        AttributeDimension(
            key="capacity",
            group="facts",
            phrases=("capacity", "volume", "litre", "liter"),
        ),
        AttributeDimension(
            key="dimensions",
            group="facts",
            phrases=("dimensions", "height", "width", "depth"),
        ),
        AttributeDimension(
            key="durability",
            group="ratings",
            phrases=("durability", "durable", "wear resistance"),
        ),
        AttributeDimension(
            key="weight",
            group="facts",
            phrases=("weight", "lightweight", "weighs"),
        ),
    ),
}

# --- Price relation (§5.2) --------------------------------------------------
PRICE_RELATION_MATCH: Final = "match"
PRICE_RELATION_HIGHER: Final = "higher"
PRICE_RELATION_LOWER: Final = "lower"
PRICE_RELATIONS: Final[frozenset[str]] = frozenset(
    {PRICE_RELATION_MATCH, PRICE_RELATION_HIGHER, PRICE_RELATION_LOWER}
)
# Legacy v1 boolean fallback label (projection-only; never persisted on a v2
# row): a v1 ``price_matches_catalog=False`` reads as ``mismatch`` with no
# direction available.
PRICE_RELATION_MISMATCH: Final = "mismatch"

# --- Merchant presence / buyer destination (§5.4) ---------------------------
MERCHANT_KIND_MARKETPLACE: Final = "marketplace"
MERCHANT_KIND_RETAILER: Final = "retailer"
MERCHANT_KIND_BRAND_SITE: Final = "brand_site"
MERCHANT_KIND_OTHER: Final = "other"
MERCHANT_KINDS: Final[frozenset[str]] = frozenset(
    {
        MERCHANT_KIND_MARKETPLACE,
        MERCHANT_KIND_RETAILER,
        MERCHANT_KIND_BRAND_SITE,
        MERCHANT_KIND_OTHER,
    }
)

# Known buyer destinations: normalized host -> (display name, kind). Matched
# suffix-safe via ``domain_matches`` so a subdomain of ``amazon.com`` is the
# Amazon marketplace but ``notamazon.com`` stays ``other``.
MERCHANT_DOMAINS: Final[dict[str, tuple[str, str]]] = {
    "amazon.com": ("Amazon", MERCHANT_KIND_MARKETPLACE),
    "ebay.com": ("eBay", MERCHANT_KIND_MARKETPLACE),
    "etsy.com": ("Etsy", MERCHANT_KIND_MARKETPLACE),
    "walmart.com": ("Walmart", MERCHANT_KIND_RETAILER),
    "target.com": ("Target", MERCHANT_KIND_RETAILER),
    "bestbuy.com": ("Best Buy", MERCHANT_KIND_RETAILER),
}

# --- Shopping-surface gate (§7, D2) -----------------------------------------
# Canonical measurement identity (the empty string): the answer-engine-API
# slot every shipped audit task/analysis carries. Used by models, filters,
# DTO defaults, and idempotency keys.
SHOPPING_SURFACE_MEASUREMENT: Final = ""
# The disabled probe gate. A future record maps surface id -> its frozen
# identity keys (``logical_engine``, ``transport_provider``,
# ``transport_model``); the planner then freezes one
# ``AuditShoppingSurfaceSnapshot`` per configured surface. No entries in M2a
# and ``APPROVED_ROUTES`` is unchanged, so no probe tasks/snapshots exist.
SHOPPING_SURFACES: Final[dict[str, dict[str, str]]] = {}

# --- Product evidence projection --------------------------------------------
# The three projected evidence kinds on ``GET /products/{id}/visibility/
# evidence`` (one base item per ProductMention, one per persisted attribute
# object, one per MerchantMention row).
PRODUCT_EVIDENCE_KIND_PRODUCT_MENTION: Final = "product_mention"
PRODUCT_EVIDENCE_KIND_ATTRIBUTE_MENTION: Final = "attribute_mention"
PRODUCT_EVIDENCE_KIND_BUYER_DESTINATION: Final = "buyer_destination"
PRODUCT_EVIDENCE_KINDS: Final[frozenset[str]] = frozenset(
    {
        PRODUCT_EVIDENCE_KIND_PRODUCT_MENTION,
        PRODUCT_EVIDENCE_KIND_ATTRIBUTE_MENTION,
        PRODUCT_EVIDENCE_KIND_BUYER_DESTINATION,
    }
)

# Fixed UUID5 namespace for projected attribute-evidence row identity: an
# attribute mention lives inside a ProductMention JSONB list (no table/PK), so
# its stable ``evidence_id`` is derived from
# ``{analysis_id}:{mention_id}:{dimension}:{offset}`` under this namespace.
PRODUCT_ATTRIBUTE_EVIDENCE_NAMESPACE: Final[uuid.UUID] = uuid.UUID(
    "73a01bbd-f974-58d4-a213-a178455bc018"
)
