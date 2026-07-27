"""Unit tests for the prompt CSV parser (B3)."""

from __future__ import annotations

import pytest

from app.core.config.http import (
    IMPORT_MAX_CELL_CHARS,
    IMPORT_MAX_COLUMNS,
    PROMPT_IMPORT_MAX_ROWS,
)
from app.domain.prompts.csv_import import parse_prompt_csv


def test_parse_headered_csv() -> None:
    csv_text = (
        "text,theme,intent,branded,enabled\n"
        "best running shoes,footwear,discovery,false,true\n"
        "Acme vs Globex,compare,comparison,true,true\n"
    )
    rows = parse_prompt_csv(csv_text)
    assert len(rows) == 2
    assert rows[0].text == "best running shoes"
    assert rows[0].theme == "footwear"
    assert rows[0].intent == "discovery"
    assert rows[0].branded is False
    assert rows[0].enabled is True
    assert rows[1].branded is True


def test_parse_header_aliases_and_reordered_columns() -> None:
    csv_text = "prompt,topic\nwhere to buy widgets,shopping\n"
    rows = parse_prompt_csv(csv_text)
    assert len(rows) == 1
    assert rows[0].text == "where to buy widgets"
    assert rows[0].theme == "shopping"
    # Absent columns fall back to defaults.
    assert rows[0].enabled is True
    assert rows[0].branded is False


def test_parse_headerless_single_column() -> None:
    rows = parse_prompt_csv("first prompt\nsecond prompt\n")
    assert [r.text for r in rows] == ["first prompt", "second prompt"]


def test_parse_skips_blank_rows_and_bom() -> None:
    rows = parse_prompt_csv("\ufefftext\nkeep\n\n   \n")
    assert [r.text for r in rows] == ["keep"]


def test_parse_empty_returns_empty() -> None:
    assert parse_prompt_csv("") == []
    assert parse_prompt_csv("   \n  ") == []


def test_prompt_csv_rejects_excess_rows_columns_and_cell_length() -> None:
    with pytest.raises(ValueError, match="too many rows"):
        parse_prompt_csv(
            "text\n"
            + "\n".join("prompt" for _ in range(PROMPT_IMPORT_MAX_ROWS + 1))
        )
    with pytest.raises(ValueError, match="too many columns"):
        parse_prompt_csv(",".join("x" for _ in range(IMPORT_MAX_COLUMNS + 1)))
    with pytest.raises(ValueError, match="cell is too long"):
        parse_prompt_csv("text\n" + "x" * (IMPORT_MAX_CELL_CHARS + 1))
