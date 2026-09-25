# Default-agent configuration (invariant 1: all config lives in core/config).
#
# The "default agent" is the app-level, env-configured general model that powers
# assisted features: prompt generation and the platform-funded Agent. It is
# deliberately DISTINCT from:
#   * the three measurement engines (chatgpt/gemini/claude) — those are only
#     ever measured, never used for generation (roadmap non-goal), and
#   * the per-workspace BYOK ``ProviderConnection`` keys (invariant 6) — the
#     default-agent key is an application credential, not a customer secret.
# Like every credential, the key is never logged, never echoed into a DTO or
# request snapshot, and is passed only as a Bearer header at call time.
#
# The endpoint is OpenAI-compatible (``{base_url}/chat/completions``) so any
# compatible provider (NVIDIA, Mistral, OpenAI, Groq, a local gateway, ...) works by
# swapping env values.
from __future__ import annotations

from typing import TYPE_CHECKING, Final
from urllib.parse import urlsplit

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.config.dotenv import dotenv_sources
from app.core.config.task_queue import ERROR_MAX_ATTEMPTS, PostgresQueueSpec

if TYPE_CHECKING:
    # Type-only: config never imports a model at runtime (circular import).
    from app.models.agent import AgentRun

STRUCTURED_OUTPUT_AUTO = "auto"
STRUCTURED_OUTPUT_PROMPT_JSON = "prompt_json"
STRUCTURED_OUTPUT_JSON_OBJECT = "json_object"
STRUCTURED_OUTPUT_JSON_SCHEMA = "json_schema"

# =========================================================================
# Agent runtime policy (chats, runs, outputs)
# =========================================================================
# Stamped on every run so a turn names the runtime that produced it
# (invariant 5). Skill and registry versions are stamped separately.
AGENT_RUNTIME_VERSION: Final = "agent-runtime-1"
AGENT_PROTOCOL_VERSION: Final = "agent-protocol-1"

# One run is one agent turn: a bounded loop of structured model steps. A step
# either calls one read tool or responds. Every bound is frozen onto the run at
# admission, so a config change never alters a turn already queued.
AGENT_MAX_STEPS: Final = 8
AGENT_MAX_TOOL_CALLS: Final = 6
# A run's attempts at the whole turn (a lost lease or retryable provider error).
AGENT_RUN_MAX_ATTEMPTS: Final = 3
# Per-chat bound on user turns, so one conversation cannot grow without end.
AGENT_CHAT_TURN_LIMIT: Final = 60

# Context bounds (characters, after serialization).
AGENT_TOOL_RESULT_MAX_CHARS: Final = 12_000
AGENT_CONTEXT_PACKAGE_MAX_CHARS: Final = 24_000
AGENT_TRANSCRIPT_MAX_CHARS: Final = 90_000
AGENT_HISTORY_MAX_MESSAGES: Final = 12
AGENT_HISTORY_MESSAGE_MAX_CHARS: Final = 4_000

# Input and output bounds.
AGENT_MESSAGE_MAX_CHARS: Final = 8_000
AGENT_INSTRUCTIONS_MAX_CHARS: Final = 4_000
AGENT_OUTPUT_TITLE_MAX_CHARS: Final = 255
AGENT_OUTPUT_BODY_MAX_CHARS: Final = 100_000
# The chat reply is conversational; the deliverable belongs in the output.
AGENT_REPLY_MAX_CHARS: Final = 12_000
AGENT_CHAT_TITLE_MAX_CHARS: Final = 120
AGENT_IDEMPOTENCY_KEY_MAX_CHARS: Final = 128
AGENT_LIST_DEFAULT_LIMIT: Final = 30
AGENT_LIST_MAX_LIMIT: Final = 100
AGENT_REVISION_LIST_MAX: Final = 100
# Latest persisted differentiation reports one tool read returns.
AGENT_DIFFERENTIATION_REPORT_LIMIT: Final = 10

# Status vocabulary for one tool attempt. ``unavailable`` is a THIRD outcome,
# distinct from both a successful read and a failed one (invariant 7): the
# source did not exist, which is neither an error nor an observed zero.
TOOL_ATTEMPT_COMPLETED: Final = "completed"
TOOL_ATTEMPT_UNAVAILABLE: Final = "unavailable"
TOOL_ATTEMPT_FAILED: Final = "failed"
TOOL_ATTEMPT_REFUSED: Final = "refused"

# Chat message roles and output lifecycle.
MESSAGE_ROLE_USER: Final = "user"
MESSAGE_ROLE_AGENT: Final = "agent"
RUN_MODE_TURN: Final = "turn"
RUN_MODE_DRAFT_FROM_OUTLINE: Final = "draft_from_outline"
OUTPUT_PHASE_OUTLINE: Final = "outline"
OUTPUT_PHASE_DRAFT: Final = "draft"
OUTPUT_PHASE_FINAL: Final = "final"
REVISION_AUTHOR_AGENT: Final = "agent"
REVISION_AUTHOR_USER: Final = "user"

