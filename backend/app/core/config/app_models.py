"""Bounded customer app-model routing and transport policy."""

from typing import Final

# The Agent is the one application model feature: its customer route and its
# published credit rate are both keyed on this identifier.
APP_FEATURE_AGENT: Final = "agent"
APP_MODEL_DISCLOSURE_REVISION: Final = "1"
APP_FEATURES: Final = frozenset({APP_FEATURE_AGENT})
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
