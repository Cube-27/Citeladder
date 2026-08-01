# Deterministic analysis + scoring configuration (invariant 1).
#
# Owns every tunable knob the B6 analysis/scoring pipeline reads: the
# ``analyzer_version`` + scoring-rule version stamped on every derived row
# (invariant 4), the ambiguous-alias guard list, and the public paid-list
# pricing constants used for the cost estimate. Analysis, scoring, and the
# finalize path READ these; they never hard-code the literals inline. Ported
# from the reference ``config/ai_visibility.py``.
from __future__ import annotations

from typing import Final

from app.core.config.provider_catalog import (
    ENGINE_GEMINI,
    TRANSPORT_GOOGLE,
    default_model,
)

# --- Provenance versions (invariant 4) -----------------------------------
# Bumped whenever the deterministic scoring/aggregation logic changes so a
# derived row can always be traced to the exact rules that produced it. Stamped
# onto ``ResponseAnalysis`` / ``BrandMention`` / ``CompetitorMention`` /
# ``Citation`` / ``MetricSnapshot`` and the parent ``Audit`` at finalize.
ANALYZER_VERSION: Final = "b6-analysis-1"
# The per-execution/aggregate formula version (separate from the analyzer so a
# formula-only change can be tracked independently of an extraction change).
SCORING_RULE_VERSION: Final = "scoring-v1"

# --- Cross-run Visibility trend projection (roadmap: visibility-trends) ----
# The trends endpoint is a pure PROJECTION over the already-persisted per-run
# ``MetricSnapshot`` rows (invariant 7): it introduces NO new version constant
# (each point is stamped with the ``analyzer_version`` / ``scoring_rule_version``
# its source snapshot already carries, invariant 2/4). These knobs only tune
# how that projection is windowed and bucketed.
#
# Allowed ``granularity`` values: ``run`` returns one point per persisted
# snapshot; ``week`` / ``month`` fold snapshots into deterministic UTC buckets.
VISIBILITY_TREND_GRANULARITIES: Final[frozenset[str]] = frozenset(
    {"run", "week", "month"}
)
# Default when the request omits ``granularity``.
VISIBILITY_TREND_DEFAULT_GRANULARITY: Final = "run"
# Cap on the number of newest source snapshots a single request considers (the
# final response is still returned in chronological order).
VISIBILITY_TREND_MAX_POINTS: Final = 100
# When True, a requested week/month bucket that would fold snapshots produced
# under different analyzer/scoring versions is NOT emitted; the whole selected
# range falls back to raw per-run points so no bucket ever mixes versions.
# When False, such a bucket is emitted but flagged ``spans_version_boundary``
# with every contributing version listed.
VISIBILITY_TRENDS_STRICT_VERSION_BUCKETS: Final = True

# --- Execution-evidence projection (roadmap: visibility Mentions & Fanout) -
# The evidence endpoint is a pure READ-ONLY projection over already-persisted
# per-execution rows (``ResponseAnalysis`` + its mention/citation children +
# the frozen ``AuditTask``/immutable ``RawResponseArtifact`` search events). It
# introduces NO new version constant and NEVER calls a provider (invariant 7):
# every row already carries the analyzer/scoring versions its source persisted.
# These knobs only bound how many newest executions a single request returns.
#
# Default page size when the request omits ``limit``.
VISIBILITY_EVIDENCE_DEFAULT_LIMIT: Final = 100
# Hard cap on the ``limit`` a single request may ask for (422 above this).
VISIBILITY_EVIDENCE_MAX_LIMIT: Final = 500

# --- Ambiguous alias guard -----------------------------------------------
# Aliases that are also common English words; a bare occurrence is only counted
# as a retailer mention when disambiguated (e.g. "Target Australia" or a proper
# noun that is not an obvious semantic use). Ported verbatim.
AMBIGUOUS_ALIASES: Final[frozenset[str]] = frozenset({"target"})

# --- Cost estimate pricing (public paid-list, USD) -----------------------
# Gemini 2.5 Flash public list prices used for the paid-list token/grounding
# estimate. Estimates only — actual spend may be zero within free allowances.
GEMINI_25_FLASH_INPUT_PER_MILLION_USD: Final = 0.30
GEMINI_25_FLASH_OUTPUT_PER_MILLION_USD: Final = 2.50
GEMINI_25_GROUNDED_PROMPT_USD: Final = 0.035

# Gemini 2.5 Flash-LITE public list prices — a SEPARATE, cheaper card than
# Flash above (3x cheaper in, 6.25x cheaper out). Kept distinct because the
# active Gemini route is Flash-Lite: folding it into the Flash aliases would
# overstate every projected Gemini cost.
GEMINI_25_FLASH_LITE_INPUT_PER_MILLION_USD: Final = 0.10
GEMINI_25_FLASH_LITE_OUTPUT_PER_MILLION_USD: Final = 0.40

# Query fanout classification rules.  These are deliberately transparent and
# version-independent: changing a keyword changes persisted scoring output and
# therefore belongs to the analysis configuration owner.
FANOUT_FEATURE_RULES: Final[dict[str, tuple[str, ...]]] = {
    "community": ("reddit", "forum", "discussion", "experiences"),
    "review": ("review", "reviews", "rating", "ratings", "customer feedback"),
    "comparison": ("vs", "versus", "alternative", "alternatives", "compare", "best"),
    "commercial": ("price", "prices", "cheap", "affordable", "budget", "sale", "under"),
    "local": ("near me", "nearby", "store", "sydney", "melbourne", "brisbane", "perth"),
    "service": ("click and collect", "delivery", "returns", "shipping"),
    "freshness": ("latest", "current", "today", "2026"),
    "product_evidence": (
        "material",
        "fabric",
        "size",
        "multipack",
        "availability",
        "stock",
    ),
}

# Historical Gemini model names that share the public Gemini 2.5 Flash price
# card.  The active route is owned by provider_catalog; this set only covers
# cost projection for persisted executions using an older alias.
#
# ``default_model(...)`` is deliberately NOT a member: the active route is now
# Flash-Lite, which has its own (much cheaper) card below. Including it here
# priced every Flash-Lite execution at Flash rates.
GEMINI_FLASH_PRICING_MODEL_ALIASES: Final[frozenset[str]] = frozenset(
    {"gemini-2.5-flash", "gemini-flash-latest"}
)
# Model names on the Flash-Lite card, including the active route's model.
GEMINI_FLASH_LITE_PRICING_MODEL_ALIASES: Final[frozenset[str]] = frozenset(
    {"gemini-2.5-flash-lite", default_model(ENGINE_GEMINI, TRANSPORT_GOOGLE)}
)
TOKENS_PER_MILLION: Final = 1_000_000


def uses_gemini_flash_pricing(provider: str, model: str) -> bool:
    """Return whether an execution uses the Gemini 2.5 Flash estimate card."""
    return provider == ENGINE_GEMINI and model in GEMINI_FLASH_PRICING_MODEL_ALIASES


def uses_gemini_flash_lite_pricing(provider: str, model: str) -> bool:
    """Return whether an execution uses the Gemini 2.5 Flash-Lite card."""
    return (
        provider == ENGINE_GEMINI
        and model in GEMINI_FLASH_LITE_PRICING_MODEL_ALIASES
    )
