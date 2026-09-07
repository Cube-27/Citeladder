"""Bounded question-and-answer facts from page-owned server HTML."""

from __future__ import annotations

import re
from collections.abc import Iterator
from itertools import islice
from typing import Any

from app.analysis.site_health.dom import DOM_ERRORS, dom_failure, node_text
from app.analysis.site_health.fact_copy import is_metadata_or_cta
from app.analysis.site_health.fact_regions import (
    node_outside_containers,
    region_node_is_visible,
)
from app.core.config import site_health_acquisition as acquisition_config
from app.core.config import site_health_taxonomy as taxonomy
from app.core.config.site_health_rules import ANSWER_FIRST_MAX_HOPS

_QUESTION_BOUNDARY_TAGS = frozenset(
    {"article", "section", "h1", "h2", "h3", "h4", "h5", "h6", "dt"}
)
_ANSWER_SCOPE_TAGS = frozenset({"article", "section"})
_ANSWER_TAGS = frozenset({"p", "dd", "div", "span", "li"})
_QUESTION_FORM_RE = re.compile(
    r"^(?:(?:what|why|how|where|when|who|which)\s+"
    r"(?:is|are|was|were|do|does|did|can|could|will|would|should|has|have)\b"
    r"|(?:is|are|was|were|do|does|did|can|could|will|would|should|has|have)\s+.+\?$)",
    re.IGNORECASE,
)


def question_answer_relationships(
    region: Any, container_ids: set[int]
) -> list[dict[str, str]]:
    """Return observed questions with their directly associated answer, if any."""
    relationships: list[dict[str, str]] = []
    seen_questions: set[str] = set()
    _native_details_relationships(region, container_ids, relationships, seen_questions)
    _aria_relationships(region, container_ids, relationships, seen_questions)
    _heading_relationships(region, container_ids, relationships, seen_questions)
    return relationships


def direct_answer(region: Any, container_ids: set[int]) -> str:
    """Return the first answer directly associated with a page-owned heading."""
    try:
        headings = region.xpath(".//h1 | .//h2 | .//h3 | .//dt")
    except DOM_ERRORS as exc:
        dom_failure("direct_answer", exc)
        return ""
    accepted = 0
    for heading in headings:
        if not _page_owned(heading, region, container_ids):
            continue
        accepted += 1
        if accepted > acquisition_config.SITE_HEALTH_MAX_HEADINGS_KEPT:
            break
        if not is_answer_heading(node_text(heading)):
            continue
        if answer := _associated_answer(region, heading, container_ids):
            return answer[: acquisition_config.SITE_HEALTH_MAX_FIRST_ANSWER_CHARS]
    return ""


def is_answer_heading(text: str) -> bool:
    """Whether text is an explicit question or bounded definition request."""
    normalized = " ".join(str(text or "").casefold().split())
    if not normalized:
        return False
    if normalized.endswith("?"):
        return True
    return (
        _QUESTION_FORM_RE.match(normalized) is not None
        or normalized.startswith("definition ")
        or normalized.startswith("definition of ")
        or normalized.startswith("meaning of ")
        or normalized.startswith("define ")
    )


def available_question_count(value: Any) -> int:
    """Count distinct, well-formed relationships with an available answer."""
    if not isinstance(value, list | tuple):
        return 0
    questions: set[str] = set()
    for relationship in value:
        if not isinstance(relationship, dict):
            continue
        question = str(relationship.get("question") or "").strip()
        answer = str(relationship.get("answer") or "").strip()
        if (
            relationship.get("answer_state") == "available"
            and is_answer_heading(question)
            and answer
        ):
            questions.add(" ".join(question.casefold().split()))
    return len(questions)


def observed_question_count(value: Any) -> int:
    """Count distinct bounded question relationships, regardless of answer state."""
    if not isinstance(value, list | tuple):
        return 0
    return len(
        {
            " ".join(str(item.get("question") or "").casefold().split())
            for item in value
            if isinstance(item, dict)
            and is_answer_heading(str(item.get("question") or ""))
        }
        - {""}
    )


def _native_details_relationships(
    region: Any,
    container_ids: set[int],
    relationships: list[dict[str, str]],
    seen_questions: set[str],
) -> None:
    try:
        details_nodes = region.xpath(".//details")
    except DOM_ERRORS as exc:
        dom_failure("_native_details_relationships", exc)
        return
    for scanned, details in enumerate(details_nodes, start=1):
        if (
            scanned > taxonomy.REGION_MAX_CONTAINERS_SCANNED
            or len(relationships) >= taxonomy.PAGE_OWNED_MAX_QUESTION_ANSWER_PAIRS
        ):
            return
        if not _page_owned(details, region, container_ids):
            continue
        try:
            summaries = details.xpath("./summary")
        except DOM_ERRORS as exc:
            dom_failure("_native_details_relationships", exc)
            continue
        if summaries:
            _append_relationship(
                relationships,
                seen_questions,
                node_text(summaries[0]),
                _details_answer(details, summaries[0], region, container_ids),
                "details",
            )


