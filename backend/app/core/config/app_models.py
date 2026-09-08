"""Bounded customer app-model routing and transport policy."""

from typing import Final

APP_FEATURE_CONTENT: Final = "content"
APP_FEATURE_GROWTH_AGENT: Final = "growth_agent"
APP_FEATURES: Final = frozenset({APP_FEATURE_CONTENT, APP_FEATURE_GROWTH_AGENT})
APP_PROTOCOL_OPENAI_CHAT: Final = "openai_chat"
APP_MODEL_ALLOWED_PORTS: Final = frozenset({443})
APP_MODEL_MAX_REQUEST_BYTES: Final = 256_000
APP_MODEL_MAX_RESPONSE_BYTES: Final = 512_000
APP_MODEL_TIMEOUT_SECONDS: Final = 60.0
APP_MODEL_PROBE_TIMEOUT_SECONDS: Final = 10.0
APP_MODEL_PROBE_MAX_OUTPUT_TOKENS: Final = 4
APP_MODEL_PROBE_PROMPT: Final = (
    "Reply with OK. This is a customer-charged connection test."
)
APP_MODEL_SUCCESS_DETAIL: Final = "Connection succeeded"