# How a turn's skill was chosen, in precedence order (explicit pick, the
# attached Action's diagnosis, the chat's previous skill, then the model).
SKILL_SOURCE_USER: Final = "user"
SKILL_SOURCE_ACTION: Final = "action"
SKILL_SOURCE_CHAT: Final = "chat"
SKILL_SOURCE_MODEL: Final = "model"

# Coded API failures.
CODE_AGENT_TURN_LIMIT: Final = "agent_turn_limit"
CODE_AGENT_RUN_ACTIVE: Final = "agent_run_active"
CODE_AGENT_FUNDING_UNAVAILABLE: Final = "agent_funding_unavailable"
CODE_AGENT_IDEMPOTENCY_CONFLICT: Final = "agent_idempotency_conflict"
CODE_AGENT_OUTLINE_NOT_APPROVABLE: Final = "agent_outline_not_approvable"
CODE_AGENT_SKILL_KIND_CONFLICT: Final = "agent_skill_kind_conflict"

# Terminal run error codes.
ERROR_STOPPED_AT_LIMIT: Final = "stopped_at_limit"
ERROR_PROTOCOL: Final = "protocol_violation"
ERROR_FUNDING: Final = "funding_unavailable"
ERROR_CAPABILITY: Final = "capability_unavailable"
ERROR_ROUTE_CHANGED: Final = "route_unavailable"
ERROR_PROVIDER: Final = "provider_error"
ERROR_TOOL: Final = "tool_failed"
# The member who queued the turn no longer holds the run permission.
ERROR_ACCESS_REVOKED: Final = "access_revoked"
# The output moved on from the revision the model read; nothing was saved.
ERROR_OUTPUT_CONFLICT: Final = "output_conflict"
# The platform model changed after admission; the turn must be resubmitted.
ERROR_MODEL_CHANGED: Final = "model_changed"


def _is_nvidia_host(host: str) -> bool:
    return host == "nvidia.com" or host.endswith(".nvidia.com")


def _is_provider_host(host: str, domain: str) -> bool:
    return host == domain or host.endswith(f".{domain}")


def _is_bedrock_host(host: str) -> bool:
    parts = host.split(".")
    return (
        len(parts) >= 4
        and parts[0] == "bedrock-runtime"
        and parts[-2:]
        == [
            "amazonaws",
            "com",
        ]
    )


def _first_provider_key(candidates: tuple[tuple[bool, str], ...]) -> str:
    for matches_host, key in candidates:
        if matches_host:
            normalized = key.strip()
            if normalized:
                return normalized
    return ""


