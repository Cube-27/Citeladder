"""Answer-engine adapter unit tests for the active direct transports.

Covers the adapter acceptance for the v2 direct-provider matrix: OpenAI direct
(``openai`` transport → ChatGPT, Responses API + web-search grounding), Gemini
direct (``google``), and Claude direct (``anthropic``). Each parser assertion
checks the recorded provenance triple — ``logical_engine`` +
``transport_provider`` + ``transport_model`` (invariant 10). HTTP transports are
mocked; no real API spend. Retired transports have no adapter; their rejection
is covered by the factory/worker/API tests.
"""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest

from app.connectors.answer_engines.anthropic import (
    AnthropicAnswerEngineAdapter,
    _raise_for_search_error,
)
from app.connectors.answer_engines.anthropic import (
    _payload as anthropic_payload,
)
from app.connectors.answer_engines.anthropic_parser import (
    map_anthropic_finish_reason,
    parse_anthropic_message,
)
from app.connectors.answer_engines.contracts import (
    AnswerEngineRequest,
    FinishReason,
)
from app.connectors.answer_engines.errors import ProviderError, safe_error_detail
from app.connectors.answer_engines.gemini import GeminiAnswerEngineAdapter
from app.connectors.answer_engines.gemini import _build_payload as gemini_payload
from app.connectors.answer_engines.gemini_parser import (
    map_gemini_finish_reason,
    parse_interaction,
)
from app.connectors.answer_engines.openai import OpenAIAnswerEngineAdapter
from app.connectors.answer_engines.openai import _payload as openai_payload
from app.connectors.answer_engines.openai_parser import (
    map_openai_finish_reason,
    parse_openai_response,
)
from app.core.config.provider_catalog import (
    REASONING_EFFORT_OFF,
    REASONING_EFFORT_UNVERIFIED,
    is_reasoning_pinned_off,
    provider_catalog_settings,
    route_policy,
)
from app.domain.audits.cost_projection import _extract_usage

_FIXTURE_DIR = Path(__file__).resolve().parent.parent / "fixtures"


def _load_fixture(name: str) -> dict:
    return json.loads((_FIXTURE_DIR / name).read_text())


def _mock_transport(payload: dict, status_code: int = 200) -> httpx.MockTransport:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code, json=payload)

    return httpx.MockTransport(handler)


# ---------------------------------------------------------------------------
# Gemini direct (google transport) — NEW coverage
# ---------------------------------------------------------------------------
_GEMINI_GROUNDED = {
    "id": "int_1",
    "status": "completed",
    "model": "gemini-flash-latest",
    "usage": {"total_tokens": 120},
    "steps": [
        {"type": "thought", "signature": "drop-me"},
        {
            "type": "google_search_call",
            "id": "call_1",
            "arguments": {"queries": ["best running shoes australia"]},
        },
        {"type": "google_search_result"},
        {
            "type": "model_output",
            "content": [
                {
                    "type": "text",
                    "text": "Brooks is a strong pick for road running.",
                    "annotations": [
                        {
                            "type": "url_citation",
                            "url": "https://grounding-api-redirect/xyz",
                            "title": "runnersworld.com",
                            "start_index": 0,
                            "end_index": 6,
                        }
                    ],
                }
            ],
        },
    ],
}


def test_gemini_parser_grounding_citations_and_provenance() -> None:
    result = parse_interaction(
        _GEMINI_GROUNDED,
        logical_engine="gemini",
        transport_provider="google",
        model="gemini-flash-latest",
        latency_ms=42,
    )
    # Provenance triple (invariant 10).
    assert result.logical_engine == "gemini"
    assert result.transport_provider == "google"
    assert result.transport_model == "gemini-flash-latest"
    # Grounding + citation parsing.
    assert result.search_used is True
    assert len(result.search_events) == 1
    assert result.search_events[0].query == "best running shoes australia"
    assert len(result.citations) == 1
    citation = result.citations[0]
    # Domain is derived from the title (the url is a redirect).
    assert citation.domain == "runnersworld.com"
    assert citation.cited_text == "Brooks"
    # Thought steps are dropped from the answer text.
    assert result.answer_text == "Brooks is a strong pick for road running."


def test_gemini_parser_no_search_is_valid_result() -> None:
    payload = {
        "model": "gemini-flash-latest",
        "steps": [
            {
                "type": "model_output",
                "content": [{"type": "text", "text": "From memory: A, B."}],
            }
        ],
    }
    result = parse_interaction(
        payload,
        logical_engine="gemini",
        transport_provider="google",
        model="gemini-flash-latest",
        latency_ms=1,
    )
    assert result.search_used is False
    assert result.citations == ()
    assert result.answer_text == "From memory: A, B."


def test_gemini_parser_queries_as_bare_string_not_split_per_char() -> None:
    payload = {
        "model": "gemini-flash-latest",
        "steps": [
            {
                "type": "google_search_call",
                "id": "gs_1",
                # A malformed payload: queries is a bare string, and args is
                # exercised as a dict. Must not split per-character or crash.
                "arguments": {"queries": "nike running shoes"},
            },
            {
                "type": "model_output",
                "content": [{"type": "text", "text": "Answer."}],
            },
        ],
    }
    result = parse_interaction(
        payload,
        logical_engine="gemini",
        transport_provider="google",
        model="gemini-flash-latest",
        latency_ms=1,
    )
    # The bare string yields no per-character queries.
    assert all(len(e.query) != 1 for e in result.search_events)
    assert not any(e.query for e in result.search_events)


