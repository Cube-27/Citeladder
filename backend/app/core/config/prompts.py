"""Shared prompt model defaults and normalization identity."""

from typing import Final

PROMPT_STATUS_ACTIVE: Final = "active"

DEFAULT_PROMPT_STATUS: Final = PROMPT_STATUS_ACTIVE

TOPIC_ORIGIN_MANUAL: Final = "manual"

CANDIDATE_DISPOSITION_PENDING: Final = "pending"

PROMPT_TRAILING_PUNCTUATION: Final = " \t\n\r\v\f?.!,;:"
