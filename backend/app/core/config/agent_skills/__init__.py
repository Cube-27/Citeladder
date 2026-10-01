"""Policy and packaged model inputs for the TypeScript Agent skill loader.

The TypeScript owner parses, expands and fingerprints these methodologies.
This module exports policy vocabulary and content-format IDs to existing
configuration consumers; it does not load a runtime catalog.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Final

from app.core.config.visibility_prompts import BUYER_STAGES, PROMPT_INTENT_VOCABULARY

SKILL_GROUPS: Final[tuple[str, ...]] = (
    "strategy",
    "demand",
    "owned_site",
    "visibility",
    "content",
)
OUTPUT_KINDS: Final[tuple[str, ...]] = (
    "plan",
    "measurement",
    "research",
    "prompt_portfolio",
    "page_edits",
    "link_plan",
    "technical_fix",
    "diagnosis",
    "earned_brief",
    "content",
)
# Outline-first kinds: the first output is an editable outline (a content
# outline, or a prompt portfolio's coverage plan), and the full deliverable is
# written only after the user approves it.
OUTLINE_FIRST_OUTPUT_KINDS: Final[frozenset[str]] = frozenset(
    {"content", "prompt_portfolio"}
)
# Kinds whose outline is shaped by a content format.
CONTENT_FORMAT_OUTPUT_KINDS: Final[frozenset[str]] = frozenset({"content"})
# Author bounds. Every selected skill body lands in the per-step system prompt,
# so a body is capped rather than allowed to grow without review.
SKILL_DESCRIPTION_MAX_CHARS: Final = 320
SKILL_BODY_MAX_CHARS: Final = 14_000
# Vocabularies a skill body may reference as ``{{name}}``. Each is the owner's
# one listing; the loader expands it so the body cannot drift from it.
SKILL_VOCABULARIES: Final[dict[str, tuple[str, ...]]] = {
    "buyer_stages": BUYER_STAGES,
    "prompt_intents": PROMPT_INTENT_VOCABULARY,
}
CONTENT_FORMAT_IDS: Final[tuple[str, ...]] = tuple(
    re.findall(
        r"^## ([a-z_]+) — .+$",
        (Path(__file__).parent / "content_formats.md").read_text(encoding="utf-8"),
        re.MULTILINE,
    )
)
