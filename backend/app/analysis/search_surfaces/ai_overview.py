"""Turn a DataForSEO Google Organic task into an AI Overview observation.

Pure: no I/O, no session, no clock. Everything it needs arrives in the
payload.

The module's whole job is to be honest about what it found. Four rules make
that safe, and every branch below is one of them:

1. Evaluate in order — transport, envelope, matched task, structure. Task
   status is authoritative only FOR A MATCHED TASK INSIDE A VALID RESPONSE;
   it never licenses ignoring an envelope failure.
2. Status codes come from a config table. No numeric range test exists here,
   because the ``4xxxx`` band mixes pending states with failures.
3. Absence is only absence when the task is confirmed complete. An
   unrecognised shape is an error, never ``no_ai_overview``.
4. Reference cards never enter the answer body, and citation attribution
   follows URL identity alone.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Final

from app.connectors.search_surfaces.contracts import (
    OUTCOME_AI_OVERVIEW_PRESENT,
    OUTCOME_NO_AI_OVERVIEW,
    OUTCOME_PARSER_ERROR,
    OUTCOME_PROVIDER_ERROR,
    RESULT_STILL_PENDING,
    AioLink,
    AioReference,
    SearchSurfaceResult,
)
from app.connectors.web_evidence.url_policy import registrable_domain
from app.core.config.dataforseo import (
    is_complete_status,
    is_pending_status,
    is_terminal_failure_status,
)

# The one item type this version reads. Every other type in the response —
# organic, people_also_ask, popular_products, local_pack and the rest — is
# retained in raw evidence and ignored by every projection. The response
# contains enough data to become a general SERP platform by accident; that is
# a boundary, not a backlog.
ITEM_TYPE_AI_OVERVIEW: Final = "ai_overview"

# Element types the visible-answer extractor understands. An element type NOT
# in this set is a parser error rather than a silent omission: quietly
# skipping an unknown element would drop text the overview actually showed,
# and a brand named in that text would be recorded as unmentioned.
ELEMENT_TYPE_AI_OVERVIEW: Final = "ai_overview_element"
KNOWN_ELEMENT_TYPES: Final[frozenset[str]] = frozenset(
    {ELEMENT_TYPE_AI_OVERVIEW, "ai_overview_expanded_element"}
)

# Hosts whose content Google itself owns. A Shopping URL sitting beside a
# brand name is Google's surface, not the brand's citation — attributing it to
# whoever is named nearby would manufacture an owned citation out of Google's
# own furniture.
GOOGLE_OWNED_HOSTS: Final[frozenset[str]] = frozenset(
    {"google.com", "google.co.uk", "google.com.au", "goo.gl", "youtube.com"}
)

SOURCE_GOOGLE: Final = "google"
SOURCE_EXTERNAL: Final = "external"


class AiOverviewParseError(ValueError):
    """The payload does not have a shape this parser can interpret."""


def parse_task_payload(
    payload: Any, *, expected_task_id: str = ""
) -> SearchSurfaceResult | str:
    """Read one provider RESPONSE into a terminal outcome.

    Returns ``RESULT_STILL_PENDING`` — a bare string, deliberately not a
    result — when the provider says the task has not finished. That is a
    signal to re-park, not a finding, and nothing may count it.

    ``expected_task_id`` selects the task CiteLadder submitted. A response can
    carry several tasks, and reading the first one would attach another task's
    AI Overview to this execution.
    """
    envelope = _require_mapping(payload, "response")
    tasks = envelope.get("tasks")

    # Rule 1, envelope level: a response-level failure is authoritative and is
    # handled BEFORE any task is looked at. A task cannot vouch for a response
    # that was rejected outright, so the presence of a ``tasks[]`` array is NOT
    # permission to skip this — a rejected request can still carry task stubs,
    # and reading their statuses would let a payment or auth failure be
    # reported as whatever the stub happened to say.
    envelope_status = _status_code(envelope)
    if envelope_status is not None and not is_complete_status(envelope_status):
        return _provider_error(envelope_status, envelope)

    if not _has_tasks(tasks):
        # Rule 3: an empty ``tasks[]`` has no documented meaning of successful
        # observation, so it is an error. Reading it as "no AI Overview" would
        # report a broken response as a measured absence.
        return _parser_error(envelope, "response carried no tasks")

    task = _select_task(_as_list(tasks), expected_task_id)
    if task is None:
        return _parser_error(envelope, f"no task matched id {expected_task_id!r}")
    return parse_task(task)


def parse_task(task: Any) -> SearchSurfaceResult | str:
    """Read one TASK object into a terminal outcome."""
    task_map = _require_mapping(task, "task")
    status = _status_code(task_map)
    if status is None:
        return _parser_error(task_map, "task carried no status code")

    # Rule 2: a table lookup, in a fixed order. Pending is checked before
    # failure and both before completion, and none of it is a range test —
    # 40103, 40601 and 40602 are all 4xxxx and mean three different things.
    if is_pending_status(status):
        return RESULT_STILL_PENDING
    if is_terminal_failure_status(status):
        return _provider_error(status, task_map)
    if not is_complete_status(status):
        # An unrecognised code is not assumed benign. Fail loudly so the code
        # can be classified, rather than silently recording an observation
        # that may never have happened.
        return _provider_error(status, task_map)

    return _parse_completed_task(task_map, status)


def _parse_completed_task(task: dict[str, Any], status: int) -> SearchSurfaceResult:
    """Rule 3 lives here: absence counts only on a confirmed-complete task."""
    results = task.get("result")
    if not isinstance(results, list) or not results:
        return _parser_error(task, "completed task carried no result")
    page = results[0]
    if not isinstance(page, dict):
        return _parser_error(task, "result entry was not an object")

    items = page.get("items")
    if items is None:
        items = []
    if not isinstance(items, list):
        return _parser_error(task, "result items were not a list")

    block = _select_ai_overview(items)
    if block is None:
        # The ONLY path that may say the brand was not shown because there was
        # nothing to be shown in. The task is confirmed complete and
        # well-formed; there simply was no AI Overview.
        return SearchSurfaceResult(
            outcome=OUTCOME_NO_AI_OVERVIEW,
            provider_status_code=status,
            aio_present=False,
            observed_at=_observed_at(page, task),
            provider_cost_microusd=_cost_microusd(task),
            raw_payload=task,
        )

    try:
        answer_text, elements = _extract_visible_answer(block)
        links = _collect_links(block)
        references = _collect_references(block)
    except AiOverviewParseError as exc:
        return _parser_error(task, str(exc), status=status)

    return SearchSurfaceResult(
        outcome=OUTCOME_AI_OVERVIEW_PRESENT,
        provider_status_code=status,
        aio_present=True,
        # The position of the BLOCK on the SERP, never a brand rank. The field
        # name has to keep saying so: a "position" that silently became a
        # brand ranking would be read as a visibility win or loss.
        aio_serp_position=_int_or_none(block.get("rank_absolute")),
        answer_text=answer_text,
        aio_markdown=str(block.get("markdown") or ""),
        elements=elements,
        links=links,
        references=references,
        observed_at=_observed_at(page, task),
        provider_cost_microusd=_cost_microusd(task),
        raw_payload=task,
    )


# --- Visible answer -------------------------------------------------------


def _walk_elements(block: dict[str, Any]) -> list[tuple[int, dict[str, Any]]]:
    """Every element of the overview, nested ones included, type-validated.

    ONE traversal, shared by the text and link projections. They used to walk
    different sets — text recursed into nested elements without checking their
    type, links did not recurse at all — so a nested element could contribute
    unvalidated text while its links were silently dropped. Two readers of one
    tree disagreeing about which nodes exist is how a brand ends up mentioned
    but not linked for no reason anyone could see.

    The index returned is the TOP-LEVEL element a node belongs to, so evidence
    display still points at the block a link actually appeared in.
    """
    elements = block.get("items")
    if elements is None:
        elements = []
    if not isinstance(elements, list):
        raise AiOverviewParseError("ai_overview items were not a list")

    walked: list[tuple[int, dict[str, Any]]] = []

    def _descend(node: Any, index: int) -> None:
        if not isinstance(node, dict):
            raise AiOverviewParseError("ai_overview element was not an object")
        element_type = str(node.get("type") or "")
        if element_type not in KNOWN_ELEMENT_TYPES:
            raise AiOverviewParseError(f"unknown element type: {element_type!r}")
        walked.append((index, node))
        for nested in _as_list(node.get("items")):
            # A nested string is inline content of THIS element, not a child
            # element, so it is left for the fragment reader.
            if isinstance(nested, dict):
                _descend(nested, index)

    for index, element in enumerate(elements):
        _descend(element, index)
    return walked


def _extract_visible_answer(
    block: dict[str, Any],
) -> tuple[str, tuple[dict[str, Any], ...]]:
    """Walk the element tree in document order and build the visible answer.

    ONE canonical function, covering every supported element type. A text-only
    loop over ``items[].text`` was the obvious shortcut and it is wrong: a
    brand named inside a table cell IS named in the answer, and skipping it
    would record a real mention as an absence.

    Reference cards are never appended. Concatenating a card's title or
    snippet would manufacture a mention the overview never made.
    """
    parts: list[str] = []
    seen: set[str] = set()
    captured: list[dict[str, Any]] = []

    for _index, element in _walk_elements(block):
        captured.append(element)
        for fragment in _element_fragments(element):
            # Guard against emitting the same content twice: an element often
            # carries both a plain-text and a markdown rendering of one
            # passage, and a brand counted twice is a scoring artefact.
            key = _normalize(fragment)
            if not key or key in seen:
                continue
            seen.add(key)
            parts.append(fragment.strip())

    return "\n\n".join(parts), tuple(captured)


def _element_fragments(element: dict[str, Any]) -> list[str]:
    """Every visible fragment of one element, in document order.

    Falls back to the element's ``markdown`` only when it carries no plain
    text, so a markdown rendering never duplicates text already taken.
    """
    fragments: list[str] = []
    for key in ("title", "text"):
        value = element.get(key)
        if isinstance(value, str) and value.strip():
            fragments.append(value)

    fragments.extend(_table_fragments(element.get("table")))

    # Only inline STRING children here. Nested elements are visited by
    # ``_walk_elements``, which validates them first; recursing again would
    # both bypass that check and emit their text twice.
    for nested in _as_list(element.get("items")):
        if isinstance(nested, str) and nested.strip():
            fragments.append(nested)

    if not fragments:
        markdown = element.get("markdown")
        if isinstance(markdown, str) and markdown.strip():
            fragments.append(markdown)
    return fragments


def _table_fragments(table: Any) -> list[str]:
    """Header and cell text from a table element, row by row.

    A brand named only in a table cell is named in the answer. This is the
    case a text-only walk misses.
    """
    if not isinstance(table, dict):
        return []
    fragments: list[str] = []
    for header in _as_list(table.get("table_header")):
        if isinstance(header, str) and header.strip():
            fragments.append(header)
    for row in _as_list(table.get("table_content")):
        cells = [
            cell.strip()
            for cell in _as_list(row)
            if isinstance(cell, str) and cell.strip()
        ]
        if cells:
            fragments.append(" ".join(cells))
    return fragments


# --- Links and references -------------------------------------------------


def _collect_links(block: dict[str, Any]) -> tuple[AioLink, ...]:
    """Inline ``links[]`` from every element, deduplicated by canonical URL.

    Inline links ONLY — never references. Deriving link rows from the
    reference list as well would make every citation-only entity look linked
    and destroy the independence the three-source evidence model exists to
    preserve.
    """
    collected: dict[str, AioLink] = {}
    for index, element in _walk_elements(block):
        for link in _as_list(element.get("links")):
            if not isinstance(link, dict):
                continue
            url = str(link.get("url") or "").strip()
            if not url or url in collected:
                continue
            collected[url] = AioLink(
                url=url,
                domain=registrable_domain(str(link.get("domain") or url)),
                title=str(link.get("title") or ""),
                element_index=index,
            )
    return tuple(collected.values())


def _collect_references(block: dict[str, Any]) -> tuple[AioReference, ...]:
    """The ROOT reference list, and only that.

    Nested ``items[].references[]`` duplicate the root array — the provider
    repeats the same sources per passage — so ingesting both would double
    every citation count in Sources. The root array is the complete cited
    source set; the nested copies attribute sources to individual passages and
    are retained in raw evidence only.
    """
    collected: dict[str, AioReference] = {}
    for reference in _as_list(block.get("references")):
        if not isinstance(reference, dict):
            continue
        url = str(reference.get("url") or "").strip()
        if not url or url in collected:
            continue
        domain = registrable_domain(str(reference.get("domain") or url))
        collected[url] = AioReference(
            url=url,
            domain=domain,
            title=str(reference.get("title") or ""),
            source=SOURCE_GOOGLE if domain in GOOGLE_OWNED_HOSTS else SOURCE_EXTERNAL,
        )
    return tuple(collected.values())


# --- Small helpers --------------------------------------------------------


def _select_ai_overview(items: list[Any]) -> dict[str, Any] | None:
    for item in items:
        if isinstance(item, dict) and item.get("type") == ITEM_TYPE_AI_OVERVIEW:
            return item
    return None


def _select_task(tasks: list[Any], expected_task_id: str) -> dict[str, Any] | None:
    candidates = [task for task in tasks if isinstance(task, dict)]
    if not expected_task_id:
        return candidates[0] if len(candidates) == 1 else None
    for task in candidates:
        if str(task.get("id") or "") == expected_task_id:
            return task
    return None


def _has_tasks(tasks: Any) -> bool:
    return isinstance(tasks, list) and any(isinstance(task, dict) for task in tasks)


def _status_code(payload: dict[str, Any]) -> int | None:
    return _int_or_none(payload.get("status_code"))


def _int_or_none(value: Any) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _normalize(value: str) -> str:
    return " ".join(value.split()).casefold()


def _require_mapping(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise AiOverviewParseError(f"{label} was not an object")
    return value


def _observed_at(page: dict[str, Any], task: dict[str, Any]) -> datetime | None:
    """When the SERP was captured, as the provider reported it.

    Kept separate from when CiteLadder collected it: the two differ by however
    long the task sat in the provider's queue, and a trend that plots
    retrieval time is plotting queue latency.
    """
    for source in (page, task):
        raw = source.get("datetime") or source.get("time")
        if not isinstance(raw, str) or not raw.strip():
            continue
        text = raw.strip().replace(" +00:00", "+00:00").replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(text)
        except ValueError:
            continue
    return None


def _cost_microusd(task: dict[str, Any]) -> int | None:
    cost = task.get("cost")
    if isinstance(cost, bool) or not isinstance(cost, (int, float)):
        return None
    return round(float(cost) * 1_000_000)


def _provider_error(status: int, payload: dict[str, Any]) -> SearchSurfaceResult:
    """The provider told us it failed. Preserve ITS code, verbatim."""
    return SearchSurfaceResult(
        outcome=OUTCOME_PROVIDER_ERROR,
        provider_status_code=status,
        raw_payload=payload,
    )


def _parser_error(
    payload: dict[str, Any], reason: str, *, status: int | None = None
) -> SearchSurfaceResult:
    """We could not interpret it. Never reported as measured absence."""
    return SearchSurfaceResult(
        outcome=OUTCOME_PARSER_ERROR,
        provider_status_code=status,
        raw_payload={"parse_error": reason, "payload": payload},
    )