class DefaultAgentSettings(BaseSettings):
    """Env-overridable default-agent knobs (``DEFAULT_AGENT_*``).

    Provider-specific aliases remain separate so an empty or stale alias cannot
    silently shadow the credential for the configured endpoint.
    """

    model_config = SettingsConfigDict(
        # Same .env chain as the main ``Settings`` so a repo-root key is found
        # — and the same test-run opt-out, so a developer's real provider key
        # can never make ``configured`` true inside the suite.
        env_file=dotenv_sources(),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    api_key: str = Field(
        default="",
        validation_alias=AliasChoices("DEFAULT_AGENT_API_KEY", "default_agent_api_key"),
    )
    adapter: str = Field(
        default="openai_compatible",
        validation_alias=AliasChoices("DEFAULT_AGENT_ADAPTER", "default_agent_adapter"),
        pattern="^(openai_compatible|openai_responses)$",
    )
    nvidia_api_key: str = Field(default="", validation_alias="NVIDIA_API_KEY")
    mistral_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("MISTRAL_API_KEY", "MISTRALAI_API_KEY"),
    )
    groq_api_key: str = Field(default="", validation_alias="GROQ_API_KEY")
    bedrock_bearer_token: str = Field(
        default="", validation_alias="AWS_BEARER_TOKEN_BEDROCK"
    )
    base_url: str = Field(
        default="",
        validation_alias=AliasChoices(
            "DEFAULT_AGENT_BASE_URL", "default_agent_base_url"
        ),
    )
    model: str = Field(
        default="",
        validation_alias=AliasChoices("DEFAULT_AGENT_MODEL", "default_agent_model"),
    )
    structured_output_mode: str = Field(
        default=STRUCTURED_OUTPUT_AUTO,
        validation_alias=AliasChoices(
            "DEFAULT_AGENT_STRUCTURED_OUTPUT_MODE",
            "default_agent_structured_output_mode",
        ),
        pattern="^(auto|prompt_json|json_object|json_schema)$",
    )
    # HTTP client timeout for a single agent call.
    timeout_seconds: float = Field(
        default=180.0,
        validation_alias=AliasChoices(
            "DEFAULT_AGENT_TIMEOUT_SECONDS", "default_agent_timeout_seconds"
        ),
    )
    # Per-call output cap so one generation cannot run away.
    max_output_tokens: int = Field(
        default=4096,
        gt=0,
        validation_alias=AliasChoices(
            "DEFAULT_AGENT_MAX_OUTPUT_TOKENS", "default_agent_max_output_tokens"
        ),
    )
    execution_timeout_seconds: float = Field(
        default=210.0,
        gt=0,
        validation_alias=AliasChoices(
            "DEFAULT_AGENT_EXECUTION_TIMEOUT_SECONDS",
            "default_agent_execution_timeout_seconds",
        ),
    )
    lease_margin_seconds: float = Field(
        default=30.0,
        gt=0,
        validation_alias=AliasChoices(
            "DEFAULT_AGENT_LEASE_MARGIN_SECONDS",
            "default_agent_lease_margin_seconds",
        ),
    )
    context_limit: int = Field(
        default=32_000,
        ge=1_024,
        validation_alias=AliasChoices(
            "DEFAULT_AGENT_CONTEXT_LIMIT", "default_agent_context_limit"
        ),
    )
    reconcile_poll_seconds: float = Field(
        default=2.0,
        gt=0,
        validation_alias=AliasChoices(
            "DEFAULT_AGENT_RECONCILE_POLL_SECONDS",
            "AGENT_RECONCILE_POLL_SECONDS",
            "agent_reconcile_poll_seconds",
        ),
    )
    retry_base_delay_seconds: float = Field(
        default=2.0,
        gt=0,
        validation_alias=AliasChoices(
            "DEFAULT_AGENT_RETRY_BASE_DELAY_SECONDS",
            "default_agent_retry_base_delay_seconds",
        ),
    )
    retry_max_delay_seconds: float = Field(
        default=45.0,
        gt=0,
        validation_alias=AliasChoices(
            "DEFAULT_AGENT_RETRY_MAX_DELAY_SECONDS",
            "default_agent_retry_max_delay_seconds",
        ),
    )

    def retry_delay(self, attempt_count: int) -> float:
        attempt = max(0, attempt_count - 1)
        return min(
            self.retry_base_delay_seconds * (2**attempt),
            self.retry_max_delay_seconds,
        )

    @property
    def resolved_structured_output_mode(self) -> str:
        if self.structured_output_mode != STRUCTURED_OUTPUT_AUTO:
            return self.structured_output_mode
        if self.adapter == "openai_responses":
            return STRUCTURED_OUTPUT_JSON_SCHEMA
        return STRUCTURED_OUTPUT_PROMPT_JSON

    @property
    def configured(self) -> bool:
        return all((self.base_url.strip(), self.model.strip(), self.resolved_api_key))

    @property
    def resolved_api_key(self) -> str:
        host = (urlsplit(self.base_url).hostname or "").casefold()
        provider_key = _first_provider_key(
            (
                (_is_nvidia_host(host), self.nvidia_api_key),
                (_is_provider_host(host, "mistral.ai"), self.mistral_api_key),
                (_is_provider_host(host, "groq.com"), self.groq_api_key),
                (_is_bedrock_host(host), self.bedrock_bearer_token),
            )
        )
        # DEFAULT_AGENT_* is the explicit application-model route. Provider
        # aliases are compatibility fallbacks only; a stale alias must not
        # shadow a deliberately rotated default-agent credential.
        return self.api_key.strip() or provider_key


default_agent_settings = DefaultAgentSettings()

# Worker cadence. A turn is several model calls, so the lease is renewed by a
# heartbeat for as long as the turn runs; one call can never outlive it.
AGENT_WORKER_POLL_SECONDS: Final = 1.0
AGENT_HEARTBEAT_SECONDS: Final = 20.0


def _agent_run_model() -> type[AgentRun]:
    from app.models.agent import AgentRun

    return AgentRun


def _agent_claim_order(model: type[AgentRun]) -> tuple:
    return (
        model.priority.desc(),
        model.available_at.asc(),
        model.randomized_position.asc(),
    )


AGENT_QUEUE_SPEC: Final[PostgresQueueSpec[AgentRun]] = PostgresQueueSpec(
    model_ref=_agent_run_model,
    lease_ttl=lambda: (
        default_agent_settings.execution_timeout_seconds
        + default_agent_settings.lease_margin_seconds
    ),
    claim_order=_agent_claim_order,
    max_attempts_error=ERROR_MAX_ATTEMPTS,
)
