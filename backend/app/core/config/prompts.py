# Prompt-generation configuration (invariant 1: all config lives here).
#
# Owns the knobs, enumerations, and the system-prompt template for the
# AI-assisted prompt/topic generation surface (flips the ``/generate`` 501
# stub). Domain and API code READ these values; they never hard-code the
# literals inline. The generation model itself is the app-level default agent
# (``config/agent.py``) — never a measurement engine.
from __future__ import annotations

from typing import Final

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# --- Prompt review status --------------------------------------------------
# Lifecycle of a prompt in the library. Generated suggestions land as
# ``proposed`` and are audit-INELIGIBLE until a human accepts them (the
# roadmap's "no auto-run" rule); ``archived`` keeps history without deleting.
PROMPT_STATUS_PROPOSED: Final = "proposed"
PROMPT_STATUS_ACTIVE: Final = "active"
PROMPT_STATUS_ARCHIVED: Final = "archived"
PROMPT_STATUSES: Final[frozenset[str]] = frozenset(
    {PROMPT_STATUS_PROPOSED, PROMPT_STATUS_ACTIVE, PROMPT_STATUS_ARCHIVED}
)
DEFAULT_PROMPT_STATUS: Final = PROMPT_STATUS_ACTIVE

PROMPT_COHORT_CORE: Final = "core"
PROMPT_COHORT_COMPARISON: Final = "comparison"
PROMPT_COHORTS: Final[frozenset[str]] = frozenset(
    {PROMPT_COHORT_CORE, PROMPT_COHORT_COMPARISON}
)
PROMPT_NEAR_DUPLICATE_SIMILARITY: Final = 0.9
ONBOARDING_PROMPT_SET_NAME: Final = "AI Visibility"
ONBOARDING_CORE_TEMPLATES: Final[tuple[tuple[str, str], ...]] = (
    ("What are the best {topic} options for {audience}?", "discovery"),
    ("How should I compare {topic} providers?", "comparison"),
    ("What should I look for when choosing {topic}?", "purchase"),
)
ONBOARDING_COMPARISON_TEMPLATE: Final = (
    "How does {brand} compare with {competitor} for {topic}?"
)

# --- Topic origin ----------------------------------------------------------
TOPIC_ORIGIN_MANUAL: Final = "manual"
TOPIC_ORIGIN_GENERATED: Final = "generated"
TOPIC_ORIGINS: Final[frozenset[str]] = frozenset(
    {TOPIC_ORIGIN_MANUAL, TOPIC_ORIGIN_GENERATED}
)

# --- Generation pipeline version (stamped into generation_evidence) --------
GENERATOR_VERSION: Final = "prompt-gen-v4"

# --- Topical binding (project-identity prompt admission) -------------------
# Outcome codes for ``BindingResult`` / the coded API errors built from it.
BINDING_CODE_ACCEPTED: Final = "accepted"
CODE_PROMPT_OFF_TOPIC: Final = "prompt_off_topic"
CODE_BINDING_VOCABULARY_EMPTY: Final = "binding_vocabulary_empty"

# Minimum length of a normalized token eligible for binding (both sides:
# vocabulary build AND prompt text). Shorter tokens (digits, TLD fragments)
# never admit a prompt on their own.
TOPICAL_BINDING_MIN_TOKEN_CHARS: Final = 3