def _aria_relationships(
    region: Any,
    container_ids: set[int],
    relationships: list[dict[str, str]],
    seen_questions: set[str],
) -> None:
    nodes = _bounded_region_nodes(region)
    panels, duplicate_ids = _panel_index(nodes)
    for control in nodes:
        if len(relationships) >= taxonomy.PAGE_OWNED_MAX_QUESTION_ANSWER_PAIRS:
            return
        if not _page_owned(control, region, container_ids):
            continue
        target_id = _aria_control_target(control)
        if target_id is None:
            continue
        answer, state, reason = _aria_panel_state(
            target_id,
            control,
            panels,
            duplicate_ids,
            region,
            container_ids,
        )
        _append_relationship(
            relationships,
            seen_questions,
            node_text(control),
            answer,
            "aria_controls",
            answer_state=state,
            reason=reason,
        )


def _bounded_region_nodes(region: Any) -> list[Any]:
    try:
        return list(islice(region.iter(), taxonomy.REGION_MAX_CONTAINERS_SCANNED))
    except DOM_ERRORS as exc:
        dom_failure("_bounded_region_nodes", exc)
        return []


def _panel_index(nodes: list[Any]) -> tuple[dict[str, Any], set[str]]:
    panels: dict[str, Any] = {}
    duplicate_ids: set[str] = set()
    for node in nodes:
        panel_id = str(node.get("id") or "").strip()
        if not panel_id:
            continue
        if panel_id in panels:
            duplicate_ids.add(panel_id)
        else:
            panels[panel_id] = node
    return panels, duplicate_ids


def _aria_control_target(control: Any) -> str | None:
    try:
        target_id = str(control.get("aria-controls") or "").strip()
        expanded = str(control.get("aria-expanded") or "").strip().casefold()
        tag = str(control.tag or "").casefold()
        role = str(control.get("role") or "").strip().casefold()
    except DOM_ERRORS as exc:
        dom_failure("_aria_control_target", exc)
        return None
    if not target_id or any(character.isspace() for character in target_id):
        return None
    if expanded not in {"true", "false"}:
        return None
    if tag != "button" and role != "button":
        return None
    return target_id


def _aria_panel_state(
    target_id: str,
    control: Any,
    panels: dict[str, Any],
    duplicate_ids: set[str],
    region: Any,
    container_ids: set[int],
) -> tuple[str, str, str]:
    if target_id in duplicate_ids:
        return "", "unavailable", "answer_panel_ambiguous"
    panel = panels.get(target_id)
    if panel is None or panel is control:
        return "", "unavailable", "answer_panel_missing"
    if not _page_owned(panel, region, container_ids):
        return "", "unavailable", "answer_panel_unavailable"
    answer = _panel_answer(panel, region, container_ids)
    if answer:
        return answer, "available", ""
    return "", "missing", "answer_content_missing"


def _heading_relationships(
    region: Any,
    container_ids: set[int],
    relationships: list[dict[str, str]],
    seen_questions: set[str],
) -> None:
    try:
        headings = region.xpath(".//h1 | .//h2 | .//h3 | .//h4 | .//h5 | .//h6 | .//dt")
    except DOM_ERRORS as exc:
        dom_failure("_heading_relationships", exc)
        return
    accepted = 0
    for scanned, heading in enumerate(headings, start=1):
        if (
            scanned > taxonomy.REGION_MAX_CONTAINERS_SCANNED
            or len(relationships) >= taxonomy.PAGE_OWNED_MAX_QUESTION_ANSWER_PAIRS
        ):
            return
        if not _page_owned(heading, region, container_ids):
            continue
        question = node_text(heading)
        if is_answer_heading(question):
            accepted += 1
            if accepted > acquisition_config.SITE_HEALTH_MAX_HEADINGS_KEPT:
                return
            _append_relationship(
                relationships,
                seen_questions,
                question,
                _associated_answer(region, heading, container_ids),
                "heading",
            )


def _details_answer(
    details: Any, summary: Any, region: Any, container_ids: set[int]
) -> str:
    try:
        children = list(details)
    except DOM_ERRORS as exc:
        dom_failure("_details_answer", exc)
        return ""
    for child in children:
        if (
            child is summary
            or str(getattr(child, "tag", "") or "").casefold() == "details"
        ):
            continue
        if answer := _answer_candidate(child, region, container_ids):
            return answer
        if answer := _first_child_answer(child, region, container_ids):
            return answer
    return ""


def _panel_answer(panel: Any, region: Any, container_ids: set[int]) -> str:
    if answer := _answer_candidate(panel, region, container_ids):
        return answer
    return _first_child_answer(panel, region, container_ids)


