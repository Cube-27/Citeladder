"""The AI Overview parser: what it found, and what it refuses to claim.

The tests that matter here are the boundary cases, not the breadth.
Incomplete retrieval versus genuine absence is the distinction every rate in
the product divides by, so most of this file is about the ways a payload can
fail to mean "the brand was not shown".
"""

from __future__ import annotations

import pytest

from app.analysis.search_surfaces.ai_overview import (
    SOURCE_EXTERNAL,
    SOURCE_GOOGLE,
    parse_task,
    parse_task_payload,
)
from app.connectors.search_surfaces.contracts import (
    OUTCOME_AI_OVERVIEW_PRESENT,
    OUTCOME_NO_AI_OVERVIEW,
    OUTCOME_PARSER_ERROR,
    OUTCOME_PROVIDER_ERROR,
    RESULT_STILL_PENDING,
    SearchSurfaceResult,
)
from tests.fixtures import ai_overview_payloads as payloads


def _parse(task: dict) -> SearchSurfaceResult:
    result = parse_task(task)
    assert isinstance(result, SearchSurfaceResult)
    return result


class TestPresentOverview:
    def test_a_populated_overview_is_recorded_as_present(self) -> None:
        result = _parse(payloads.completed_task())
        assert result.outcome == OUTCOME_AI_OVERVIEW_PRESENT
        assert result.aio_present is True
        assert result.provider_status_code == 20000

    def test_rank_absolute_is_kept_as_the_serp_block_position(self) -> None:
        # Never a brand rank. A "position" that quietly became a brand
        # ranking would read as a visibility win or loss that never happened.
        result = _parse(payloads.completed_task())
        assert result.aio_serp_position == 3

    def test_the_async_flag_is_evidence_not_a_pending_signal(self) -> None:
        # The captured sample carries `false` alongside a fully populated
        # block, so reading it as pending would park a finished task forever.
        result = _parse(payloads.completed_task())
        assert result.outcome == OUTCOME_AI_OVERVIEW_PRESENT
        block = result.elements
        assert block  # elements were captured
        assert (
            result.raw_payload["result"][0]["items"][0]["asynchronous_ai_overview"]
            is False
        )

    def test_the_whole_task_is_retained_as_raw_evidence(self) -> None:
        result = _parse(payloads.completed_task())
        retained = {item["type"] for item in result.raw_payload["result"][0]["items"]}
        # Every other item type survives in evidence and is read by nothing.
        assert "organic" in retained
        assert "people_also_ask" in retained
        assert "popular_products" in retained


class TestVisibleAnswer:
    def test_table_content_reaches_the_answer_text(self) -> None:
        """A brand named only in a table cell IS named in the answer.

        This is the case a text-only loop over `items[].text` misses, and
        missing it would record a real mention as an absence.
        """
        result = _parse(payloads.completed_task())
        assert "Target" in result.answer_text
        assert "$9" in result.answer_text

    def test_markdown_is_used_only_when_an_element_has_no_plain_text(self) -> None:
        result = _parse(payloads.completed_task())
        assert "Check sizing guides" in result.answer_text
        # The first element's text must appear once, not twice — it exists in
        # both the element text and the block-level markdown.
        assert result.answer_text.count("most commonly recommended retailers") == 1

    def test_reference_card_text_never_enters_the_answer(self) -> None:
        """Concatenating a card would manufacture a mention.

        `Choice` appears only as a reference title and snippet. If it reached
        `answer_text`, a competitor named in a citation card would be scored
        as named in the answer.
        """
        result = _parse(payloads.completed_task())
        assert "Choice" not in result.answer_text
        assert "We compared eight Australian retailers" not in result.answer_text

    def test_a_nested_element_is_type_validated_like_any_other(self) -> None:
        """The text and link readers walk ONE validated tree.

        Text used to recurse into nested elements without checking their type
        while links did not recurse at all, so a nested element could
        contribute unvalidated text and silently lose its links.
        """
        task = payloads.completed_task()
        block = task["result"][0]["items"][0]
        block["items"][0]["items"] = [
            {"type": "ai_overview_carousel", "text": "smuggled in"}
        ]
        result = _parse(task)
        assert result.outcome == OUTCOME_PARSER_ERROR
        assert "smuggled in" not in result.answer_text

    def test_a_nested_elements_links_are_collected(self) -> None:
        task = payloads.completed_task()
        block = task["result"][0]["items"][0]
        block["items"][0]["items"] = [
            {
                "type": "ai_overview_element",
                "text": "Nested passage.",
                "links": [
                    {
                        "type": "link_element",
                        "title": "Nested",
                        "url": "https://shop.nestedbrand.com/page",
                        "domain": "shop.nestedbrand.com",
                    }
                ],
            }
        ]
        result = _parse(task)
        assert "Nested passage." in result.answer_text
        # The nested link joins the two top-level ones, collapsed to its
        # registrable domain like every other link. Asserted as the exact set:
        # previously the nested one was dropped entirely, and a membership
        # check would not notice if a top-level one went missing instead.
        assert {link.domain for link in result.links} == {
            payloads.BRAND_DOMAIN,
            payloads.COMPETITOR_DOMAIN,
            "nestedbrand.com",
        }

    def test_an_unknown_element_type_is_a_parser_error(self) -> None:
        task = payloads.completed_task()
        task["result"][0]["items"][0]["items"][0]["type"] = "ai_overview_carousel"
        result = _parse(task)
        assert result.outcome == OUTCOME_PARSER_ERROR
        # Not silently omitted: the text it carried would have been dropped.
        assert result.aio_present is None


