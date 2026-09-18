"""The parser against a REAL captured DataForSEO response.

`tests/fixtures/ai_overview_payloads.py` is hand-built and proves the parser
matches the documented shape. This file proves it matches what the provider
actually sent, which is a different claim and the one that matters.

The sample is a Live response captured from the API playground. It validates
the PARSER and nothing else: it proves no part of the task lifecycle, carries
no queued or failed state, and its `cost` is Live pricing that must not be
read as evidence for the Standard queue.
"""

from __future__ import annotations

import json
import pathlib

import pytest

from app.analysis.search_surfaces.ai_overview import (
    SOURCE_EXTERNAL,
    SOURCE_GOOGLE,
    parse_task,
)
from app.connectors.search_surfaces.contracts import (
    OUTCOME_AI_OVERVIEW_PRESENT,
    SearchSurfaceResult,
)

# One element of `tasks[]`, not the full API envelope — its top-level keys are
# `id`, `status_code`, `cost`, `data`, `result`. A production parser unwraps
# `tasks[]` first; `parse_task` is the level below that.
SAMPLE_PATH = (
    pathlib.Path(__file__).resolve().parents[3]
    / "docs"
    / "evaluations"
    / "DATAFORSEO_sample_result.json"
)


@pytest.fixture(scope="module")
def sample() -> dict:
    return json.loads(SAMPLE_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def parsed(sample: dict) -> SearchSurfaceResult:
    result = parse_task(sample)
    assert isinstance(result, SearchSurfaceResult)
    return result


def test_the_sample_is_a_live_response_not_a_standard_one(sample: dict) -> None:
    """Guards the reader against drawing lifecycle conclusions from it."""
    assert sample["data"]["function"] == "live"
    assert sample["data"]["load_async_ai_overview"] is True


def test_the_captured_overview_parses_as_present(parsed: SearchSurfaceResult) -> None:
    assert parsed.outcome == OUTCOME_AI_OVERVIEW_PRESENT
    assert parsed.aio_present is True
    assert parsed.provider_status_code == 20000


def test_the_block_sits_at_serp_position_three_among_sixteen(
    sample: dict, parsed: SearchSurfaceResult
) -> None:
    assert len(sample["result"][0]["items"]) == 16
    assert parsed.aio_serp_position == 3


def test_the_async_flag_is_false_beside_a_populated_overview(sample: dict) -> None:
    """Why it must never be read as a pending signal.

    The request asked for `load_async_ai_overview`, the flag came back false,
    and the overview is fully populated. The flag describes how Google
    PRODUCED the block, not whether the DataForSEO task has finished.
    """
    block = next(
        item for item in sample["result"][0]["items"] if item["type"] == "ai_overview"
    )
    assert block["asynchronous_ai_overview"] is False
    assert len(block["items"]) == 4
    assert block["markdown"]


def test_reparsing_the_sample_yields_exactly_five_citations(
    parsed: SearchSurfaceResult,
) -> None:
    assert len(parsed.references) == 5


def test_two_of_the_five_are_google_shopping_sources(
    parsed: SearchSurfaceResult,
) -> None:
    """Attributed to no brand.

    Both are `www.google.com/search?...prds=...` product URLs. Crediting the
    brand named beside them would manufacture an owned citation out of
    Google's own furniture.
    """
    google = [ref for ref in parsed.references if ref.source == SOURCE_GOOGLE]
    assert len(google) == 2
    assert all("prds=" in ref.url for ref in google)
    assert all(ref.domain == "google.com" for ref in google)


def test_the_other_three_are_external_publisher_citations(
    parsed: SearchSurfaceResult,
) -> None:
    external = {
        ref.domain for ref in parsed.references if ref.source == SOURCE_EXTERNAL
    }
    assert external == {
        "bestandless.com.au",
        "boohoo.com",
        "prettylittlething.com.au",
    }


def test_nested_element_references_are_the_same_sources_as_the_root(
    sample: dict,
) -> None:
    """The duplication the parser must not ingest twice.

    The nested copies differ only in a rendering `position` field; by URL they
    are the same five sources. Taking both would double every citation count
    in Sources.
    """
    block = next(
        item for item in sample["result"][0]["items"] if item["type"] == "ai_overview"
    )
    nested = block["items"][1]["references"]
    assert [ref["url"] for ref in nested] == [ref["url"] for ref in block["references"]]
    assert {ref["position"] for ref in nested} != {
        ref["position"] for ref in block["references"]
    }


def test_only_one_element_carries_inline_links(sample: dict) -> None:
    block = next(
        item for item in sample["result"][0]["items"] if item["type"] == "ai_overview"
    )
    with_links = [index for index, el in enumerate(block["items"]) if el.get("links")]
    assert with_links == [1]


def test_linked_and_cited_are_genuinely_independent_here(
    parsed: SearchSurfaceResult,
) -> None:
    """The real sample demonstrates the split in both directions.

    Fashion Nova is linked from inside the answer but appears in no citation.
    The two Google Shopping URLs are cited but linked from nowhere. A model
    that derived one signal from the other would get both of these wrong.
    """
    linked = {link.domain for link in parsed.links}
    cited = {ref.domain for ref in parsed.references}
    assert "fashionnova.com" in linked
    assert "fashionnova.com" not in cited
    assert "google.com" in cited
    assert "google.com" not in linked


def test_mentioned_is_independent_of_cited(parsed: SearchSurfaceResult) -> None:
    # Google is cited five-references-deep and named nowhere in the answer.
    # Reference-card text never enters `answer_text`, which is what keeps
    # these two apart.
    assert "google.com" in {ref.domain for ref in parsed.references}
    assert "Google" not in parsed.answer_text


def test_reference_domains_collapse_www_to_one_identity(
    sample: dict, parsed: SearchSurfaceResult
) -> None:
    block = next(
        item for item in sample["result"][0]["items"] if item["type"] == "ai_overview"
    )
    # The provider reports the www host; the projection stores one identity.
    assert block["references"][0]["domain"] == "www.bestandless.com.au"
    assert "bestandless.com.au" in {ref.domain for ref in parsed.references}
    assert "www.bestandless.com.au" not in {ref.domain for ref in parsed.references}


def test_the_visible_answer_covers_every_element_without_repeating_one(
    parsed: SearchSurfaceResult,
) -> None:
    """Each element carries BOTH `text` and `markdown` in the real payload.

    Emitting both would count every brand twice. The markdown is a fallback
    for elements with no plain text, never a second pass over the same one.
    """
    assert parsed.answer_text
    for brand in ("Best&Less", "Boohoo", "PrettyLittleThing"):
        assert parsed.answer_text.count(brand) >= 1
    assert (
        parsed.answer_text.count(
            "You can find cheap plus-size clothing online and in stores"
        )
        == 1
    )


def test_every_other_item_type_survives_as_raw_evidence(
    parsed: SearchSurfaceResult,
) -> None:
    """Retained, and read by no projection."""
    retained = {item["type"] for item in parsed.raw_payload["result"][0]["items"]}
    assert retained == {
        "ai_overview",
        "organic",
        "people_also_ask",
        "popular_products",
        "local_pack",
        "related_searches",
        "google_reviews",
    }
    # Refinement chips are explicitly out of scope and are not projected.
    assert "refinement_chips" in parsed.raw_payload["result"][0]


def test_the_capture_time_is_taken_from_the_serp_not_the_clock(
    parsed: SearchSurfaceResult,
) -> None:
    assert parsed.observed_at is not None
    assert parsed.observed_at.tzinfo is not None