def _first_child_answer(node: Any, region: Any, container_ids: set[int]) -> str:
    try:
        candidates = node.xpath(
            "./p | ./dd | ./div | ./span | ./li | ./ul/li | ./ol/li"
        )
    except DOM_ERRORS as exc:
        dom_failure("_first_child_answer", exc)
        return ""
    for candidate in candidates:
        if answer := _answer_candidate(candidate, region, container_ids):
            return answer
    return ""


def _associated_answer(region: Any, heading: Any, container_ids: set[int]) -> str:
    try:
        siblings = heading.itersiblings()
    except DOM_ERRORS as exc:
        dom_failure("_associated_answer", exc)
        return ""
    for hops, sibling in enumerate(siblings, start=1):
        if hops > ANSWER_FIRST_MAX_HOPS or _is_answer_boundary(sibling):
            break
        if answer := _answer_candidate(sibling, region, container_ids):
            return answer
    return _answer_from_document_order(region, heading, container_ids)


def _answer_from_document_order(
    region: Any, heading: Any, container_ids: set[int]
) -> str:
    hops = 0
    for node in _document_order_candidates(region, heading):
        hops += 1
        if hops > ANSWER_FIRST_MAX_HOPS or _is_answer_boundary(node):
            break
        if answer := _answer_candidate(node, region, container_ids):
            return answer
    return ""


def _document_order_candidates(region: Any, heading: Any) -> Iterator[Any]:
    try:
        walker = region.iter()
        answer_scope = next(
            (
                ancestor
                for ancestor in heading.iterancestors()
                if str(getattr(ancestor, "tag", "") or "").casefold()
                in _ANSWER_SCOPE_TAGS
            ),
            region,
        )
    except DOM_ERRORS as exc:
        dom_failure("_answer_from_document_order", exc)
        return
    seen_heading = False
    for node in walker:
        if node is heading:
            seen_heading = True
            continue
        if not seen_heading:
            continue
        position = _document_order_position(node, heading, answer_scope, region)
        if position == "heading_subtree":
            continue
        if position != "candidate":
            return
        yield node


def _document_order_position(
    node: Any, heading: Any, answer_scope: Any, region: Any
) -> str:
    try:
        ancestors = tuple(node.iterancestors())
    except DOM_ERRORS as exc:
        dom_failure("_answer_from_document_order", exc)
        return "error"
    if heading in ancestors:
        return "heading_subtree"
    if answer_scope is not region and answer_scope not in ancestors:
        return "outside_scope"
    return "candidate"


def _answer_candidate(node: Any, region: Any, container_ids: set[int]) -> str:
    tag = str(getattr(node, "tag", "") or "").casefold()
    if tag not in _ANSWER_TAGS or not _page_owned(node, region, container_ids):
        return ""
    if is_metadata_or_cta(node):
        return ""
    if tag == "div":
        try:
            if node.xpath(
                ".//h1 | .//h2 | .//h3 | .//h4 | .//h5 | .//h6 | .//dt | .//details"
            ):
                return ""
        except DOM_ERRORS as exc:
            dom_failure("_answer_candidate", exc)
            return ""
    return " ".join(node_text(node).split())


def _is_answer_boundary(node: Any) -> bool:
    return str(getattr(node, "tag", "") or "").casefold() in _QUESTION_BOUNDARY_TAGS


def _page_owned(node: Any, region: Any, container_ids: set[int]) -> bool:
    return (
        region_node_is_visible(node)
        and node_outside_containers(node, container_ids)
        and node is not region
    )


def _append_relationship(
    relationships: list[dict[str, str]],
    seen_questions: set[str],
    question: str,
    answer: str,
    source: str,
    *,
    answer_state: str | None = None,
    reason: str = "",
) -> None:
    normalized_question = " ".join(str(question or "").split())
    normalized_answer = " ".join(str(answer or "").split())
    bounded_question = _bounded_question(normalized_question)
    identity = bounded_question.casefold()
    if (
        len(relationships) >= taxonomy.PAGE_OWNED_MAX_QUESTION_ANSWER_PAIRS
        or not is_answer_heading(bounded_question)
        or identity in seen_questions
    ):
        return
    seen_questions.add(identity)
    state = answer_state or ("available" if normalized_answer else "missing")
    relationships.append(
        {
            "question": bounded_question,
            "answer": normalized_answer[
                : acquisition_config.SITE_HEALTH_MAX_FIRST_ANSWER_CHARS
            ],
            "source": source,
            "answer_state": state,
            "reason": reason or ("" if normalized_answer else "answer_content_missing"),
        }
    )


def _bounded_question(question: str) -> str:
    limit = acquisition_config.SITE_HEALTH_MAX_HEADING_CHARS
    if len(question) <= limit:
        return question
    if question.endswith("?"):
        return f"{question[: limit - 1].rstrip()}?"
    return question[:limit].rstrip()
