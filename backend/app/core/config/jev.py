# TypeSafe JEV (System One) configuration: prompt-candidate quality judgments.
#
# JEV answers bounded questions about generated prompt candidates. In GATE
# mode (the default) a strong fail is removed before review, an uncertain
# candidate is shown flagged and a strong pass is eligible; in SHADOW mode
# decisions only rank and flag the review list. A blank ``JEV_API_KEY``
# switches the judge off entirely. JEV is a new processor of customer data, so
# production keeps the key unset until the privacy/subprocessor revision is
# published (prompt generation v2, decision 10).
#
# The gate thresholds are PROVISIONAL: they were set before any production
# decisions existed and are recalibrated from user accept/reject outcomes
# (``scripts/jev_calibration.py``). Change a threshold together with
# ``JEV_POLICY_VERSION``; every decision records the version and thresholds it
# was judged under, and historical decisions are never re-judged.
from __future__ import annotations

from typing import Final, Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.config.dotenv import dotenv_sources

# Version of the question set below. Stored on every decision so a decision is
# only ever compared with decisions that asked the same questions.
JEV_QUESTION_SCHEMA_VERSION: Final = "prompt-quality-questions-2"
# Version of the flag and gate thresholds (settings below). Stored on every
# decision; a stored decision is never re-flagged under a newer policy.
JEV_POLICY_VERSION: Final = "jev-gate-1"

# JEV_MODE values.
JEV_MODE_GATE: Final = "gate"
JEV_MODE_SHADOW: Final = "shadow"

# ``Prompt generation quality_gate`` values reported by Generate: the judge
# is off, recorded decisions only (shadow), gated every candidate (gate), or
# failed for at least one candidate (unavailable; that candidate is kept).
QUALITY_GATE_OFF: Final = "off"
QUALITY_GATE_SHADOW: Final = JEV_MODE_SHADOW
QUALITY_GATE_GATE: Final = JEV_MODE_GATE
QUALITY_GATE_UNAVAILABLE: Final = "unavailable"

# Gate verdicts recorded on each decision.
JEV_VERDICT_PASS: Final = "pass"
JEV_VERDICT_UNCERTAIN: Final = "uncertain"
JEV_VERDICT_FAIL: Final = "fail"
# Flag for a decision missing an answer: never a pass, never a fail.
JEV_FLAG_INCOMPLETE: Final = "incomplete"

# Yes/no questions. JEV never writes prompts, invents topics or checks facts
# code can check (length, names, duplicates by text); these are the semantic
# judgments code cannot make. Keys are for code only and are not sent as
# meaning, so each instruction is complete on its own.
JEV_NOUL_QUESTIONS: Final[dict[str, dict[str, object]]] = {
    "decision_value": {
        "instructions": (
            "Does `candidate.question` express a meaningful buyer decision or "
            "selection need, beyond restating a product category and location? "
            "A question wrapper or words like best, online or stores alone do "
            "not add decision value. Concise requests can pass when a real "
            "problem, tradeoff, suitability need or purchasing constraint "
            "makes the answer useful. Do not require long or niche requests."
        ),
        "criteria": {
            "true": "A useful buying decision that could change the options chosen",
            "false": "A department label, category lookup or cosmetic variation",
        },
    },
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
    # Attempts per call, including the first; only 429/503/529/timeouts retry.
    max_attempts: int = Field(default=3, ge=1, le=5)
    backoff_seconds: float = Field(default=0.5, ge=0, le=10)
    # Upper bound on decide() calls one Generate request may make. Candidates
    # past the cap are staged without a decision.
    max_calls_per_generation: int = Field(default=100, ge=1, le=500)
    # Overall wall-clock bound on decisions for one generation/content job;
    # calls still running at the deadline are cancelled and reported as
    # unavailable, so a slow judge never holds a Generate request open.
    generation_deadline_seconds: float = Field(default=30.0, gt=0, le=120)
    # Tracked/earlier prompts offered to the per-topic duplicate choice.
    duplicate_options_max: int = Field(default=20, ge=1, le=100)
    # gate: strong fails are removed before review; shadow: record only.
    mode: Literal["gate", "shadow"] = JEV_MODE_GATE
    # A yes/no answer below this probability flags the row (uncertain).
    flag_below: float = Field(default=0.35, ge=0, le=1)
    # A duplicate choice at or above this probability flags the row.
    duplicate_flag_at: float = Field(default=0.6, ge=0, le=1)
    # Strong fail (gate): any yes/no answer below this probability, or a
    # duplicate choice at or above ``duplicate_fail_at``.
    fail_below: float = Field(default=0.15, ge=0, le=1)
    duplicate_fail_at: float = Field(default=0.85, ge=0, le=1)

    @field_validator("base_url")
    @classmethod
    def _https_only(cls, value: str) -> str:
        parts = urlsplit(value)
        if parts.scheme != "https" or not parts.hostname:
            raise ValueError("JEV_BASE_URL must be an https URL")
        return value.rstrip("/")

    @model_validator(mode="after")
    def _ordered_thresholds(self) -> JevSettings:
        if self.fail_below > self.flag_below:
            raise ValueError("JEV_FAIL_BELOW must not exceed JEV_FLAG_BELOW")
        if self.duplicate_fail_at < self.duplicate_flag_at:
            raise ValueError(
                "JEV_DUPLICATE_FAIL_AT must not be below JEV_DUPLICATE_FLAG_AT"
            )
        return self

    def thresholds(self) -> dict[str, float]:
        """The thresholds a decision is judged under (recorded with it)."""
        return {
            "flag_below": self.flag_below,
            "fail_below": self.fail_below,
            "duplicate_flag_at": self.duplicate_flag_at,
            "duplicate_fail_at": self.duplicate_fail_at,
        }

    @property
    def enabled(self) -> bool:
        return bool(self.api_key.get_secret_value().strip())


jev_settings = JevSettings()
