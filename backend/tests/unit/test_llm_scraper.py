"""Consumer parser and submission boundaries, with no live provider calls."""

from datetime import UTC, datetime

import httpx
import pytest

from app.analysis.search_surfaces.llm_scraper import parse_scraper_payload
from app.connectors.answer_engines.errors import ProviderError
from app.connectors.search_surfaces.contracts import SearchSurfaceRequest
from app.connectors.search_surfaces.dataforseo import DataForSeoSearchSurfaceAdapter
from app.core.config.dataforseo import (
    DataForSeoSettings,
    KeywordTooLongError,
    pack_credential,
)
from app.core.config.llm_scraper import scraper_keyword
from app.domain.audits.errors import AuditValidationError
from app.domain.audits.resolution import _resolve_funded_routes
from app.models.audit import AuditTask
from app.workers.audit.search_surface_support import recovery_deadline


def payload(page, status=20000):
    return {
        "status_code": 20000,
        "tasks": [{"id": "paid", "status_code": status, "cost": 0, "result": [page]}],
    }


@pytest.mark.parametrize("engine", ["chatgpt_search", "gemini_consumer"])
def test_answer_uses_aggregate_once_and_only_sources_are_citations(engine):
    result = parse_scraper_payload(
        payload(
            {
                "markdown": "Acme is a choice.",
                "model": "provider-model",
                "items": [
                    {
                        "markdown": "duplicate",
                        "sources": [{"url": "https://example.com/a#fragment"}],
                    }
                ],
                "sources": [{"url": "https://example.com/a"}],
                "search_results": [{"url": "https://unused.example/b"}],
                "fan_out_queries": ["best options", "best options"],
            }
        ),
        expected_task_id="paid",
        logical_engine=engine,
    )
    assert result.answer_text == "Acme is a choice."
    assert [c.url for c in result.citations] == ["https://example.com/a"]
    assert [e.query for e in result.search_events] == ["best options", "best options"]
    assert result.provider_metadata["provider_reported_model"] == "provider-model"
    assert result.transport_model != "provider-model"


@pytest.mark.parametrize(
    ("field", "state"),
    [
        ({}, "unavailable"),
        ({"fan_out_queries": None}, "unavailable"),
        ({"fan_out_queries": []}, "no_exposed_queries"),
        ({"fan_out_queries": [42]}, "unavailable"),
    ],
)
def test_fallback_answer_and_fanout_availability(field, state):
    result = parse_scraper_payload(
        payload({"items": [{"markdown": "First"}, {"text": "Second"}], **field}),
        expected_task_id="paid",
        logical_engine="gemini_consumer",
    )
    assert result.answer_text == "First\n\nSecond"
    assert result.citations == ()
    assert result.provider_metadata["fanout_availability"] == state
    assert result.search_events == ()


@pytest.mark.parametrize(
    "body",
    [
        payload({}),
        payload({"markdown": "answer"}, 40103),
        {"status_code": 20000, "tasks": []},
    ],
)
def test_unusable_answers_never_become_observations(body):
    with pytest.raises(ProviderError):
        parse_scraper_payload(
            body, expected_task_id="paid", logical_engine="chatgpt_search"
        )


def test_paid_admission_and_recovery_bounds():
    assert scraper_keyword("C++ at 50%") == "C%2B%2B at 50%25"
    with pytest.raises(KeywordTooLongError):
        scraper_keyword("+" * 667)
    with pytest.raises(ValueError):
        DataForSeoSettings(recovery_deadline_hours=30 * 24)
    with pytest.raises(AuditValidationError, match="funded"):
        _resolve_funded_routes(["gemini_consumer"])


@pytest.mark.parametrize(
    ("engine", "bounded"), [("chatgpt_search", True), ("google_ai_overview", False)]
)
def test_recovery_deadline_bounds_only_scraper_tasks(engine, bounded):
    task = AuditTask(
        logical_engine=engine,
        provider_task_submitted_at=datetime(2026, 9, 1, tzinfo=UTC),
        request_snapshot={"recovery_deadline_hours": 24},
    )
    expected = datetime(2026, 9, 2, tzinfo=UTC) if bounded else None
    assert recovery_deadline(task) == expected