def test_gemini_parser_tolerates_non_dict_arguments() -> None:
    payload = {
        "model": "gemini-flash-latest",
        "steps": [
            {"type": "google_search_call", "id": "gs_1", "arguments": "oops"},
            {
                "type": "model_output",
                "content": [{"type": "text", "text": "Answer."}],
            },
        ],
    }
    # Must not raise on a non-dict arguments field.
    result = parse_interaction(
        payload,
        logical_engine="gemini",
        transport_provider="google",
        model="gemini-flash-latest",
        latency_ms=1,
    )
    assert result.answer_text == "Answer."


async def test_gemini_adapter_executes_and_records_provenance() -> None:
    adapter = GeminiAnswerEngineAdapter(api_key="secret-google-key")
    transport = _mock_transport(_GEMINI_GROUNDED)
    request = AnswerEngineRequest(
        prompt="running shoes",
        system_instruction="",
        model="gemini-flash-latest",
        timeout_seconds=5,
    )
    adapter = GeminiAnswerEngineAdapter(
        api_key="k", client=httpx.AsyncClient(transport=transport)
    )
    result = await adapter.execute(request)
    assert result.transport_provider == "google"
    assert result.logical_engine == "gemini"
    assert result.search_used is True


async def test_gemini_adapter_maps_http_error() -> None:
    transport = _mock_transport({"error": {"status": "RESOURCE_EXHAUSTED"}}, 429)
    adapter = GeminiAnswerEngineAdapter(
        api_key="k", client=httpx.AsyncClient(transport=transport)
    )
    with pytest.raises(ProviderError) as excinfo:
        await adapter.execute(
            AnswerEngineRequest(
                prompt="x",
                system_instruction="",
                model="gemini-flash-latest",
                timeout_seconds=5,
            )
        )
    assert excinfo.value.error_code == "rate_limit"
    assert excinfo.value.retryable is True


def test_gemini_adapter_requires_key() -> None:
    with pytest.raises(ProviderError) as excinfo:
        GeminiAnswerEngineAdapter(api_key="")
    assert excinfo.value.error_code == "auth_failure"


# ---------------------------------------------------------------------------
# Claude direct (anthropic transport)
# ---------------------------------------------------------------------------
def test_anthropic_payload_uses_native_web_search_and_top_level_system() -> None:
    request = AnswerEngineRequest(
        prompt="cheap baby clothes",
        system_instruction="Answer for Australia.",
        model="claude-sonnet-4-6",
        timeout_seconds=30,
    )
    payload = anthropic_payload(request, country_code="AU")
    assert payload["system"] == "Answer for Australia."
    assert payload["messages"] == [{"role": "user", "content": "cheap baby clothes"}]
    tool = payload["tools"][0]
    assert tool["type"] == "web_search_20250305"
    assert tool["name"] == "web_search"
    assert tool["user_location"] == {"type": "approximate", "country": "AU"}


def test_anthropic_payload_omits_system_and_location_when_absent() -> None:
    request = AnswerEngineRequest(
        prompt="school uniforms",
        system_instruction="",
        model="claude-sonnet-4-6",
        timeout_seconds=30,
    )
    payload = anthropic_payload(request, country_code="")
    assert "system" not in payload
    assert "user_location" not in payload["tools"][0]


def test_anthropic_parser_extracts_answer_citations_and_provenance() -> None:
    payload = {
        "id": "msg_1",
        "type": "message",
        "model": "claude-sonnet-4-6",
        "stop_reason": "end_turn",
        "content": [
            {"type": "text", "text": "Let me search."},
            {
                "type": "server_tool_use",
                "id": "srvtoolu_1",
                "name": "web_search",
                "input": {"query": "affordable baby clothes australia"},
            },
            {
                "type": "text",
                "text": "Best&Less is a great option.",
                "citations": [
                    {
                        "type": "web_search_result_location",
                        "url": "https://www.bestandless.com.au/baby",
                        "title": "Best&Less baby",
                        "cited_text": "Best&Less baby clothing from $5",
                    }
                ],
            },
        ],
        "usage": {
            "input_tokens": 40,
            "output_tokens": 60,
            "server_tool_use": {"web_search_requests": 1},
        },
    }
    result = parse_anthropic_message(
        payload,
        logical_engine="claude",
        transport_provider="anthropic",
        requested_model="claude-sonnet-4-6",
        latency_ms=12,
    )
    assert result.logical_engine == "claude"
    assert result.transport_provider == "anthropic"
    assert result.transport_model == "claude-sonnet-4-6"
    assert result.answer_text == "Let me search.\n\nBest&Less is a great option."
    assert result.search_used is True
    assert result.search_events[0].query == "affordable baby clothes australia"
    assert result.provider_metadata["query_text_available"] is True
    assert result.citations[0].domain == "bestandless.com.au"
    assert result.citations[0].cited_text == "Best&Less baby clothing from $5"
    assert result.normalized_usage.total_tokens == 100
    assert result.normalized_usage.web_search_requests == 1


def test_anthropic_safe_error_detail_extracts_type_and_message() -> None:
    body = {
        "type": "error",
        "error": {
            "type": "invalid_request_error",
            "message": "Your credit balance is too low to access the API.",
        },
    }
    assert safe_error_detail(body) == (
        "invalid_request_error: Your credit balance is too low to access the API."
    )
    # Malformed / empty bodies degrade to an empty string, never raise.
    assert safe_error_detail({}) == ""
    assert safe_error_detail({"error": "not-a-dict"}) == ""
    # Non-dict top-level payloads degrade the same way.
    assert safe_error_detail([]) == ""
    assert safe_error_detail("oops") == ""
    # Oversized messages are length-capped.
    long_body = {"error": {"type": "api_error", "message": "x" * 10_000}}
    assert len(safe_error_detail(long_body)) < 300