class TestReferencesAndLinks:
    def test_root_references_become_exactly_five_citations(self) -> None:
        result = _parse(payloads.completed_task())
        assert len(result.references) == 5

    def test_nested_element_references_are_not_ingested_twice(self) -> None:
        """`items[1].references` duplicates the root list.

        Ingesting both would double every citation count in Sources.
        """
        task = payloads.completed_task()
        nested = task["result"][0]["items"][0]["items"][1]["references"]
        assert len(nested) == 5  # the duplication is real in the payload
        assert len(_parse(task).references) == 5

    def test_google_shopping_references_are_google_sources(self) -> None:
        """Never an owned citation for the brand named beside them."""
        result = _parse(payloads.completed_task())
        google = [ref for ref in result.references if ref.source == SOURCE_GOOGLE]
        assert len(google) == 2
        assert {ref.url for ref in google} == {
            payloads.GOOGLE_SHOPPING_URL_A,
            payloads.GOOGLE_SHOPPING_URL_B,
        }

    def test_non_google_references_stay_external(self) -> None:
        result = _parse(payloads.completed_task())
        external = [ref for ref in result.references if ref.source == SOURCE_EXTERNAL]
        assert {ref.domain for ref in external} == {
            payloads.BRAND_DOMAIN,
            payloads.COMPETITOR_DOMAIN,
            "choice.com.au",
        }

    def test_reference_domains_are_normalised_to_one_identity(self) -> None:
        # `www.bestandless.com.au` and `bestandless.com.au` are one identity.
        result = _parse(payloads.completed_task())
        domains = {ref.domain for ref in result.references}
        assert payloads.BRAND_DOMAIN in domains
        assert f"www.{payloads.BRAND_DOMAIN}" not in domains

    def test_links_come_from_inline_links_only(self) -> None:
        """Never from references.

        Deriving link rows from the reference list too would make every
        citation-only entity look linked, and destroy the independence the
        three-source evidence model exists to preserve.
        """
        result = _parse(payloads.completed_task())
        assert len(result.links) == 2
        linked = {link.domain for link in result.links}
        assert linked == {payloads.BRAND_DOMAIN, payloads.COMPETITOR_DOMAIN}
        # choice.com.au is cited but never linked.
        assert "choice.com.au" not in linked

    def test_links_record_which_element_they_came_from(self) -> None:
        result = _parse(payloads.completed_task())
        assert {link.element_index for link in result.links} == {1}


class TestAbsenceVersusFailure:
    """The distinction every published rate divides by."""

    def test_a_complete_task_with_no_block_is_measured_absence(self) -> None:
        result = _parse(payloads.completed_task(with_overview=False))
        assert result.outcome == OUTCOME_NO_AI_OVERVIEW
        assert result.aio_present is False

    def test_no_ai_overview_is_the_only_outcome_that_sets_false(self) -> None:
        for task in (
            payloads.task_with_status(40103),
            {"id": "x", "status_code": 20000, "result": None},
        ):
            result = _parse(task)
            assert result.outcome != OUTCOME_NO_AI_OVERVIEW
            assert result.aio_present is None

    def test_an_empty_result_is_an_error_not_absence(self) -> None:
        task = payloads.completed_task()
        task["result"] = []
        assert _parse(task).outcome == OUTCOME_PARSER_ERROR

    def test_a_missing_items_list_is_an_error_not_absence(self) -> None:
        task = payloads.completed_task()
        task["result"][0]["items"] = "not a list"
        assert _parse(task).outcome == OUTCOME_PARSER_ERROR

    def test_an_empty_tasks_array_is_an_error_not_absence(self) -> None:
        result = parse_task_payload(payloads.response())
        assert isinstance(result, SearchSurfaceResult)
        assert result.outcome == OUTCOME_PARSER_ERROR