@pytest.mark.parametrize("state", ["unavailable", "no_exposed_queries"])
def test_projected_missing_queries_do_not_claim_no_search(state):
    from app.domain.analysis.evidence import _fanout_state

    available, projected = _fanout_state(
        events=[],
        search_used=False,
        search_query_count=0,
        provider_metadata={"fanout_availability": state},
    )
    assert not available
    assert projected == state


def test_consumer_estimate_counts_exact_slots_without_fabricated_token_usage():
    from app.core.config.audits import audit_execution_policy
    from app.domain.audits.cost_estimate import _estimate_engine

    estimate = _estimate_engine(
        "chatgpt_search",
        policy=audit_execution_policy(),
        prompt_count=4,
        repetitions=2,
        per_execution_input=99,
    )
    assert estimate.execution_count == 8
    assert estimate.maximum_attempt_count == 8
    assert estimate.estimated_input_tokens is None
    assert estimate.estimated_search_calls is None
    assert estimate.estimated_total_cost_microusd is None


def test_reconciliation_waits_for_complete_pagination_before_binding(monkeypatch):
    from types import SimpleNamespace

    from app.workers.audit import scraper_reconciliation as recovery

    monkeypatch.setattr(recovery, "RECONCILE_PAGE_SIZE", 1)
    context = SimpleNamespace(submission_ref="exact", logical_engine="chatgpt_search")
    row = {
        "id": "paid",
        "cost": 0.004,
        "metadata": {
            "tag": "exact",
            "api": "ai_optimization",
            "se": "chat_gpt",
            "function": "llm_scraper",
        },
    }
    first = {"status_code": 20000, "tasks": [{"status_code": 20000, "result": [row]}]}
    state, match = recovery.reconcile_page(first, context, {"upper": "frozen"})
    assert match is None
    assert state["offset"] == 1
    complete = {"status_code": 20000, "tasks": [{"status_code": 20000, "result": []}]}
    _, match = recovery.reconcile_page(complete, context, state)
    assert match == {"id": "paid", "cost": 4000}
    first["tasks"][0]["result"][0] = {**row, "id": "duplicate"}
    state, match = recovery.reconcile_page(first, context, state)
    assert state["ambiguous"]
    assert match is None


def test_reconciliation_binds_a_unique_match_at_the_page_bound(monkeypatch):
    from types import SimpleNamespace

    from app.workers.audit import scraper_reconciliation as recovery

    monkeypatch.setattr(recovery, "RECONCILE_PAGE_SIZE", 1)
    monkeypatch.setattr(recovery, "RECONCILE_MAX_PAGES", 1)
    context = SimpleNamespace(submission_ref="exact", logical_engine="gemini_consumer")
    metadata = {"tag": "exact", "api": "ai_optimization", "se": "gemini"}
    row = {
        "id": "paid",
        "cost": 0.002,
        "metadata": {**metadata, "function": "llm_scraper"},
    }
    full = {"status_code": 20000, "tasks": [{"status_code": 20000, "result": [row]}]}
    _, match = recovery.reconcile_page(full, context, {})
    assert match == {"id": "paid", "cost": 2000}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("engine", "product"),
    [("chatgpt_search", "chat_gpt"), ("gemini_consumer", "gemini")],
)
async def test_submit_product_specific_standard_request(engine, product):
    import json

    seen = []

    async def handler(request):
        seen.append((request.url.path, json.loads(request.content)))
        return httpx.Response(
            200,
            json={
                "status_code": 20000,
                "tasks": [{"id": "paid", "status_code": 20100, "cost": 0.004}],
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        adapter = DataForSeoSearchSurfaceAdapter(
            secret=pack_credential(login="test", password="test"),
            client=client,
            logical_engine=engine,
        )
        result = await adapter.submit(
            SearchSurfaceRequest(
                query="C++ 50%",
                location_code=2840,
                language_code="en",
                device="desktop",
                depth=10,
                load_async_ai_overview=True,
                timeout_seconds=1,
                provider_submission_ref="exact-tag",
            )
        )
    path, body = seen[0]
    assert path == f"/v3/ai_optimization/{product}/llm_scraper/task_post"
    assert body == [
        {
            "keyword": "C%2B%2B 50%25",
            "location_code": 2840,
            "language_code": "en",
            "tag": "exact-tag",
            "priority": 1,
            **({"force_web_search": True} if engine == "chatgpt_search" else {}),
        }
    ]
    assert result.provider_cost_microusd == 4000