async def test_anthropic_http_error_surfaces_safe_detail() -> None:
    error_body = {
        "type": "error",
        "error": {
            "type": "invalid_request_error",
            "message": "Your credit balance is too low to access the API.",
        },
    }
    transport = _mock_transport(error_body, status_code=400)
    adapter = AnthropicAnswerEngineAdapter(
        api_key="secret-anthropic-key",
        client=httpx.AsyncClient(transport=transport),
    )
    with pytest.raises(ProviderError) as excinfo:
        await adapter.execute(
            AnswerEngineRequest(
                prompt="x",
                system_instruction="",
                model="claude-sonnet-4-6",
                timeout_seconds=5,
            )
        )
    assert "HTTP 400" in str(excinfo.value)
    assert "credit balance is too low" in str(excinfo.value)
    assert excinfo.value.retryable is False


def test_anthropic_search_error_raises_only_for_retryable_codes() -> None:
    rate_limited = {
        "content": [
            {
                "type": "web_search_tool_result",
                "content": {
                    "type": "web_search_tool_result_error",
                    "error_code": "too_many_requests",
                },
            }
        ]
    }
    with pytest.raises(ProviderError) as excinfo:
        _raise_for_search_error(rate_limited)
    assert excinfo.value.retryable is True

    capped = {
        "content": [
            {
                "type": "web_search_tool_result",
                "content": {
                    "type": "web_search_tool_result_error",
                    "error_code": "max_uses_exceeded",
                },
            }
        ]
    }
    _raise_for_search_error(capped)  # must not raise


async def test_anthropic_adapter_executes_and_records_provenance() -> None:
    payload = {
        "id": "msg_2",
        "model": "claude-sonnet-4-6",
        "content": [{"type": "text", "text": "ok"}],
        "usage": {"input_tokens": 1, "output_tokens": 1},
    }
    transport = _mock_transport(payload)
    adapter = AnthropicAnswerEngineAdapter(
        api_key="secret-anthropic-key",
        client=httpx.AsyncClient(transport=transport),
    )
    result = await adapter.execute(
        AnswerEngineRequest(
            prompt="x",
            system_instruction="",
            model="claude-sonnet-4-6",
            timeout_seconds=5,
        )
    )
    assert result.transport_provider == "anthropic"
    assert result.logical_engine == "claude"
    assert result.transport_model == "claude-sonnet-4-6"


# ---------------------------------------------------------------------------
# OpenAI direct (openai transport → chatgpt) — v2 direct-provider matrix
# ---------------------------------------------------------------------------
def test_openai_payload_is_stateless_brand_free_with_country() -> None:
    request = AnswerEngineRequest(
        prompt="cheap baby clothes",
        system_instruction="Answer for Australia.",
        model="gpt-5.4",
        timeout_seconds=30,
    )
    payload = openai_payload(request, country_code="AU")
    # Only the user prompt goes in ``input``; no brand/competitor/domain list.
    assert payload["input"] == "cheap baby clothes"
    assert payload["instructions"] == "Answer for Australia."
    assert payload["model"] == "gpt-5.4"
    assert payload["store"] is False
    assert "max_output_tokens" in payload
    tool = payload["tools"][0]
    assert tool["type"] == "web_search"
    assert tool["user_location"] == {"type": "approximate", "country": "AU"}
    # The request body must never carry a credential.
    assert "api_key" not in payload
    assert "Authorization" not in payload


def test_openai_payload_omits_instructions_and_location_when_absent() -> None:
    request = AnswerEngineRequest(
        prompt="school uniforms",
        system_instruction="",
        model="gpt-5.4",
        timeout_seconds=30,
    )
    payload = openai_payload(request, country_code="")
    assert "instructions" not in payload
    assert "user_location" not in payload["tools"][0]


def test_openai_parser_grounded_fixture_provenance_and_citations() -> None:
    result = parse_openai_response(
        _load_fixture("openai_responses_grounded.json"),
        logical_engine="chatgpt",
        transport_provider="openai",
        requested_model="gpt-5.4",
        latency_ms=15,
    )
    # Provenance triple (invariant 10): chatgpt via openai.
    assert result.logical_engine == "chatgpt"
    assert result.transport_provider == "openai"
    assert result.transport_model == "gpt-5.4"
    assert result.search_used is True
    # Two search calls: one single query + one call with two queries → 3 events.
    assert len(result.search_events) == 3
    assert result.search_events[0].query == "affordable baby clothes australia"
    assert result.search_events[1].query == "cheap kids clothing sale"
    assert result.search_events[2].query == "best value baby onesies au"
    # The two-query call shares one call id / call_sequence.
    assert result.search_events[1].call_sequence == 1
    assert result.search_events[2].call_sequence == 1
    assert result.search_events[1].query_sequence == 0
    assert result.search_events[2].query_sequence == 1
    # Citation offsets → cited_text; domain normalized from the url host.
    citation = result.citations[0]
    assert citation.domain == "bestandless.com.au"
    assert citation.cited_text == "Best&Less"
    assert citation.start_index == 0
    assert citation.end_index == 9
    assert result.normalized_usage.web_search_requests == 2
    assert result.normalized_usage.total_tokens == 100


