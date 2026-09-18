"""Keyword serialisation and the two-phase DataForSEO adapter.

The tracked prompt is preserved SEMANTICALLY, not byte-for-byte on the wire.
Those are different commitments and conflating them produces either a broken
request or a changed measurement, so the first half of this file pins the
line between them.
"""

from __future__ import annotations

from datetime import UTC, datetime

import httpx
import pytest

from app.connectors.answer_engines.errors import ProviderError
from app.connectors.answer_engines.factory import build_adapter
from app.connectors.search_surfaces.contracts import SearchSurfaceRequest
from app.connectors.search_surfaces.dataforseo import DataForSeoSearchSurfaceAdapter
from app.core.config.dataforseo import (
    KEYWORD_MAX_CHARS,
    KeywordTooLongError,
    deserialize_keyword,
    pack_credential,
    serialize_keyword,
)

_SECRET = pack_credential(login="user@example.com", password="s3cret")
_REF = "audit:11111111-1111-1111-1111-111111111111:0:0:google_ai_overview"


def _request(query: str = "best running shoes") -> SearchSurfaceRequest:
    return SearchSurfaceRequest(
        query=query,
        location_code=2036,
        language_code="en",
        device="desktop",
        depth=10,
        load_async_ai_overview=True,
        timeout_seconds=30.0,
        provider_submission_ref=_REF,
    )


class TestKeywordSerialisation:
    @pytest.mark.parametrize(
        "prompt",
        [
            "C++",
            "50% off",
            "a+b",
            "100% cotton + linen shirts",
            "what is the best CRM?",
            "café münchen",
            "%2B literal escape sequence",
        ],
    )
    def test_a_prompt_round_trips_losslessly(self, prompt: str) -> None:
        # Transport escaping is required; semantic rewriting is forbidden.
        # These are ordinary prompts, not rejection cases.
        assert deserialize_keyword(serialize_keyword(prompt)) == prompt

    def test_the_wire_form_escapes_only_the_two_syntax_characters(self) -> None:
        assert serialize_keyword("C++") == "C%2B%2B"
        assert serialize_keyword("50% off") == "50%25 off"
        # Nothing else is touched: no case folding, no stop-word stripping,
        # no punctuation normalisation.
        assert serialize_keyword("Why is the Sky Blue?") == "Why is the Sky Blue?"

    def test_a_prompt_at_the_boundary_is_accepted(self) -> None:
        prompt = "a" * KEYWORD_MAX_CHARS
        assert deserialize_keyword(serialize_keyword(prompt)) == prompt

    def test_a_prompt_over_the_limit_is_rejected_by_name_not_truncated(self) -> None:
        # Truncating would measure a question the customer never asked and
        # report the answer as though they had.
        with pytest.raises(KeywordTooLongError, match="over the 700-character"):
            serialize_keyword("a" * (KEYWORD_MAX_CHARS + 1))

    def test_a_prompt_that_only_exceeds_the_limit_after_escaping_is_rejected(
        self,
    ) -> None:
        # 350 '%' characters become 1050 after escaping.
        with pytest.raises(KeywordTooLongError):
            serialize_keyword("%" * 350)


class TestSubmission:
    @pytest.mark.asyncio
    async def test_the_submission_carries_the_query_and_context_and_no_target(
        self,
    ) -> None:
        """No `target`, ever.

        Sending the monitored domain would let the provider's filtering decide
        what CiteLadder is allowed to see, and a brand's absence from a
        filtered SERP is indistinguishable from absence from the real one.
        """
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(
                200,
                json={
                    "status_code": 20000,
                    "tasks": [{"id": "t-1", "status_code": 20100, "cost": 0.0006}],
                },
            )

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            adapter = DataForSeoSearchSurfaceAdapter(secret=_SECRET, client=client)
            submission = await adapter.submit(_request())

        import json

        body = json.loads(seen[0].content)[0]
        assert "target" not in body
        assert body["keyword"] == "best running shoes"
        assert body["location_code"] == 2036
        assert body["device"] == "desktop"
        assert body["depth"] == 10
        assert submission.provider_task_id == "t-1"

    @pytest.mark.asyncio
    async def test_the_submission_ref_is_sent_verbatim_as_the_tag(self) -> None:
        """Reconciliation identity depends on this value surviving intact."""
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(
                200,
                json={
                    "status_code": 20000,
                    "tasks": [{"id": "t", "status_code": 20100}],
                },
            )

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            adapter = DataForSeoSearchSurfaceAdapter(secret=_SECRET, client=client)
            await adapter.submit(_request())

        import json

        assert json.loads(seen[0].content)[0]["tag"] == _REF

    @pytest.mark.asyncio
    async def test_the_submission_cost_is_captured_at_post_time(self) -> None:
        # The provider charges when the task is SET. A task whose retrieval
        # never succeeds has still cost money.
        def handler(_: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json={
                    "status_code": 20000,
                    "tasks": [{"id": "t", "status_code": 20100, "cost": 0.0006}],
                },
            )

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            adapter = DataForSeoSearchSurfaceAdapter(secret=_SECRET, client=client)
            submission = await adapter.submit(_request())

        assert submission.provider_cost_microusd == 600

    @pytest.mark.asyncio
    async def test_an_accepted_task_with_no_id_fails_rather_than_being_lost(
        self,
    ) -> None:
        # Already paid for and unusable. Failing sends it to reconciliation,
        # the only path that can find it again by tag.
        def handler(_: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json={
                    "status_code": 20000,
                    "tasks": [{"id": "", "status_code": 20100}],
                },
            )

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            adapter = DataForSeoSearchSurfaceAdapter(secret=_SECRET, client=client)
            with pytest.raises(ProviderError, match="no task id"):
                await adapter.submit(_request())

    @pytest.mark.asyncio
    async def test_a_refused_submission_is_not_retryable(self) -> None:
        def handler(_: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json={"status_code": 20000, "tasks": [{"status_code": 40501}]},
            )

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            adapter = DataForSeoSearchSurfaceAdapter(secret=_SECRET, client=client)
            with pytest.raises(ProviderError) as excinfo:
                await adapter.submit(_request())

        assert excinfo.value.retryable is False


