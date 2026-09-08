"""Shared policy for excluding metadata and calls to action from page prose."""

from __future__ import annotations

import re
from typing import Any, Final

from app.analysis.site_health.dom import DOM_ERRORS, dom_failure, node_text
from app.core.config import site_health_acquisition as config
from app.core.config import site_health_authorship as authorship_config

NEXT_ACTION_RE: Final = re.compile(
    r"\b(?:apply|book|buy|contact|get started|join|register|request|"
    r"schedule|sign up|start|subscribe|talk to|try)\b",
    re.IGNORECASE,
)
_PAGE_METADATA_TOKENS: Final[frozenset[str]] = frozenset(
    {
        "author",
        "badge",
        "breadcrumb",
        "byline",
        "date",
        "eyebrow",
        "kicker",
        "metadata",
        "published",
        "tag",
        "timestamp",
    }
)


def is_metadata_or_cta(node: Any) -> bool:
    text = " ".join(node_text(node).split())
    if not text or _is_metadata_copy(text):
        return True
    if _has_explicit_cta_marker(node) or _has_metadata_ancestor(node):
        return True
    return _has_short_cta_descendant(node, text)


def _has_explicit_cta_marker(node: Any) -> bool:
    attributes, _parent = _metadata_node_state(node)
    if attributes is None:
        return True
    tokens = set(re.findall(r"[a-z0-9]+", attributes.casefold()))
    return bool(tokens & config.CTA_BUTTON_ROLE_TOKENS)


def _is_metadata_copy(text: str) -> bool:
    normalized = text.casefold()
    byline = re.match(authorship_config.BYLINE_PATTERN, text)
    if byline is not None:
        suffix = text[byline.end() :].strip()
        return not suffix or bool(
            re.fullmatch(
                authorship_config.BYLINE_METADATA_SUFFIX_PATTERN,
                suffix,
                flags=re.IGNORECASE,
            )
        )
    if normalized.startswith(("published ", "updated ")):
        return True
    return re.fullmatch(r"\w+\s+\d{1,2},\s+\d{4}", text) is not None


def _has_metadata_ancestor(node: Any) -> bool:
    current = node
    for _depth in range(4):
        attributes, parent = _metadata_node_state(current)
        if attributes is None:
            return True
        tokens = set(re.findall(r"[a-z0-9]+", attributes.casefold()))
        if tokens & _PAGE_METADATA_TOKENS:
            return True
        current = parent
        if current is None:
            break
    return False


def _metadata_node_state(node: Any) -> tuple[str | None, Any]:
    try:
        attributes = " ".join(
            str(node.get(name) or "")
            for name in ("class", "id", "itemprop", "rel", "role")
        )
        return attributes, node.getparent()
    except DOM_ERRORS as exc:
        dom_failure("is_metadata_or_cta", exc)
        return None, None


def _has_short_cta_descendant(node: Any, text: str) -> bool:
    try:
        links = list(node.xpath(".//a | .//button | .//input[@type='submit']"))
    except DOM_ERRORS as exc:
        dom_failure("is_metadata_or_cta", exc)
        return True
    if not links or len(text.split()) > 12:
        return False
    return any(NEXT_ACTION_RE.search(node_text(item)) for item in links)