def test_openai_parser_no_search_fixture_is_valid_result() -> None:
    result = parse_openai_response(
        _load_fixture("openai_responses_no_search.json"),
        logical_engine="chatgpt",
        transport_provider="openai",
        requested_model="gpt-5.4",
        latency_ms=3,
    )
    assert result.search_used is False
    assert result.search_events == ()
    assert result.citations == ()
    assert result.answer_text == "From memory: options include A and B."


async def test_openai_http_error_surfaces_safe_detail() -> None:
    error_body = {
        "error": {
            "type": "insufficient_quota",
            "message": "You exceeded your current quota, please check your plan.",
        }
    }
    transport = _mock_transport(error_body, status_code=429)
    adapter = OpenAIAnswerEngineAdapter(
        api_key="secret-openai-key",
        client=httpx.AsyncClient(transport=transport),
    )
    with pytest.raises(ProviderError) as excinfo:
        await adapter.execute(
            AnswerEngineRequest(
                prompt="x",
                system_instruction="",
                model="gpt-5.4",
                timeout_seconds=5,
            )
        )
    assert "HTTP 429" in str(excinfo.value)
    assert "exceeded your current quota" in str(excinfo.value)
    assert excinfo.value.retryable is True


def test_openai_parser_count_only_call_preserves_empty_query() -> None:
    payload = {
        "model": "gpt-5.4",
        "output": [
            {
                "type": "web_search_call",
                "id": "ws_1",
                "status": "completed",
                "action": {"type": "search"},
            },
            {
                "type": "message",
                "id": "msg_1",
                "content": [{"type": "output_text", "text": "Answer."}],
            },
        ],
        "usage": {"input_tokens": 1, "output_tokens": 1, "total_tokens": 2},
    }
    result = parse_openai_response(
        payload,
        logical_engine="chatgpt",
        transport_provider="openai",
        requested_model="gpt-5.4",
        latency_ms=1,
    )
    # A search happened but no query text — count-only, never invented.
    assert result.search_used is True
    assert len(result.search_events) == 1
    assert result.search_events[0].query == ""
    assert result.normalized_usage.web_search_requests == 1
    assert result.provider_metadata["query_text_available"] is False


def test_openai_parser_drops_reasoning_and_redacts_metadata() -> None:
    result = parse_openai_response(
        _load_fixture("openai_responses_grounded.json"),
        logical_engine="chatgpt",
        transport_provider="openai",
        requested_model="gpt-5.4",
        latency_ms=1,
    )
    meta = result.provider_metadata
    # Reasoning content is never retained in the evidence envelope.
    for item in meta["evidence_items"]:
        assert item["type"] != "reasoning"
    # No credentials / raw headers / request echo in metadata.
    serialized = json.dumps(meta)
    assert "Authorization" not in serialized
    assert "Bearer" not in serialized
    assert "api_key" not in serialized


def test_openai_parser_prefers_provider_returned_model() -> None:
    payload = {
        "model": "gpt-5.4-2026",
        "output": [
            {
                "type": "message",
                "id": "m",
                "content": [{"type": "output_text", "text": "ok"}],
            }
        ],
    }
    result = parse_openai_response(
        payload,
        logical_engine="chatgpt",
        transport_provider="openai",
        requested_model="gpt-5.4",
        latency_ms=1,
    )
    assert result.transport_model == "gpt-5.4-2026"


def test_openai_adapter_requires_key() -> None:
    with pytest.raises(ProviderError) as excinfo:
        OpenAIAnswerEngineAdapter(api_key="")
    assert excinfo.value.error_code == "auth_failure"
    assert excinfo.value.retryable is False


async def test_openai_adapter_sends_bearer_auth_only_and_records_provenance() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["auth"] = request.headers.get("Authorization")
        captured["body"] = json.loads(request.content.decode())
        return httpx.Response(200, json=_load_fixture("openai_responses_grounded.json"))

    transport = httpx.MockTransport(handler)
    adapter = OpenAIAnswerEngineAdapter(
        api_key="test-fake-openai-key",
        country_code="AU",
        client=httpx.AsyncClient(transport=transport),
    )
    result = await adapter.execute(
        AnswerEngineRequest(
            prompt="running shoes",
            system_instruction="",
            model="gpt-5.4",
            timeout_seconds=5,
        )
    )
    # BYOK key travels only in the Authorization header, never the body.
    assert captured["auth"] == "Bearer test-fake-openai-key"
    body = captured["body"]
    assert isinstance(body, dict)
    assert "test-fake-openai-key" not in json.dumps(body)
    assert body["tools"][0]["user_location"]["country"] == "AU"
    assert result.logical_engine == "chatgpt"
    assert result.transport_provider == "openai"
    assert result.search_used is True


async def test_openai_adapter_maps_http_status_to_error_code() -> None:
    transport = _mock_transport({"error": {"message": "rate limited"}}, 429)
    adapter = OpenAIAnswerEngineAdapter(
        api_key="k", client=httpx.AsyncClient(transport=transport)
    )
    with pytest.raises(ProviderError) as excinfo:
        await adapter.execute(
            AnswerEngineRequest(
                prompt="x",
                system_instruction="",
                model="gpt-5.4",
                timeout_seconds=5,
            )
        )
    assert excinfo.value.error_code == "rate_limit"
    assert excinfo.value.retryable is True


