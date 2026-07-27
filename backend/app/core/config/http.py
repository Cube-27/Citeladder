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
PROMPT_TEXT_MAX_CHARS: Final = 4_000
PROMPT_INTENT_MAX_CHARS: Final = 64
