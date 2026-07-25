# Prompt-text normalization for dedupe (one owner, invariant 2).
#
# The ``(prompt_set_id, normalized_text_hash)`` uniqueness on ``prompts`` makes
# duplicate handling conflict-safe at the DB layer; every code path that writes
# prompt text (manual create, CSV import, AI generation, edits) computes the
# hash through this module so "same concept" means the same thing everywhere.
from __future__ import annotations

import hashlib
import re

_WHITESPACE = re.compile(r"\s+")
# Trailing punctuation that doesn't change the concept ("best shoes?" == "best shoes").
#
# Stripped with str.rstrip rather than a regex. The obvious pattern —
# ``re.compile(r"[\s?.!,;:]+$")`` — is a polynomial ReDoS (CodeQL
# py/polynomial-redos): on a long run of whitespace that never satisfies the
# anchor, the engine retries the quantifier from each starting offset, so cost
# grows with the square of the run length. Measured on the pre-fix pattern:
# 2k chars 14ms, 4k 50ms, 8k 200ms, 16k 825ms.
#
# This is reachable with attacker-influenced input — CSV import and the AI
# suggestion path both feed text straight here — and rstrip does exactly the
# same job in linear time, since the character set is what it strips and the
# anchor was only ever "at the end".
_TRAILING_PUNCTUATION_CHARS = " \t\n\r\v\f?.!,;:"


def normalize_prompt_text(text: str) -> str:
    """Casefold, collapse whitespace, and strip trailing punctuation."""
    collapsed = _WHITESPACE.sub(" ", text).strip().casefold()
    return collapsed.rstrip(_TRAILING_PUNCTUATION_CHARS)


def prompt_text_hash(text: str) -> str:
    """sha256 hex digest of the normalized text — the dedupe key."""
    return hashlib.sha256(normalize_prompt_text(text).encode("utf-8")).hexdigest()