async def test_openai_adapter_maps_timeout() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow")

    transport = httpx.MockTransport(handler)
    adapter = OpenAIAnswerEngineAdapter(
        api_key="k",
        client=httpx.AsyncClient(transport=transport),
    )
    with pytest.raises(ProviderError) as excinfo:
        await adapter.execute(
            AnswerEngineRequest(
                prompt="x",
                system_instruction="",
                model="gpt-5.4",
                timeout_seconds=1,
            )
        )
    assert excinfo.value.error_code == "timeout"
    assert excinfo.value.retryable is True


def test_annotation_offset_falls_through_to_alternate_casing() -> None:
    from app.connectors.answer_engines.normalization import annotation_offset

    # Primary snake_case key is present but non-integer; must fall through to
    # the valid camelCase key rather than returning None immediately.
    annotation = {"start_index": "not-a-number", "startIndex": 7}
    assert annotation_offset(annotation, "start_index", "startIndex") == 7
    # All candidates invalid -> None.
    assert annotation_offset({"start_index": "x"}, "start_index") is None


def test_coerce_int_is_tolerant() -> None:
    from app.connectors.answer_engines.normalization import coerce_int

    assert coerce_int("unknown") == 0
    assert coerce_int({"raw": 10}) == 0
    assert coerce_int(None, 5) == 5
    assert coerce_int("42") == 42
    assert coerce_int(3.9) == 3
    # Non-finite floats (e.g. from ``Infinity`` in a lenient JSON payload) raise
    # OverflowError inside int(); must degrade to the default rather than crash.
    assert coerce_int(float("inf")) == 0
    assert coerce_int(float("nan"), 7) == 7


def test_openai_parser_queries_as_bare_string_not_split_per_char() -> None:
    payload = {
        "model": "gpt-5.4",
        "output": [
            {
                "type": "web_search_call",
                "id": "ws_1",
                "status": "completed",
                # A provider/proxy returns a bare string instead of a list.
                "action": {"type": "search", "queries": "nike running shoes"},
            },
            {
                "type": "message",
                "id": "msg_1",
                "content": [{"type": "output_text", "text": "Answer."}],
            },
        ],
        "usage": {"input_tokens": 1, "output_tokens": 1, "total_tokens": 2},
    }
    result = parse_openai_response(
        payload,
        logical_engine="chatgpt",
        transport_provider="openai",
        requested_model="gpt-5.4",
        latency_ms=1,
    )
    # The string must NOT be split into per-character queries.
    assert result.search_used is True
    assert len(result.search_events) == 1
    assert result.search_events[0].query == ""
    assert all(len(e.query) != 1 for e in result.search_events)


def test_openai_parser_tolerates_non_numeric_usage_tokens() -> None:
    payload = {
        "model": "gpt-5.4",
        "output": [
            {
                "type": "message",
                "id": "msg_1",
                "content": [{"type": "output_text", "text": "Answer."}],
            }
        ],
        "usage": {
            "input_tokens": "unknown",
            "output_tokens": {"raw": 10},
            "total_tokens": None,
        },
    }
    # Must not raise; malformed usage degrades to UNKNOWN (null), never to a
    # fabricated zero that would be indistinguishable from a real zero.
    result = parse_openai_response(
        payload,
        logical_engine="chatgpt",
        transport_provider="openai",
        requested_model="gpt-5.4",
        latency_ms=1,
    )
    assert result.normalized_usage.uncached_input_tokens is None
    assert result.normalized_usage.output_tokens is None
    assert result.normalized_usage.total_tokens is None


# ---------------------------------------------------------------------------
# T3 — frozen request policy drives tools / caps / reasoning (invariant 9)
# ---------------------------------------------------------------------------
def _request(**overrides) -> AnswerEngineRequest:
    """A frozen request with the pre-T3 defaults, overridable per assertion."""
    fields: dict = {
        "prompt": "cheap baby clothes",
        "system_instruction": "",
        "model": "gpt-5.4",
        "timeout_seconds": 30,
    }
    fields.update(overrides)
    return AnswerEngineRequest(**fields)


def test_openai_payload_omits_search_tools_for_pulse() -> None:
    payload = openai_payload(
        _request(retrieval_enabled=False, max_output_tokens=600), country_code="AU"
    )
    # Pulse mode is cheap precisely because no retrieval tool is attached.
    assert "tools" not in payload
    assert payload["max_output_tokens"] == 600


def test_openai_payload_includes_search_tools_for_benchmark() -> None:
    payload = openai_payload(
        _request(retrieval_enabled=True, max_output_tokens=4096), country_code="AU"
    )
    assert payload["tools"][0]["type"] == "web_search"
    assert payload["max_output_tokens"] == 4096


def test_openai_payload_cap_falls_back_to_config_when_unsupplied() -> None:
    payload = openai_payload(_request(), country_code="")
    assert payload["max_output_tokens"] == provider_catalog_settings.max_output_tokens


def test_openai_payload_pins_reasoning_off() -> None:
    # The chatgpt/openai route pins reasoning OFF, and the pin must be STATED:
    # omitting the key lets the model's own default effort apply, which is not
    # none.
    policy = route_policy("chatgpt", "openai")
    assert policy.reasoning_effort == REASONING_EFFORT_OFF
    payload = openai_payload(
        _request(reasoning_effort=policy.reasoning_effort), country_code=""
    )
    assert payload["reasoning"] == {"effort": "none"}


def test_openai_payload_sends_no_reasoning_control_when_unpinned() -> None:
    # The adapter must still never invent a value for an unpinned route.
    payload = openai_payload(
        _request(reasoning_effort=REASONING_EFFORT_UNVERIFIED), country_code=""
    )
    assert "reasoning" not in payload


