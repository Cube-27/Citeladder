import uuid
from types import SimpleNamespace

from app.analysis.site_health.change_intel import (
    ChangePage,
    ExpectedChange,
    RuleState,
    compare_crawls,
)
from app.core.config.site_health_contracts import (
    RULE_OUTCOME_MISSING,
    RULE_OUTCOME_PARTIAL,
    RULE_OUTCOME_SATISFIED,
)
from app.domain.opportunities.change_hits import _rule_id
from app.domain.site_health.change_intel import (
    _comparison_state,
    _content_comparison_record,
)


def _page(*, title: str = "Same", status: int = 200) -> ChangePage:
    return ChangePage(
        site_url_id=uuid.UUID(int=1),
        normalized_url="https://example.com/page",
        analysis_id=uuid.uuid4(),
        artifact_id=uuid.uuid4(),
        fields={
            "title": title,
            "meta_description": "Description",
            "h1": "Heading",
            "canonical": "https://example.com/page",
            "robots_noindex": False,
            "json_ld_present": True,
            "internal_link_count": 2,
            "http_status": status,
            "redirect_target": "https://example.com/page",
        },
        rules={
            "title": RuleState(RULE_OUTCOME_SATISFIED, "high", uuid.uuid4()),
        },
        intended_indexable=True,
    )


def test_noop_pair_has_zero_false_regressions() -> None:
    before = _page()
    after = ChangePage(
        **{
            **before.__dict__,
            "analysis_id": uuid.uuid4(),
            "artifact_id": uuid.uuid4(),
        }
    )
    assert compare_crawls([before], [after], complete_pair=True) == ()


def test_classifies_rule_http_and_exact_expected_linkage() -> None:
    before = _page()
    event_id = uuid.uuid4()
    after = _page(title="Missing", status=503)
    after = ChangePage(
        **{
            **after.__dict__,
            "rules": {
                "title": RuleState(RULE_OUTCOME_MISSING, "critical", uuid.uuid4())
            },
        }
    )
    changes = compare_crawls(
        [before],
        [after],
        complete_pair=True,
        expected={(after.site_url_id, "title"): ExpectedChange(event_id, "Missing")},
    )
    by_field = {item.field: item for item in changes}
    assert by_field["title"].change_class == "critical-regression"
    assert by_field["title"].expected is True
    assert by_field["title"].implementation_event_id == event_id
    assert by_field["http_status"].change_class == "critical-regression"


def test_classifies_rule_transition_when_extracted_value_is_unchanged() -> None:
    before = _page()
    after = ChangePage(
        **{
            **before.__dict__,
            "analysis_id": uuid.uuid4(),
            "artifact_id": uuid.uuid4(),
            "rules": {"title": RuleState(RULE_OUTCOME_MISSING, "high", uuid.uuid4())},
        }
    )

    event_id = uuid.uuid4()
    changes = compare_crawls(
        [before],
        [after],
        complete_pair=True,
        expected={(after.site_url_id, "title"): ExpectedChange(event_id, "fail")},
    )

    assert [(item.field, item.change_class) for item in changes] == [
        ("title", "potential-regression")
    ]
    assert changes[0].expected is True
    assert changes[0].implementation_event_id == event_id


def test_partial_rule_outcomes_are_failures_for_change_classification() -> None:
    before = _page()
    partial = ChangePage(
        **{
            **before.__dict__,
            "analysis_id": uuid.uuid4(),
            "artifact_id": uuid.uuid4(),
            "rules": {"title": RuleState(RULE_OUTCOME_PARTIAL, "high", uuid.uuid4())},
        }
    )
    regression = compare_crawls([before], [partial], complete_pair=True)
    improvement = compare_crawls([partial], [_page()], complete_pair=True)
    assert regression[0].change_class == "potential-regression"
    assert improvement[0].change_class == "improvement"


def test_redirect_target_is_an_explicit_neutral_change() -> None:
    before = _page()
    after = ChangePage(
        **{
            **before.__dict__,
            "analysis_id": uuid.uuid4(),
            "artifact_id": uuid.uuid4(),
            "fields": {
                **before.fields,
                "redirect_target": "https://example.com/destination",
            },
        }
    )
    changes = compare_crawls([before], [after], complete_pair=True)
    assert [(item.field, item.change_class) for item in changes] == [
        ("redirect_target", "neutral-change")
    ]


def test_partial_pair_suppresses_added_and_removed_claims() -> None:
    before = _page()
    added = ChangePage(
        **{
            **before.__dict__,
            "site_url_id": uuid.UUID(int=2),
            "normalized_url": "https://example.com/added",
        }
    )
    assert compare_crawls([before], [added], complete_pair=False) == ()
    fields = {
        item.field for item in compare_crawls([before], [added], complete_pair=True)
    }
    assert fields == {"url_presence"}


