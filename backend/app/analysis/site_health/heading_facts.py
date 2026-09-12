"""Bounded document-wide visible heading observations."""

from __future__ import annotations

from typing import Any

from app.analysis.site_health.dom import DOM_ERRORS, dom_failure, node_text


def _is_rendered(node: Any) -> bool:
    try:
        return not bool(
            node.xpath(
                "ancestor-or-self::template or ancestor-or-self::*[@hidden] "
                "or ancestor-or-self::*[@inert] or ancestor-or-self::*["
                "translate(normalize-space(@aria-hidden), 'TRUE', 'true')='true']"
            )
        )
    except DOM_ERRORS as exc:
        dom_failure("extract_heading_facts", exc)
        return False


def extract_heading_facts(
    root: Any, *, max_headings: int, max_chars: int
) -> dict[str, Any]:
    """Count visible h1..h6 and retain bounded h1/h2/h3 text."""
    counts: dict[str, int] = {}
    texts: dict[int, list[str]] = {1: [], 2: [], 3: []}
    for level in range(1, 7):
        tag = f"h{level}"
        try:
            nodes = [node for node in root.xpath(f"//{tag}") if _is_rendered(node)]
        except DOM_ERRORS as exc:
            dom_failure("extract_heading_facts", exc)
            nodes = []
        counts[tag] = len(nodes)
        if level in texts:
            texts[level] = [
                node_text(node)[:max_chars] for node in nodes[:max_headings]
            ]
    return {
        "counts": counts,
        "h1_count": counts.get("h1", 0),
        "h1_texts": texts[1],
        "h2_texts": texts[2],
        "h3_texts": texts[3],
    }
