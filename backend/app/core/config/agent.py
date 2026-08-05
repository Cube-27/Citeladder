# Default-agent configuration (invariant 1: all config lives in core/config).
#
# The "default agent" is the app-level, env-configured general model that powers
# assisted features (prompt generation now; content generation later). It is
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

from urllib.parse import urlsplit

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.config import BASE_DIR, PROJECT_ROOT

STRUCTURED_OUTPUT_PROMPT_JSON = "prompt_json"
STRUCTURED_OUTPUT_JSON_SCHEMA = "json_schema"


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
        # Same .env chain as the main ``Settings`` so a repo-root key is found.
        env_file=(str(PROJECT_ROOT / ".env"), str(BASE_DIR / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    api_key: str = Field(
        default="",
        validation_alias=AliasChoices("DEFAULT_AGENT_API_KEY", "default_agent_api_key"),
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
        default=STRUCTURED_OUTPUT_PROMPT_JSON,
        validation_alias=AliasChoices(
            "DEFAULT_AGENT_STRUCTURED_OUTPUT_MODE",
            "default_agent_structured_output_mode",
        ),
        pattern="^(prompt_json|json_schema)$",
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
        validation_alias=AliasChoices(
            "DEFAULT_AGENT_MAX_OUTPUT_TOKENS", "default_agent_max_output_tokens"
        ),
    )

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
        return provider_key or self.api_key.strip()


default_agent_settings = DefaultAgentSettings()
