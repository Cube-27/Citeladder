"""Pure consumer-answer parsing, independent of AI Overview presence."""

from typing import Any

from app.connectors.answer_engines.contracts import (
    AnswerEngineResponse,
    CitationResult,
    FinishReason,
    SearchEventResult,
)
from app.connectors.answer_engines.errors import ProviderError
from app.connectors.search_surfaces.contracts import RESULT_STILL_PENDING
from app.core.config.dataforseo import STATUS_OK, is_pending_status
from app.core.config.provider_catalog import ERROR_PARSE, measurement_route
from app.domain.source_pages.identity import identify_citation_url


def _objects(value: Any) -> list[dict]:
    return (
        [item for item in value if isinstance(item, dict)]
        if isinstance(value, list)
        else []
    )


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _answer(page: dict) -> str:
    aggregate = _text(page.get("markdown"))
    if aggregate:
        return aggregate
    return "\n\n".join(
        text
        for item in _objects(page.get("items"))
        if (text := _text(item.get("markdown")) or _text(item.get("text")))
    )


def _source_rows(node: dict) -> list[dict]:
    rows = _objects(node.get("sources"))
    for child in _objects(node.get("items")):
        rows.extend(_source_rows(child))
    return rows


def _citations(page: dict) -> tuple[CitationResult, ...]:
    result: list[CitationResult] = []
    seen = set()
    for source in _source_rows(page):
        identity = identify_citation_url(_text(source.get("url")))
        url = identity.canonical_url
        if not url or url in seen:
            continue
        seen.add(url)
        result.append(
            CitationResult(
                ordinal=len(result),
                url=url,
                title=_text(source.get("title")),
                domain=identity.registrable_domain or "",
                start_index=None,
                end_index=None,
                cited_text="",
            )
        )
    return tuple(result)


def _fanouts(page: dict) -> tuple[tuple[SearchEventResult, ...], str]:
    raw = page.get("fan_out_queries")
    if not isinstance(raw, list):
        return (), "unavailable"
    if not raw:
        return (), "no_exposed_queries"
    if not all(isinstance(query, str) and query.strip() for query in raw):
        return (), "unavailable"
    return tuple(
        SearchEventResult(sequence=index, query=query, query_sequence=index)
        for index, query in enumerate(raw)
    ), "queries_available"


def parse_scraper_payload(
    payload: dict,
    *,
    expected_task_id: str,
    logical_engine: str,
) -> AnswerEngineResponse | str:
    if payload.get("status_code") != STATUS_OK:
        raise ProviderError(
            "Scraper response failed", error_code=ERROR_PARSE, retryable=False
        )
    tasks = [
        task
        for task in _objects(payload.get("tasks"))
        if task.get("id") == expected_task_id
    ]
    if len(tasks) != 1:
        raise ProviderError(
            "Scraper task identity is ambiguous",
            error_code=ERROR_PARSE,
            retryable=False,
        )
    task = tasks[0]
    status = task.get("status_code")
    if isinstance(status, int) and is_pending_status(status):
        return RESULT_STILL_PENDING
    pages = _objects(task.get("result"))
    if status != STATUS_OK or len(pages) != 1 or not _answer(pages[0]):
        raise ProviderError(
            "Scraper returned no usable answer", error_code=ERROR_PARSE, retryable=False
        )
    page = pages[0]
    events, availability = _fanouts(page)
    route = measurement_route(logical_engine)
    return AnswerEngineResponse(
        logical_engine=logical_engine,
        transport_provider=route.transport_provider,
        transport_model=route.transport_model,
        answer_text=_answer(page),
        search_used=bool(events or page.get("search_results") or page.get("sources")),
        search_events=events,
        citations=_citations(page),
        finish_reason=FinishReason.STOP,
        provider_metadata={
            "raw_response": payload,
            "provider_reported_model": page.get("model"),
            "fanout_availability": availability,
            "search_results": _objects(page.get("search_results")),
        },
    )
