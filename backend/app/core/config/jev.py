# TypeSafe JEV (System One) configuration: prompt-candidate quality judgments.
#
# JEV answers bounded questions about generated prompt candidates. In PR 3b it
# runs in SHADOW mode: decisions are recorded on the candidate, rank the review
# list and flag weak rows, and never drop anything. A blank ``JEV_API_KEY``
# switches the judge off entirely. JEV is a new processor of customer data, so
# production keeps the key unset until the privacy/subprocessor revision is
# published (prompt generation v2, decision 10).
from __future__ import annotations

from typing import Final
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.config.dotenv import dotenv_sources

# Version of the question set below. Stored on every decision so a decision is
# only ever compared with decisions that asked the same questions.
JEV_QUESTION_SCHEMA_VERSION: Final = "prompt-quality-questions-1"
# Version of the shadow flagging thresholds (settings below). Stored on every
# decision; historical decisions are never re-flagged under a newer policy.
JEV_SHADOW_POLICY_VERSION: Final = "jev-shadow-1"

# ``Prompt generation quality_gate`` values reported by Generate.
QUALITY_GATE_OFF: Final = "off"
QUALITY_GATE_SHADOW: Final = "shadow"
QUALITY_GATE_UNAVAILABLE: Final = "unavailable"

# Yes/no questions. JEV never writes prompts, invents topics or checks facts
# code can check (length, names, duplicates by text); these are the semantic
# judgments code cannot make. Keys are for code only and are not sent as
# meaning, so each instruction is complete on its own.
JEV_NOUL_QUESTIONS: Final[dict[str, dict[str, object]]] = {
    "fits_business": {
        "instructions": (
            "Is `candidate.question` a question whose good answer could "
            "reasonably recommend or discuss a business like `business` -- "
            "within its category and offerings?"
        ),
        "criteria": {
            "true": "The question is about what this kind of business offers",
            "false": "The question is about something this business does not offer",
        },
    },
    "buyer_relevant": {
        "instructions": (
            "Would a real prospective buyer plausibly ask `candidate.question` "
            "while researching, comparing or choosing what to buy or hire?"
        ),
        "criteria": {
            "true": "A buyer with a real need would ask this",
            "false": "Only a marketer, SEO tool or insider would ask this",
        },
    },
    "natural": {
        "instructions": (
            "Does `candidate.question` read like something a person would "
            "type or say to an AI assistant?"
        ),
        "criteria": {
            "true": "Natural wording a person would use",
            "false": "Keyword stuffing, marketing copy or robotic phrasing",
        },
    },
    "standalone": {
        "instructions": (
            "Can `candidate.question` be understood and answered on its own, "
            "without missing context, placeholders or references to an earlier "
            "conversation?"
        ),
        "criteria": {
            "true": "Self-contained",
            "false": "Depends on context the reader does not have",
        },
    },
    "sensible": {
        "instructions": (
            "Is `candidate.question` coherent, combining needs, situations and "
            "constraints that make sense together?"
        ),
        "criteria": {
            "true": "Coherent and realistic",
            "false": "Contradictory, impossible or nonsensical",
        },
    },
}

# Choice descriptions for the labels generation already assigns. JEV's label
# is recorded next to the model's; the model's label stays on the row.
JEV_INTENT_INSTRUCTIONS: Final = (
    "What does the person asking `candidate.question` want from the answer?"
)
JEV_INTENT_DESCRIPTIONS: Final[dict[str, str]] = {
    "learn": "To understand a topic or how something works",
    "solve": "To fix or work around a specific problem",
    "compare": "To compare named options or approaches",
    "recommend": "To get a recommendation of what or whom to choose",
    "validate": "To check whether a specific option is good or right for them",
    "buy": "To find where or how to purchase or hire",
    "implement": "To use, set up or get more out of something already chosen",
}
JEV_STAGE_INSTRUCTIONS: Final = (
    "How far along a buying decision is the person asking `candidate.question`?"
)
JEV_STAGE_DESCRIPTIONS: Final[dict[str, str]] = {
    "awareness": "Exploring a need or problem, no options in mind yet",
    "consideration": "Weighing kinds of solutions or providers",
    "decision": "Choosing between specific options or ready to buy",
    "implementation": "Already chose and is using or setting it up",
}
JEV_DUPLICATE_INSTRUCTIONS: Final = (
    "Does `candidate.question` ask essentially the same thing as one of the "
    "numbered prompts, so that one AI answer would answer both? Choose that "
    "prompt, or `none` when every prompt asks something materially different."
)
JEV_DUPLICATE_NONE: Final = "none"
JEV_DUPLICATE_NONE_DESCRIPTION: Final = "No listed prompt asks the same thing"


class JevSettings(BaseSettings):
    """Env-overridable JEV knobs (``JEV_*``). A blank key means off."""

    model_config = SettingsConfigDict(
        env_prefix="JEV_",
        env_file=dotenv_sources(),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    api_key: SecretStr = Field(default=SecretStr(""))
    base_url: str = "https://api.typesafe.ai"
    model: str = "jev-latest"
    timeout_seconds: float = Field(default=10.0, gt=0, le=60)
    # Parallel decide() calls within one generation.
    concurrency: int = Field(default=4, ge=1, le=16)
    # Attempts per call, including the first; only 429/529/timeouts retry.
    max_attempts: int = Field(default=3, ge=1, le=5)
    backoff_seconds: float = Field(default=0.5, ge=0, le=10)
    # Upper bound on decide() calls one Generate request may make. Candidates
    # past the cap are staged without a decision.
    max_calls_per_generation: int = Field(default=100, ge=1, le=500)
    # Tracked/earlier prompts offered to the per-topic duplicate choice.
    duplicate_options_max: int = Field(default=20, ge=1, le=100)
    # Shadow flagging: a yes/no answer below this probability flags the row.
    flag_below: float = Field(default=0.35, ge=0, le=1)
    # A duplicate choice at or above this probability flags the row.
    duplicate_flag_at: float = Field(default=0.6, ge=0, le=1)

    @field_validator("base_url")
    @classmethod
    def _https_only(cls, value: str) -> str:
        parts = urlsplit(value)
        if parts.scheme != "https" or not parts.hostname:
            raise ValueError("JEV_BASE_URL must be an https URL")
        return value.rstrip("/")

    @property
    def enabled(self) -> bool:
        return bool(self.api_key.get_secret_value().strip())


jev_settings = JevSettings()
