"""Exact paragraph locators and linked ranges from the existing parsed tree."""

from typing import Any

from app.analysis.site_health.fact_regions import (
    node_outside_containers,
    region_node_is_visible,
    visible_region_text_nodes,
)
from app.core.config import site_health_content_structure as config


def _paragraph(node: Any, heading: str) -> dict[str, Any]:
    parts: list[str] = []
    linked: list[dict[str, Any]] = []
    length = 0
    for text_node in visible_region_text_nodes(node):
        text = " ".join(str(text_node).split())
        if not text:
            continue
        start = length + int(bool(parts))
        # Consumers use JavaScript string offsets (UTF-16 code units).
        length = start + len(text.encode("utf-16-le")) // 2
        parts.append(text)
        parent = text_node.getparent()
        # An element's tail belongs to its parent, outside that element's link.
        if text_node.is_tail:
            parent = parent.getparent()
        while parent is not None and parent is not node:
            if parent.tag == "a":
                linked.append({"start": start, "end": length})
                break
            parent = parent.getparent()
    return {
        "locator": node.getroottree().getpath(node),
        "heading": heading,
        "text": " ".join(parts),
        "linked_ranges": linked,
    }


def content_passages(region: Any, container_ids: set[int]) -> dict[str, Any]:
    """Keep complete visible paragraphs; never offer an insertion in clipped text."""
    passages: list[dict[str, Any]] = []
    heading = ""
    omitted = 0
    for node in region.iter():
        if not region_node_is_visible(node) or not node_outside_containers(
            node, container_ids
        ):
            continue
        if node.tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            heading = " ".join(" ".join(visible_region_text_nodes(node)).split())[
                : config.CONTENT_STRUCTURE_MAX_PASSAGE_CHARS
            ]
        elif node.tag == "p":
            passage = _paragraph(node, heading)
            size = len(passage["text"])
            if size < config.CONTENT_STRUCTURE_MIN_PASSAGE_CHARS:
                continue
            if (
                size > config.CONTENT_STRUCTURE_MAX_PASSAGE_CHARS
                or len(passages) >= config.CONTENT_STRUCTURE_MAX_PASSAGES
            ):
                omitted += 1
                continue
            passages.append(passage)
    return {
        "version": config.CONTENT_STRUCTURE_VERSION,
        "passages": passages,
        "omitted_passages": omitted,
    }
