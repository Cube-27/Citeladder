"""Agent context-package policy: bounded, deterministic crawl selection.

The single context builder (``domain/agent/context_builder.py``) freezes a
versioned package from reviewed brand facts, target-page evidence and a
bounded related-page set. Every bound it reads lives here (invariant 2).
"""

from __future__ import annotations

from typing import Final

# --- Frozen context contract (frozen on each agent run) -------------------
CONTENT_CONTEXT_STATUS_INCLUDED: Final = "included"
CONTENT_CONTEXT_STATUS_UNAVAILABLE: Final = "unavailable"

# --- Crawl-fragment selection caps (bounded, deterministic) ---------------
CONTENT_CONTEXT_MAX_PAGES: Final = 10
CONTEXT_MAX_H1: Final = 3
CONTEXT_MAX_H2: Final = 8
CONTENT_CONTEXT_PER_PAGE_BODY_CHARS: Final = 2000
CONTENT_CONTEXT_MAX_CHARS: Final = 24000
# Per-field hard cap applied after sanitisation (title/meta/heading strings).
CONTENT_CONTEXT_FIELD_MAX_CHARS: Final = 300

# --- Relevance scoring weights (deterministic lexical overlap) -------------
# Applied per distinct instruction term present in the field, not per occurrence, so
# a long page cannot outrank a precisely-matching one on repetition alone.
CONTENT_SCORE_TARGET_URL: Final = 1000
CONTENT_SCORE_TITLE: Final = 20
CONTENT_SCORE_H1: Final = 20
CONTENT_SCORE_H2: Final = 10
CONTENT_SCORE_URL: Final = 10
CONTENT_SCORE_BODY: Final = 2
CONTENT_SCORE_MONITORED: Final = 5

# --- Versions ---------------------------------------------------------------
CONTENT_CRAWL_FRAGMENT_SELECTION_VERSION: Final = "crawl-fragment-selection-1"
CONTENT_CONTEXT_VERSION: Final = "content-context-v1"