def test_anthropic_payload_omits_search_tools_for_pulse() -> None:
    payload = anthropic_payload(
        _request(
            model="claude-sonnet-4-6", retrieval_enabled=False, max_output_tokens=600
        ),
        country_code="AU",
    )
    assert "tools" not in payload
    assert payload["max_tokens"] == 600


def test_anthropic_payload_includes_search_tools_for_benchmark() -> None:
    payload = anthropic_payload(
        _request(
            model="claude-sonnet-4-6", retrieval_enabled=True, max_output_tokens=4096
        ),
        country_code="AU",
    )
    assert payload["tools"][0]["name"] == "web_search"
    assert payload["max_tokens"] == 4096


def test_anthropic_payload_disables_thinking_when_pinned_off() -> None:
    # The claude/anthropic route pins reasoning OFF, so thinking is explicitly
    # disabled on the wire.
    assert is_reasoning_pinned_off("claude", "anthropic")
    policy = route_policy("claude", "anthropic")
    assert policy.reasoning_effort == REASONING_EFFORT_OFF
    payload = anthropic_payload(
        _request(model="claude-sonnet-4-6", reasoning_effort=policy.reasoning_effort),
        country_code="",
    )
    assert payload["thinking"] == {"type": "disabled"}
    # No pin supplied (pre-T3 construction site) => no thinking key invented.
    assert "thinking" not in anthropic_payload(
        _request(model="claude-sonnet-4-6"), country_code=""
    )


def test_gemini_payload_omits_grounding_tools_for_pulse() -> None:
    payload = gemini_payload(
        _request(
            model="gemini-flash-latest",
            retrieval_enabled=False,
            max_output_tokens=600,
        )
    )
    assert "tools" not in payload
    assert payload["max_output_tokens"] == 600


def test_gemini_payload_includes_grounding_tools_for_benchmark() -> None:
    payload = gemini_payload(
        _request(
            model="gemini-flash-latest",
            retrieval_enabled=True,
            max_output_tokens=4096,
        )
    )
    assert payload["tools"] == [{"type": "google_search"}]
    assert payload["max_output_tokens"] == 4096


def test_gemini_payload_pins_thinking_off() -> None:
    policy = route_policy("gemini", "google")
    assert policy.reasoning_effort == REASONING_EFFORT_OFF
    payload = gemini_payload(
        _request(
            model="gemini-2.5-flash-lite", reasoning_effort=policy.reasoning_effort
        )
    )
    assert payload["thinking_config"] == {"thinking_budget": 0}


def test_gemini_payload_sends_no_thinking_control_when_unpinned() -> None:
    payload = gemini_payload(
        _request(
            model="gemini-2.5-flash-lite",
            reasoning_effort=REASONING_EFFORT_UNVERIFIED,
        )
    )
    assert "thinking" not in payload
    assert "thinking_config" not in payload


async def test_openai_adapter_sends_the_frozen_cap_and_no_tools_for_pulse() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content.decode())
        return httpx.Response(
            200, json=_load_fixture("openai_responses_no_search.json")
        )

    adapter = OpenAIAnswerEngineAdapter(
        api_key="k",
        country_code="AU",
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )
    await adapter.execute(
        _request(retrieval_enabled=False, max_output_tokens=600, timeout_seconds=30)
    )
    body = captured["body"]
    assert isinstance(body, dict)
    # The EXACT frozen cap reaches the provider, and no retrieval tool does.
    assert body["max_output_tokens"] == 600
    assert "tools" not in body


# ---------------------------------------------------------------------------
# T3 — finish-reason mapping (every listed mapping + unrecognized fallback)
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("end_turn", FinishReason.STOP),
        ("stop_sequence", FinishReason.STOP),
        ("max_tokens", FinishReason.LENGTH),
        ("refusal", FinishReason.CONTENT_FILTER),
        ("pause_turn", FinishReason.UNKNOWN),
        ("tool_use", FinishReason.UNKNOWN),
        ("something_new", FinishReason.UNKNOWN),
        ("", FinishReason.UNKNOWN),
        (None, FinishReason.UNKNOWN),
    ],
)
def test_map_anthropic_finish_reason(raw: object, expected: FinishReason) -> None:
    assert map_anthropic_finish_reason(raw) is expected


@pytest.mark.parametrize(
    ("payload", "expected"),
    [
        ({"status": "completed"}, FinishReason.STOP),
        ({"status": "failed"}, FinishReason.ERROR),
        ({"status": "cancelled"}, FinishReason.CANCELLED),
        # incomplete_details WINS over the status where supplied.
        (
            {
                "status": "incomplete",
                "incomplete_details": {"reason": "max_output_tokens"},
            },
            FinishReason.LENGTH,
        ),
        (
            {
                "status": "completed",
                "incomplete_details": {"reason": "content_filter"},
            },
            FinishReason.CONTENT_FILTER,
        ),
        # An incomplete status with no reason is not guessed at.
        ({"status": "incomplete"}, FinishReason.UNKNOWN),
        ({"status": "in_progress"}, FinishReason.UNKNOWN),
        ({"incomplete_details": {"reason": "brand_new"}}, FinishReason.UNKNOWN),
        ({}, FinishReason.UNKNOWN),
    ],
)
def test_map_openai_finish_reason(payload: dict, expected: FinishReason) -> None:
    assert map_openai_finish_reason(payload) is expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("STOP", FinishReason.STOP),
        ("MAX_TOKENS", FinishReason.LENGTH),
        ("SAFETY", FinishReason.CONTENT_FILTER),
        ("RECITATION", FinishReason.CONTENT_FILTER),
        ("OTHER", FinishReason.ERROR),
        ("MALFORMED_FUNCTION_CALL", FinishReason.ERROR),
        ("FINISH_REASON_UNSPECIFIED", FinishReason.UNKNOWN),
        ("something_new", FinishReason.UNKNOWN),
        ("", FinishReason.UNKNOWN),
        (None, FinishReason.UNKNOWN),
    ],
)
def test_map_gemini_finish_reason(raw: object, expected: FinishReason) -> None:
    assert map_gemini_finish_reason(raw) is expected


