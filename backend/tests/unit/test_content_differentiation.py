import uuid
from datetime import UTC, datetime
from types import SimpleNamespace

from app.analysis.content_differentiation import (
    DifferentiationPage,
    analyze_content_differentiation,
    organic_results,
)
from app.domain.content_differentiation import _candidate_snapshot, _outbound_domains
from app.domain.source_pages.sync import _canonical_differentiation_results


def test_organic_results_are_deduplicated_ranked_and_bounded() -> None:
    payload = {
        "result": [
            {
                "items": [
                    {"type": "people_also_ask", "url": "https://ignored.example"},
                    {"type": "organic", "url": "https://b.example", "rank_absolute": 2},
                    {"type": "organic", "url": "https://a.example", "rank_absolute": 1},
                    {"type": "organic", "url": "https://a.example", "rank_absolute": 3},
                ]
            }
        ]
    }

    assert [row["url"] for row in organic_results(payload)] == [
        "https://a.example",
        "https://b.example",
    ]


def test_differentiation_uses_inspected_denominator_and_most_threshold() -> None:
    owned = DifferentiationPage(
        "owned",
        headings=("Buying guide", "Deployment checklist"),
        table_headers=(("Plan", "Price"),),
        outbound_domains=("research.example",),
    )
    competitors = [
        DifferentiationPage(
            str(index),
            headings=("Buying guide",),
            table_headers=(("Plan", "Price"),),
            outbound_domains=("common.example",),
        )
        for index in range(3)
    ]

    report = analyze_content_differentiation(
        owned,
        competitors,
        selected_result_count=5,
        candidate_ids=("c1", "c2", "c3"),
        snapshot_ids=("s1", "s2", "s3"),
    )

    assert report["state"] == "available"
    assert report["provenance"]["selected_result_count"] == 5
    assert report["provenance"]["inspected_page_count"] == 3
    assert {item["feature"] for item in report["gaps"]} == {"outbound_sources"}
    assert {item["feature"] for item in report["parity"]} == {
        "heading_topics",
        "table_structures",
    }
    assert {item["feature"] for item in report["unique_contributions"]} == {
        "heading_topics",
        "outbound_sources",
    }


def test_differentiation_is_unknown_below_inspected_evidence_floor() -> None:
    report = analyze_content_differentiation(
        DifferentiationPage("owned", headings=("Guide",)),
        [DifferentiationPage("competitor", headings=("Guide",))],
        selected_result_count=10,
    )

    assert report["state"] == "insufficient_evidence"
    assert report["gaps"] == []
    assert report["unique_contributions"] == []


def test_canonical_identity_deduplication_precedes_result_limit() -> None:
    items = [
        {
            "type": "organic",
            "url": "https://duplicate.example/page?utm_source=first",
            "rank_absolute": 1,
        },
        {
            "type": "organic",
            "url": "https://duplicate.example/page",
            "rank_absolute": 2,
        },
        *(
            {
                "type": "organic",
                "url": f"https://unique{rank}.example/page",
                "rank_absolute": rank,
            }
            for rank in range(3, 12)
        ),
    ]

    selected = _canonical_differentiation_results({"result": [{"items": items}]})

    assert len(selected) == 10
    assert selected[-1][0]["url"] == "https://unique11.example/page"


def test_outbound_domains_compare_registrable_owned_domain() -> None:
    facts = {
        "links": {
            "anchors": [
                {"url": "https://blog.example.co.uk/post", "is_internal": False},
                {"url": "https://research.example.org/report", "is_internal": False},
            ]
        }
    }

    assert _outbound_domains(facts, owned_host="www.example.co.uk") == ("example.org",)


def test_prior_report_never_uses_a_later_audits_snapshot() -> None:
    candidate_audit_id = uuid.UUID(int=2)
    candidate = SimpleNamespace(audit_id=candidate_audit_id)
    later = SimpleNamespace(audit_id=uuid.UUID(int=3))
    earlier = SimpleNamespace(audit_id=uuid.UUID(int=1))

    selected = _candidate_snapshot(
        candidate,
        candidate_audit_created_at=datetime(2026, 7, 2, tzinfo=UTC),
        snapshots=[
            (later, datetime(2026, 7, 3, tzinfo=UTC)),
            (earlier, datetime(2026, 7, 1, tzinfo=UTC)),
        ],
    )

    assert selected is earlier


def test_same_audit_snapshot_precedes_a_newer_snapshot_from_an_earlier_audit() -> None:
    candidate_audit_id = uuid.UUID(int=3)
    candidate = SimpleNamespace(audit_id=candidate_audit_id)
    earlier = SimpleNamespace(audit_id=uuid.UUID(int=2))
    same_audit = SimpleNamespace(audit_id=candidate_audit_id)

    selected = _candidate_snapshot(
        candidate,
        candidate_audit_created_at=datetime(2026, 7, 3, tzinfo=UTC),
        snapshots=[
            (earlier, datetime(2026, 7, 2, tzinfo=UTC)),
            (same_audit, datetime(2026, 7, 3, tzinfo=UTC)),
        ],
    )

    assert selected is same_audit