# Generic English function/question/commerce words plus legal-suffix and
# host-label noise excluded from BOTH sides of the binding match, so a prompt
# can never pass on generic wording alone. One owner (invariant 1);
# ``domain/prompts/topical_binding.py`` reads it, nothing re-lists these.
TOPICAL_BINDING_STOPWORDS: Final[frozenset[str]] = frozenset(
    {
        # Function words.
        "a",
        "an",
        "the",
        "and",
        "or",
        "but",
        "if",
        "then",
        "so",
        "than",
        "as",
        "of",
        "in",
        "on",
        "at",
        "to",
        "for",
        "from",
        "by",
        "with",
        "about",
        "into",
        "over",
        "under",
        "after",
        "before",
        "between",
        "through",
        "during",
        "without",
        "within",
        "per",
        "via",
        "nor",
        "off",
        "up",
        "down",
        "out",
        "again",
        "once",
        "too",
        "very",
        "just",
        "not",
        "no",
        "any",
        "all",
        "both",
        "each",
        "few",
        "more",
        "most",
        "other",
        "some",
        "such",
        "own",
        "same",
        # Pronouns + question words.
        "i",
        "me",
        "my",
        "we",
        "our",
        "you",
        "your",
        "he",
        "him",
        "his",
        "she",
        "her",
        "it",
        "its",
        "they",
        "them",
        "their",
        "this",
        "that",
        "these",
        "those",
        "who",
        "whom",
        "whose",
        "which",
        "what",
        "when",
        "where",
        "why",
        "how",
        # Auxiliaries + generic verbs.
        "is",
        "am",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "have",
        "has",
        "had",
        "having",
        "do",
        "does",
        "did",
        "doing",
        "can",
        "could",
        "will",
        "would",
        "shall",
        "should",
        "may",
        "might",
        "must",
        "ought",
        "get",
        "gets",
        "got",
        "make",
        "makes",
        "made",
        "use",
        "used",
        "using",
        "work",
        "works",
        "need",
        "needs",
        "want",
        "wants",
        # Generic commerce/question filler.
        "best",
        "top",
        "good",
        "better",
        "new",
        "latest",
        "cheap",
        "cheapest",
        "buy",
        "buying",
        "shop",
        "shopping",
        "store",
        "online",
        "price",
        "prices",
        "pricing",
        "cost",
        "costs",
        "deal",
        "deals",
        "review",
        "reviews",
        "guide",
        "compare",
        "comparison",
        "vs",
        "versus",
        "near",
        "option",
        "options",
        "brand",
        "brands",
        "product",
        "products",
        "number",
        # Legal-suffix + host-label noise.
        "inc",
        "llc",
        "ltd",
        "corp",
        "corporation",
        "company",
        "co",
        "gmbh",
        "www",
        "com",
        "net",
        "org",
        "io",
        "app",
        "dev",
    }
)

# --- System prompt ---------------------------------------------------------
# Neutral instruction for the default agent. The brand context is supplied in
# the *user* message by the request builder; the response contract is strict
# JSON so the parser stays deterministic and unit-testable.
_GENERATION_PROMPT_PREAMBLE: Final = (
    "You are an AEO (answer-engine optimization) research assistant. Given a "
    "brand's context, you propose realistic consumer searches a person "
    "might ask an AI assistant, organized under topical categories.\n"
    "Rules:\n"
    "- Prompts must be concise, standalone consumer questions or requests, not "
    "marketing copy, keyword lists, or research instructions.\n"
)
_GENERATION_SHARED_RULES: Final = (
    "- Reuse an existing topic name verbatim when a prompt fits it; only "
    "invent a new topic when none fits.\n"
    "- Ground every prompt in the supplied brand knowledge, market, products, "
    "audience, or an existing topic description. Do not invent products, "
    "services, locations, audience segments, or claims absent from that "
    "context.\n"
    "- Keep prompts specific to the brand's real competitive segment and "
    "customer needs; avoid generic category prompts that could describe an "
    "unrelated price tier or audience.\n"
    "- Use specific product/service categories or customer needs as topic names. "
    "Do not use generic funnel-stage topics such as Product Selection, Pricing, "
    "Returns, or Local Availability when a more concrete subject is known.\n"
    "- Never make a complete search awkward by appending a redundant market, "
    "audience, or use-case clause. The rigid fallback standard also applies here: "
    "every generated row must sound like something a real user would type.\n"
    "- Never duplicate any of the existing prompts you are shown.\n"
    "- Each prompt's intent must be one of: discovery, comparison, purchase, "
    "service, local.\n"
    'Respond with ONLY a JSON object of the shape: {"topics": [{"name": str, '
    '"prompts": [{"text": str, "intent": str}]}]}. No prose, no markdown.'
)
GENERATION_SYSTEM_PROMPT: Final = (
    _GENERATION_PROMPT_PREAMBLE
    + "- Generate only UNBRANDED core discovery queries. A prompt must never "
    "contain the tracked brand, any alias, a competitor, or competitor alias. "
    "Topic names must exclude those tracked names too. Named comparisons are "
    "generated through a separate cohort.\n"
    "- Split the requested batch as evenly as possible: one half should be "
    "brand-relevant searches grounded in the tracked brand's verified offerings, "
    "audience, positioning, or use cases; the other half should be broader searches "
    "for the surrounding industry or competitive category. Both halves remain "
    "fully unbranded.\n" + _GENERATION_SHARED_RULES
)
GENERATION_COMPARISON_SYSTEM_PROMPT: Final = (
    _GENERATION_PROMPT_PREAMBLE
    + "- Generate named head-to-head comparisons only. Every prompt must name "
    "the tracked brand and at least one confirmed competitor and use the "
    "comparison intent.\n" + _GENERATION_SHARED_RULES
)