def test_anthropic_parser_maps_and_preserves_raw_finish_reason() -> None:
    result = parse_anthropic_message(
        {"model": "claude-sonnet-4-6", "stop_reason": "max_tokens", "content": []},
        logical_engine="claude",
        transport_provider="anthropic",
        requested_model="claude-sonnet-4-6",
        latency_ms=1,
    )
    assert result.finish_reason is FinishReason.LENGTH
    # The RAW provider token survives on the response and in metadata.
    assert result.raw_finish_reason == "max_tokens"
    assert result.provider_metadata["raw_finish_reason"] == "max_tokens"
    assert result.provider_metadata["stop_reason"] == "max_tokens"


def test_openai_parser_maps_and_preserves_raw_finish_reason() -> None:
    result = parse_openai_response(
        {
            "model": "gpt-5.4",
            "status": "incomplete",
            "incomplete_details": {"reason": "max_output_tokens"},
            "output": [],
        },
        logical_engine="chatgpt",
        transport_provider="openai",
        requested_model="gpt-5.4",
        latency_ms=1,
    )
    assert result.finish_reason is FinishReason.LENGTH
    assert result.raw_finish_reason == "max_output_tokens"
    assert result.provider_metadata["raw_finish_reason"] == "max_output_tokens"
    # Grounded fixture: a plain completed status maps to stop.
    completed = parse_openai_response(
        _load_fixture("openai_responses_grounded.json"),
        logical_engine="chatgpt",
        transport_provider="openai",
        requested_model="gpt-5.4",
        latency_ms=1,
    )
    assert completed.finish_reason is FinishReason.STOP
    assert completed.raw_finish_reason == "completed"


def test_gemini_parser_maps_and_preserves_raw_finish_reason() -> None:
    result = parse_interaction(
        {"model": "gemini-flash-latest", "finish_reason": "SAFETY", "steps": []},
        logical_engine="gemini",
        transport_provider="google",
        model="gemini-flash-latest",
        latency_ms=1,
    )
    assert result.finish_reason is FinishReason.CONTENT_FILTER
    assert result.raw_finish_reason == "SAFETY"
    assert result.provider_metadata["raw_finish_reason"] == "SAFETY"
    # The candidates shape is read too, and an unknown token stays unknown.
    candidate = parse_interaction(
        {
            "model": "gemini-flash-latest",
            "candidates": [{"finishReason": "MAX_TOKENS"}],
            "steps": [],
        },
        logical_engine="gemini",
        transport_provider="google",
        model="gemini-flash-latest",
        latency_ms=1,
    )
    assert candidate.finish_reason is FinishReason.LENGTH
    assert candidate.raw_finish_reason == "MAX_TOKENS"


# ---------------------------------------------------------------------------
# T3 — typed usage normalization (aliases, cached + reasoning counts, null cost)
# ---------------------------------------------------------------------------
def test_openai_usage_normalizes_cached_and_reasoning_counts() -> None:
    result = parse_openai_response(
        {
            "model": "gpt-5.4",
            "status": "completed",
            "output": [
                {
                    "type": "reasoning",
                    "id": "rs_1",
                    "summary": [{"type": "summary_text", "text": "private cot"}],
                },
                {
                    "type": "message",
                    "id": "msg_1",
                    "content": [{"type": "output_text", "text": "Answer."}],
                },
            ],
            "usage": {
                "input_tokens": 100,
                "input_tokens_details": {"cached_tokens": 40},
                "output_tokens": 70,
                "output_tokens_details": {"reasoning_tokens": 30},
                "total_tokens": 170,
            },
        },
        logical_engine="chatgpt",
        transport_provider="openai",
        requested_model="gpt-5.4",
        latency_ms=1,
    )
    usage = result.normalized_usage
    # ``input_tokens`` includes cache reads; the uncached line is the remainder.
    assert usage.uncached_input_tokens == 60
    assert usage.cached_input_tokens == 40
    # ``output_tokens`` includes reasoning; the two canonical lines are disjoint.
    assert usage.output_tokens == 40
    assert usage.reasoning_tokens == 30
    assert usage.total_tokens == 170
    assert usage.web_search_requests == 0
    # Absent cost is NULL, never a fabricated zero.
    assert usage.provider_cost_microusd is None
    # Reasoning CONTENT stays dropped even though its token count came through.
    serialized = json.dumps(result.provider_metadata)
    assert "private cot" not in serialized
    for item in result.provider_metadata["evidence_items"]:
        assert item["type"] != "reasoning"