class TestRetrieval:
    @pytest.mark.asyncio
    async def test_fetch_returns_the_raw_response_without_interpreting_it(self) -> None:
        """Interpreting belongs to the pure parser.

        A transport that also decided outcomes could not be exhaustively
        fixture-tested, because it would need a network to reach its branches.
        """
        payload = {"status_code": 20000, "tasks": [{"id": "t", "status_code": 40602}]}

        def handler(request: httpx.Request) -> httpx.Response:
            assert request.method == "GET"
            assert request.url.path.endswith("/t-1")
            return httpx.Response(200, json=payload)

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            adapter = DataForSeoSearchSurfaceAdapter(secret=_SECRET, client=client)
            assert await adapter.fetch("t-1") == payload

    @pytest.mark.asyncio
    async def test_there_is_no_submit_reachable_from_the_retrieval_path(self) -> None:
        """Retry means retry RETRIEVAL. Never resubmit, never pay twice."""
        calls: list[str] = []

        def handler(request: httpx.Request) -> httpx.Response:
            calls.append(request.method)
            return httpx.Response(200, json={"status_code": 20000, "tasks": []})

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            adapter = DataForSeoSearchSurfaceAdapter(secret=_SECRET, client=client)
            for _ in range(5):
                await adapter.fetch("t-1")

        assert calls == ["GET"] * 5


class TestAdapterDispatch:
    def test_a_search_route_builds_the_two_phase_adapter(self) -> None:
        adapter = build_adapter(
            logical_engine="google_ai_overview",
            transport_provider="dataforseo",
            api_key=_SECRET,
        )
        assert isinstance(adapter, DataForSeoSearchSurfaceAdapter)
        assert hasattr(adapter, "submit")
        assert hasattr(adapter, "fetch")
        # Deliberately NOT the answer-engine protocol.
        assert not hasattr(adapter, "execute")

    def test_an_llm_route_still_builds_its_answer_engine_adapter(self) -> None:
        for engine, transport in (
            ("chatgpt", "openai"),
            ("claude", "anthropic"),
            ("gemini", "google"),
        ):
            adapter = build_adapter(
                logical_engine=engine, transport_provider=transport, api_key="sk-x"
            )
            assert hasattr(adapter, "execute")

    def test_a_mismatched_engine_and_transport_is_refused(self) -> None:
        with pytest.raises(ProviderError) as excinfo:
            build_adapter(
                logical_engine="chatgpt",
                transport_provider="dataforseo",
                api_key=_SECRET,
            )
        assert excinfo.value.error_code == "invalid_surface"


class TestReconciliationWindow:
    """The id-list endpoint's real contract, verified against a live account."""

    @pytest.mark.asyncio
    async def test_the_sweep_uses_the_api_level_id_list_path(self) -> None:
        # The per-endpoint spelling `/v3/serp/google/organic/id_list` returns
        # HTTP 404. This path is API-level and covers every SERP task type,
        # which is why a sweep identifies its rows by tag.
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(200, json={"status_code": 20000, "tasks": []})

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            adapter = DataForSeoSearchSurfaceAdapter(secret=_SECRET, client=client)
            await adapter.list_task_ids(
                datetime_from=datetime(2026, 9, 18, 6, 0, tzinfo=UTC),
                datetime_to=datetime(2026, 9, 18, 7, 0, tzinfo=UTC),
            )

        assert seen[0].url.path == "/v3/serp/id_list"

    @pytest.mark.asyncio
    async def test_the_sweep_asks_for_metadata_because_the_tag_lives_there(
        self,
    ) -> None:
        """Without it, reconciliation has nothing to match on.

        The tag is returned in `metadata.tag` and nowhere else on this
        endpoint, so omitting the flag would silently make every uncertain
        submission unreconcilable.
        """
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(200, json={"status_code": 20000, "tasks": []})

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            adapter = DataForSeoSearchSurfaceAdapter(secret=_SECRET, client=client)
            await adapter.list_task_ids(
                datetime_from=datetime(2026, 9, 18, 6, 0, tzinfo=UTC),
                datetime_to=datetime(2026, 9, 18, 7, 0, tzinfo=UTC),
            )

        import json

        body = json.loads(seen[0].content)[0]
        assert body["include_metadata"] is True
        assert body["limit"] == 1000

    @pytest.mark.asyncio
    async def test_window_bounds_use_the_providers_timestamp_format(self) -> None:
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(200, json={"status_code": 20000, "tasks": []})

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            adapter = DataForSeoSearchSurfaceAdapter(secret=_SECRET, client=client)
            await adapter.list_task_ids(
                datetime_from=datetime(2026, 9, 18, 6, 30, 5, tzinfo=UTC),
                datetime_to=datetime(2026, 9, 18, 7, 30, 5, tzinfo=UTC),
            )

        import json

        body = json.loads(seen[0].content)[0]
        assert body["datetime_from"] == "2026-09-18 06:30:05 +00:00"
        assert body["datetime_to"] == "2026-09-18 07:30:05 +00:00"
