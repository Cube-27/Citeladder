# CSV parsing for prompt bulk-import.
#
# The import endpoint accepts either already-parsed JSON rows (what the browser
# posts after its own preview, ``frontend/lib/prompts/csv.ts``) OR a raw CSV
# upload. This helper turns raw CSV text into ``PromptImportRow`` rows so both
# paths converge on the same create logic and the same ``topic,prompt`` contract.
from __future__ import annotations

import csv
import io
from collections.abc import Iterable

from app.core.config.http import (
    IMPORT_MAX_CELL_CHARS,
    IMPORT_MAX_COLUMNS,
    PROMPT_IMPORT_MAX_ROWS,
    PROMPT_INTENT_MAX_CHARS,
    PROMPT_THEME_MAX_CHARS,
)
from app.domain.prompts.schemas import PromptImportRow

# Accepted header aliases -> canonical field. Case/space-insensitive. Users
# supply only ``topic`` and ``prompt``; the other columns are optional internal
# vocabulary that is clipped or defaulted, never rejected.
_TEXT_KEYS = {"prompt", "text", "query", "question"}
_TOPIC_KEYS = {"topic", "category"}
_THEME_KEYS = {"theme"}
_INTENT_KEYS = {"intent"}
_COHORT_KEYS = {"cohort"}
_ENABLED_KEYS = {"enabled", "is_enabled", "active"}

_TRUTHY = {"1", "true", "yes", "y", "t"}


def _as_bool(value: str | None, *, default: bool) -> bool:
    if value is None:
        return default
    token = value.strip().lower()
    if not token:
        return default
    return token in _TRUTHY


def _cohort(value: str | None) -> str:
    return "comparison" if (value or "").strip().lower() == "comparison" else "core"


def _read_prompt_rows(content: str) -> list[list[str]]:
    text = content.lstrip("\ufeff")
    if not text.strip():
        return []
    rows: list[list[str]] = []
    for row in csv.reader(io.StringIO(text)):
        if len(row) > IMPORT_MAX_COLUMNS:
            raise ValueError("Prompt CSV has too many columns")
        if any(len(cell) > IMPORT_MAX_CELL_CHARS for cell in row):
            raise ValueError("Prompt CSV cell is too long")
        if any(cell.strip() for cell in row):
            rows.append(row)
            if len(rows) > PROMPT_IMPORT_MAX_ROWS + 1:
                raise ValueError("Prompt CSV has too many rows")
    return rows


def _column_index(header: list[str], keys: Iterable[str]) -> int | None:
    accepted = set(keys)
    for index, name in enumerate(header):
        if name in accepted:
            return index
    return None


def _prompt_column_indices(header: list[str]) -> dict[str, int | None]:
    return {
        "text": _column_index(header, _TEXT_KEYS),
        "topic": _column_index(header, _TOPIC_KEYS),
        "theme": _column_index(header, _THEME_KEYS),
        "intent": _column_index(header, _INTENT_KEYS),
        "cohort": _column_index(header, _COHORT_KEYS),
        "enabled": _column_index(header, _ENABLED_KEYS),
    }


def _prompt_cell(row: list[str], index: int | None) -> str | None:
    if index is None or index >= len(row):
        return None
    return row[index]


def _optional_cell(row: list[str], index: int | None, max_chars: int) -> str:
    """An internal column's value, clipped to its width instead of rejected."""
    return (_prompt_cell(row, index) or "").strip()[:max_chars]


def _parse_prompt_row(
    row: list[str], columns: dict[str, int | None]
) -> PromptImportRow | None:
    raw_text = (_prompt_cell(row, columns["text"]) or "").strip()
    if not raw_text:
        return None
    return PromptImportRow(
        text=raw_text,
        topic=(_prompt_cell(row, columns["topic"]) or "").strip(),
        theme=_optional_cell(row, columns["theme"], PROMPT_THEME_MAX_CHARS),
        # An intent too long to be valid is unknown, which normalizes to "".
        intent=_optional_cell(row, columns["intent"], PROMPT_INTENT_MAX_CHARS),
        cohort=_cohort(_prompt_cell(row, columns["cohort"])),
        enabled=_as_bool(_prompt_cell(row, columns["enabled"]), default=True),
    )


def parse_prompt_csv(content: str) -> list[PromptImportRow]:
    """Parse CSV text into ``PromptImportRow`` rows.

    Supports a header row (``topic,prompt`` in any order, with common aliases
    and optional ``theme,intent,cohort,enabled``) or a headerless file whose
    first column is the prompt text. Empty rows are skipped; unknown intents
    are normalized to ``""`` downstream.
    """
    rows = _read_prompt_rows(content)
    if not rows:
        return []

    header = [cell.strip().lower() for cell in rows[0]]
    has_header = any(cell in _TEXT_KEYS for cell in header)
    data_row_count = len(rows) - (1 if has_header else 0)
    if data_row_count > PROMPT_IMPORT_MAX_ROWS:
        raise ValueError("Prompt CSV has too many rows")
    if not has_header:
        # Headerless: treat the first column of each row as the prompt text.
        return [
            PromptImportRow(text=row[0].strip())
            for row in rows
            if row and row[0].strip()
        ]

    columns = _prompt_column_indices(header)
    prompts: list[PromptImportRow] = []
    for row in rows[1:]:
        prompt = _parse_prompt_row(row, columns)
        if prompt is not None:
            prompts.append(prompt)
    return prompts