def test_openai_usage_leaves_unreported_splits_null() -> None:
    result = parse_openai_response(
        {
            "model": "gpt-5.4",
            "status": "completed",
            "output": [],
            "usage": {"input_tokens": 10, "output_tokens": 20},
        },
        logical_engine="chatgpt",
        transport_provider="openai",
        requested_model="gpt-5.4",
        latency_ms=1,
    )
    usage = result.normalized_usage
    assert usage.uncached_input_tokens == 10
    assert usage.output_tokens == 20
    # No split reported => unknown stays null (never 0).
    assert usage.cached_input_tokens is None
    assert usage.reasoning_tokens is None
    # Derived total: exact sum of the reported components.
    assert usage.total_tokens == 30
    assert usage.provider_cost_microusd is None


def test_anthropic_usage_normalizes_cache_reads_and_search_count() -> None:
    result = parse_anthropic_message(
        {
            "model": "claude-sonnet-4-6",
            "stop_reason": "end_turn",
            "content": [{"type": "text", "text": "ok"}],
            "usage": {
                "input_tokens": 60,
                "cache_read_input_tokens": 25,
                "output_tokens": 40,
                "server_tool_use": {"web_search_requests": 2},
            },
        },
        logical_engine="claude",
        transport_provider="anthropic",
        requested_model="claude-sonnet-4-6",
        latency_ms=1,
    )
    usage = result.normalized_usage
    # Anthropic's ``input_tokens`` already EXCLUDES cache reads.
    assert usage.uncached_input_tokens == 60
    assert usage.cached_input_tokens == 25
    assert usage.output_tokens == 40
    assert usage.total_tokens == 125
    assert usage.web_search_requests == 2
    # Anthropic reports neither a thinking-token count nor a cost.
    assert usage.reasoning_tokens is None
    assert usage.provider_cost_microusd is None


def test_anthropic_usage_absent_counters_stay_null() -> None:
    result = parse_anthropic_message(
        {"model": "claude-sonnet-4-6", "content": [{"type": "text", "text": "ok"}]},
        logical_engine="claude",
        transport_provider="anthropic",
        requested_model="claude-sonnet-4-6",
        latency_ms=1,
    )
    usage = result.normalized_usage
    assert usage.uncached_input_tokens is None
    assert usage.output_tokens is None
    assert usage.cached_input_tokens is None
    assert usage.total_tokens is None
    assert usage.provider_cost_microusd is None
    # No server_tool_use blocks and no reported count => unknown, not zero.
    assert usage.web_search_requests is None
    assert result.search_used is False


def test_gemini_usage_normalizes_native_aliases() -> None:
    result = parse_interaction(
        {
            "model": "gemini-flash-latest",
            "status": "completed",
            "finish_reason": "STOP",
            "usage": {
                "promptTokenCount": 120,
                "cachedContentTokenCount": 20,
                "candidatesTokenCount": 80,
                "thoughtsTokenCount": 15,
                "totalTokenCount": 215,
            },
            "steps": [
                {"type": "thought", "signature": "private-thought-content"},
                {
                    "type": "google_search_call",
                    "id": "gs_1",
                    "arguments": {"queries": ["running shoes"]},
                },
                {
                    "type": "model_output",
                    "content": [{"type": "text", "text": "Answer."}],
                },
            ],
        },
        logical_engine="gemini",
        transport_provider="google",
        model="gemini-flash-latest",
        latency_ms=1,
    )
    usage = result.normalized_usage
    # The native camelCase aliases are NORMALIZED, not passed through raw.
    assert usage.uncached_input_tokens == 100
    assert usage.cached_input_tokens == 20
    assert usage.output_tokens == 80
    assert usage.reasoning_tokens == 15
    assert usage.total_tokens == 215
    assert usage.web_search_requests == 1
    assert usage.provider_cost_microusd is None
    # The raw provider usage dict never reaches metadata; the canonical shape
    # does, and the thought CONTENT is still dropped.
    meta_usage = result.provider_metadata["usage"]
    assert "promptTokenCount" not in meta_usage
    assert meta_usage["uncached_input_tokens"] == 100
    assert meta_usage["reasoning_tokens"] == 15
    assert meta_usage["provider_cost_microusd"] is None
    serialized = json.dumps(result.provider_metadata)
    assert "private-thought-content" not in serialized
    assert "thought" not in result.provider_metadata["step_types"]


def test_gemini_usage_absent_counters_stay_null() -> None:
    result = parse_interaction(
        {
            "model": "gemini-flash-latest",
            "steps": [
                {
                    "type": "model_output",
                    "content": [{"type": "text", "text": "From memory."}],
                }
            ],
        },
        logical_engine="gemini",
        transport_provider="google",
        model="gemini-flash-latest",
        latency_ms=1,
    )
    usage = result.normalized_usage
    assert usage.uncached_input_tokens is None
    assert usage.cached_input_tokens is None
    assert usage.output_tokens is None
    assert usage.reasoning_tokens is None
    assert usage.total_tokens is None
    assert usage.provider_cost_microusd is None
    # A known-zero search count is meaningful evidence and stays zero.
    assert usage.web_search_requests == 0


def test_normalized_usage_is_projectable_by_the_cost_builder() -> None:
    # The parser's normalized keys are exactly the granular vocabulary the cost
    # projection prefers, so no key-name drift can silently null a cost line.
    result = parse_interaction(
        {
            "model": "gemini-flash-latest",
            "usage": {"promptTokenCount": 1_000, "candidatesTokenCount": 500},
            "steps": [],
        },
        logical_engine="gemini",
        transport_provider="google",
        model="gemini-flash-latest",
        latency_ms=1,
    )
    projected = _extract_usage(result.provider_metadata["usage"])
    assert projected.uncached_input_tokens == 1_000
    assert projected.output_tokens == 500
    assert projected.provider_reported_cost_microusd is None
