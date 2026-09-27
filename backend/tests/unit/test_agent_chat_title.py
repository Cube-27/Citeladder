"""A chat is titled by the task its opening message names, not a hard cut."""

from __future__ import annotations

from app.core.config.agent import AGENT_CHAT_TITLE_MAX_CHARS
from app.domain.agent.service import _title


def test_title_is_the_first_sentence() -> None:
    message = (
        "Build a portfolio of distinct buyer questions. Keep the existing topics.\n"
        "Read the current prompt portfolio."
    )
    assert _title(message) == "Build a portfolio of distinct buyer questions."


def test_a_long_sentence_is_cut_at_a_word_boundary() -> None:
    title = _title("Explain " + "visibility " * 20)
    assert len(title) <= AGENT_CHAT_TITLE_MAX_CHARS
    assert title.endswith("visibility…")


def test_an_empty_message_is_a_new_chat() -> None:
    assert _title("   ") == "New chat"