class TestStatusFamilies:
    @pytest.mark.parametrize("status", [40601, 40602])
    def test_pending_codes_are_a_signal_to_repark_not_a_finding(
        self, status: int
    ) -> None:
        # Returned as a bare sentinel, deliberately NOT a result, so nothing
        # downstream can accidentally count a task that has not finished.
        assert parse_task(payloads.task_with_status(status)) is RESULT_STILL_PENDING

    @pytest.mark.parametrize("status", [40103, 40100, 40200, 40501])
    def test_failure_codes_finalize_preserving_the_providers_code(
        self, status: int
    ) -> None:
        result = _parse(payloads.task_with_status(status))
        assert result.outcome == OUTCOME_PROVIDER_ERROR
        assert result.provider_status_code == status
        assert result.aio_present is None

    def test_pending_and_failure_share_the_4xxxx_band(self) -> None:
        """Why no numeric range test is permitted anywhere.

        40103 (failed), 40601 (handed) and 40602 (queued) are all `4xxxx` and
        mean three different things. A `>= 40000` test would park a failed
        task until the poll ceiling burned, then report the ceiling as the
        cause and destroy the real one.
        """
        assert parse_task(payloads.task_with_status(40602)) is RESULT_STILL_PENDING
        assert _parse(payloads.task_with_status(40103)).outcome == (
            OUTCOME_PROVIDER_ERROR
        )

    def test_an_unclassified_code_fails_loudly(self) -> None:
        result = _parse(payloads.task_with_status(49999))
        assert result.outcome == OUTCOME_PROVIDER_ERROR
        assert result.provider_status_code == 49999

    def test_a_task_without_a_status_is_a_parser_error(self) -> None:
        assert _parse({"id": "x"}).outcome == OUTCOME_PARSER_ERROR


class TestEvaluationOrder:
    """Transport, envelope, matched task, structure — in that order."""

    def test_an_envelope_failure_is_handled_before_any_task(self) -> None:
        # A task cannot vouch for a response that was rejected outright.
        payload = payloads.response(status_code=40100)
        result = parse_task_payload(payload)
        assert isinstance(result, SearchSurfaceResult)
        assert result.outcome == OUTCOME_PROVIDER_ERROR
        assert result.provider_status_code == 40100

    def test_an_envelope_failure_wins_even_when_tasks_are_present(self) -> None:
        """A rejected request can still carry task stubs.

        Reading their statuses would let a payment or auth failure be reported
        as whatever the stub happened to say — including, at worst, a
        successful observation.
        """
        payload = payloads.response(
            payloads.completed_task(task_id="t-1"), status_code=40200
        )
        result = parse_task_payload(payload, expected_task_id="t-1")
        assert isinstance(result, SearchSurfaceResult)
        assert result.outcome == OUTCOME_PROVIDER_ERROR
        assert result.provider_status_code == 40200
        assert result.aio_present is None

    def test_the_submitted_task_is_selected_by_id(self) -> None:
        payload = payloads.response(
            payloads.completed_task(task_id="other", with_overview=False),
            payloads.completed_task(task_id="mine"),
        )
        result = parse_task_payload(payload, expected_task_id="mine")
        assert isinstance(result, SearchSurfaceResult)
        assert result.outcome == OUTCOME_AI_OVERVIEW_PRESENT

    def test_an_unmatched_task_id_is_an_error_not_the_first_task(self) -> None:
        """Reading the first task would attach another task's overview here."""
        payload = payloads.response(payloads.completed_task(task_id="other"))
        result = parse_task_payload(payload, expected_task_id="mine")
        assert isinstance(result, SearchSurfaceResult)
        assert result.outcome == OUTCOME_PARSER_ERROR

    def test_an_ambiguous_response_without_an_expected_id_is_an_error(self) -> None:
        payload = payloads.response(
            payloads.completed_task(task_id="a"),
            payloads.completed_task(task_id="b"),
        )
        result = parse_task_payload(payload)
        assert isinstance(result, SearchSurfaceResult)
        assert result.outcome == OUTCOME_PARSER_ERROR

    def test_a_non_object_payload_raises_rather_than_guessing(self) -> None:
        from app.analysis.search_surfaces.ai_overview import AiOverviewParseError

        with pytest.raises(AiOverviewParseError):
            parse_task_payload(["not", "an", "object"])


class TestObservationMetadata:
    def test_observed_at_comes_from_the_serp_capture_time(self) -> None:
        # Kept separate from when CiteLadder collected it: the two differ by
        # however long the task sat in the provider's queue, and a trend that
        # plots retrieval time is plotting queue latency.
        result = _parse(payloads.completed_task())
        assert result.observed_at is not None
        assert result.observed_at.year == 2026

    def test_the_provider_reported_cost_is_carried_in_microusd(self) -> None:
        result = _parse(payloads.completed_task())
        assert result.provider_cost_microusd == 2000