class PromptGenerationSettings(BaseSettings):
    """Env-overridable generation knobs (``GENERATION_*``).

    ``max_count`` stands in for the future subscription-tier limit; keep it in
    env until billing tiers exist.
    """

    model_config = SettingsConfigDict(extra="ignore")

    # ``ge=1`` floors mirror ``PromptGenerateRequest.count``'s ``ge=1``: a
    # zero/negative env override would otherwise produce an unrequestable
    # default or an always-rejecting cap, so fail at settings construction.
    default_count: int = Field(
        default=10,
        ge=1,
        validation_alias=AliasChoices(
            "GENERATION_DEFAULT_COUNT", "generation_default_count"
        ),
    )
    max_count: int = Field(
        default=20,
        ge=1,
        validation_alias=AliasChoices("GENERATION_MAX_COUNT", "generation_max_count"),
    )
    # Set-wide pool of prompts that are ``active`` (audit/scheduled-run
    # eligible across all three AI providers). Generation promotes the
    # earliest newly-inserted prompts to fill this pool; anything beyond it
    # stays ``proposed`` until a human promotes it. Existing manual/active
    # rows count toward the pool; archived rows are never auto-reactivated.
    active_threshold: int = Field(
        default=20,
        ge=1,
        validation_alias=AliasChoices(
            "GENERATION_ACTIVE_THRESHOLD", "generation_active_threshold"
        ),
    )
    # Upper bound on how many existing prompt texts are sent to the model as
    # "do not duplicate" context, so the user message can't grow unbounded as
    # a set accumulates prompts. Must be >= 0: a negative env override would
    # silently reverse the slice (``[:negative]`` drops from the tail), so
    # reject it at construction. Zero is valid — it sends no existing prompts.
    existing_prompt_context_limit: int = Field(
        default=200,
        ge=0,
        validation_alias=AliasChoices(
            "GENERATION_EXISTING_PROMPT_CONTEXT_LIMIT",
            "generation_existing_prompt_context_limit",
        ),
    )
    # Cap on the share of the ACTIVE pool that may be branded prompts (brand,
    # alias, or competitor name in the text — the deterministic ``branded``
    # flag). A branded prompt trivially guarantees a brand mention, so an
    # active pool dominated by them inflates the Visibility Score toward 100%.
    # Auto-activation never exceeds this share; a human can still promote
    # branded prompts past it deliberately. 0 disables auto-activating any
    # branded prompt; 1 disables the cap.
    max_branded_active_share: float = Field(
        default=0.2,
        ge=0.0,
        le=1.0,
        validation_alias=AliasChoices(
            "GENERATION_MAX_BRANDED_ACTIVE_SHARE",
            "generation_max_branded_active_share",
        ),
    )


prompt_generation_settings = PromptGenerationSettings()
