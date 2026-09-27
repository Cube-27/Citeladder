"""The chat-completions output cap, whose parameter name splits providers.

Current OpenAI models reject ``max_tokens``; Mistral and some gateways accept
only it. Callers send ``max_completion_tokens`` first and retry once with the
legacy name only when the provider's rejection names the parameter it refused.
"""

from __future__ import annotations

OUTPUT_CAP_PARAM = "max_completion_tokens"
LEGACY_OUTPUT_CAP_PARAM = "max_tokens"
_REJECTION_STATUSES = frozenset({400, 422})


def rejects_output_cap(status_code: int, body: str | bytes) -> bool:
    """Whether a client error names the current output-cap parameter."""
    if status_code not in _REJECTION_STATUSES:
        return False
    if isinstance(body, bytes):
        return OUTPUT_CAP_PARAM.encode() in body
    return OUTPUT_CAP_PARAM in body
