# Prompt-text normalization for dedupe (one owner, invariant 2).
#
# The ``(prompt_set_id, normalized_text_hash)`` uniqueness on ``prompts`` makes
# duplicate handling conflict-safe at the DB layer; every code path that writes
# prompt text (manual create, CSV import, AI generation, edits) computes the
# hash through this module so "same concept" means the same thing everywhere.
from __future__ import annotations

import hashlib
import re

from app.core.config.prompts import PROMPT_TRAILING_PUNCTUATION

_WHITESPACE = re.compile(r"\s+")
# Trailing punctuation (config-owned) is stripped with str.rstrip, not a
# regex: ``[\s?.!,;:]+$`` is a polynomial ReDoS (CodeQL py/polynomial-redos)
# on long whitespace runs, and CSV import and generation feed
# attacker-influenced text here. rstrip does the same job in linear time.


def normalize_prompt_text(text: str) -> str:
    """Lower-case, collapse whitespace, and strip trailing punctuation.

    Plain ``lower()``: the TypeScript Opportunity refresh computes the same key
    with ``toLowerCase()``.
    """
    collapsed = _WHITESPACE.sub(" ", text).strip().lower()
    return collapsed.rstrip(PROMPT_TRAILING_PUNCTUATION)


def prompt_text_hash(text: str) -> str:
    """sha256 hex digest of the normalized text — the dedupe key."""
    return hashlib.sha256(normalize_prompt_text(text).encode("utf-8")).hexdigest()