def _content_page(
    *,
    shingles: list[str],
    modified: str,
    coverage: str = "complete",
    extractor_version: str = "extract-v2",
) -> ChangePage:
    page = _page()
    return ChangePage(
        **{
            **page.__dict__,
            "fields": {
                **page.fields,
                "content_change": {
                    "shingles": shingles,
                    "heading_outline": ["Overview"],
                    "word_count": 50,
                    "modified": modified,
                    "coverage": coverage,
                    "coverage_reason": None,
                    "extractor_version": extractor_version,
                    "stored_length": 400,
                    "pre_truncation_length": 400,
                },
            },
        }
    )


def test_content_change_and_metadata_consistency_are_independent() -> None:
    before = _content_page(
        shingles=["alpha beta gamma delta epsilon"], modified="2026-01-01"
    )
    after = _content_page(
        shingles=["new useful evidence for readers"], modified="2026-01-01"
    )

    change = next(
        item
        for item in compare_crawls([before], [after], complete_pair=True)
        if item.field == "content_change"
    )

    assert change.after_value["content_change_classification"] == "substantial_change"
    assert change.after_value["metadata_consistency"] == "inconsistent"
    assert change.after_value["comparison_coverage"] == "complete"
    assert change.after_value["content_delta_ratio"] == 1.0


def test_date_only_refresh_is_recorded_without_claiming_the_page_did_not_change() -> (
    None
):
    before = _content_page(
        shingles=["alpha beta gamma delta epsilon"], modified="2026-01-01"
    )
    after = _content_page(
        shingles=["alpha beta gamma delta epsilon"], modified="2026-02-01"
    )

    change = next(
        item
        for item in compare_crawls([before], [after], complete_pair=True)
        if item.field == "content_change"
    )

    assert change.after_value["content_change_classification"] == "unchanged"
    assert change.after_value["metadata_consistency"] == "inconsistent"
    assert change.after_value["content_delta_measure"] == (
        "measured_text_divergence_over_compared_portion"
    )


def test_equivalent_modified_timestamps_do_not_create_a_cosmetic_refresh() -> None:
    before = _content_page(
        shingles=["alpha beta gamma delta epsilon"],
        modified="2026-01-01T00:00:00Z",
    )
    after = _content_page(
        shingles=["alpha beta gamma delta epsilon"],
        modified="2026-01-01T01:00:00+01:00",
    )

    change = next(
        item
        for item in compare_crawls([before], [after], complete_pair=True)
        if item.field == "content_change"
    )

    assert change.after_value["metadata_consistency"] == "consistent"


def test_extractor_mismatch_keeps_crawl_pair_non_comparable() -> None:
    common = {
        "root_url": "https://example.com/",
        "configuration": {},
        "analyzer_version": "v1",
    }
    earlier = SimpleNamespace(**common, extractor_version="extract-v1")
    current = SimpleNamespace(**common, extractor_version="extract-v2")

    state, reason = _comparison_state(earlier, current, [object()], [object()])

    assert (state, reason) == ("non_comparable", "analysis_version_mismatch")


def test_legacy_cap_equality_and_extractor_mismatch_are_insufficient() -> None:
    legacy = _content_page(
        shingles=["same stored excerpt at cap"],
        modified="2026-01-01",
        coverage="unknown",
        extractor_version="extract-v1",
    )
    current = _content_page(
        shingles=["same stored excerpt at cap"],
        modified="2026-02-01",
        extractor_version="extract-v2",
    )

    change = next(
        item
        for item in compare_crawls([legacy], [current], complete_pair=True)
        if item.field == "content_change"
    )

    assert (
        change.after_value["content_change_classification"] == "insufficient_evidence"
    )
    assert change.after_value["comparison_coverage"] == "unknown"
    assert change.after_value["coverage_reason"] == "extractor_incompatible"
    assert change.after_value["metadata_consistency"] == "unknown"


def test_content_change_promotion_requires_complete_comparison_coverage() -> None:
    incomplete = SimpleNamespace(
        change_class="neutral",
        field="content_change",
        after_value={
            "comparison_coverage": "unknown",
            "metadata_consistency": "inconsistent",
            "content_change_classification": "substantial_change",
        },
    )
    complete = SimpleNamespace(
        change_class="neutral",
        field="content_change",
        after_value={
            **incomplete.after_value,
            "comparison_coverage": "complete",
        },
    )

    assert _rule_id(incomplete) is None
    assert _rule_id(complete) == "site_change_metadata_inconsistency"


def test_short_nonempty_content_produces_one_comparison_shingle() -> None:
    row = SimpleNamespace(
        artifact=SimpleNamespace(
            normalized_facts={
                "primary_content_text": "Short changed text",
                "primary_content_truncated": False,
                "primary_content_pre_truncation_length": 18,
            },
            extractor_version="extract-v2",
        )
    )

    record = _content_comparison_record(row)

    assert record["shingles"] == ["short changed text"]
