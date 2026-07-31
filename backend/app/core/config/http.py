"""HTTP request and bulk-import safety limits (invariant 1)."""

from __future__ import annotations

from typing import Final

# Absolute ceiling for any API request body. Route-specific limits may be lower.
API_REQUEST_BODY_MAX_BYTES: Final = 2 * 1024 * 1024

# Prompt/product imports are intentionally smaller than the global ceiling.
IMPORT_BODY_MAX_BYTES: Final = 1 * 1024 * 1024
IMPORT_READ_CHUNK_BYTES: Final = 64 * 1024
IMPORT_MAX_COLUMNS: Final = 64
IMPORT_MAX_CELL_CHARS: Final = 8_192

PROMPT_IMPORT_MAX_ROWS: Final = 500
# DTO ceiling for prompt text on create/import/update. Kept consistent with
# the planner's frozen-prompt guardrail (``audit_settings.max_prompt_chars``,
# config/audits.py) — same bound, two owners on purpose: the DTO knob bounds
# what is WRITTEN; the planner knob bounds what may RUN (frozen snapshot).
PROMPT_TEXT_MAX_CHARS: Final = 300
PROMPT_INTENT_MAX_CHARS: Final = 64
