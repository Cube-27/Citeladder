"""Structured-data recognition and primary-entity selection for listing pages."""

from __future__ import annotations

import json

from app.analysis.site_health.parser import extract_page_facts
from app.analysis.site_health.product_rules import check_assortment_freshness_signal
from app.analysis.site_health.schema_rules import (
    check_schema_expected_for_type,
    check_schema_required_valid,
)
from app.core.config.site_health_contracts import RULE_OUTCOME_SATISFIED
from app.core.config.site_health_page_profiles import STRUCTURED_DATA_RECOGNIZED_TYPES
from app.core.config.site_health_taxonomy import (
    PAGE_KIND_ARTICLE,
    PAGE_KIND_CATEGORY,
)


def _facts(json_ld: dict, *, url: str, page_kind: str) -> dict:
    body = (
        "<html><head><title>Index</title>"
        '<script type="application/ld+json">'
        f"{json.dumps(json_ld)}"
        "</script></head>"
        "<body><main><h1>Index</h1><p>Entries.</p></main></body></html>"
    ).encode()
    facts = extract_page_facts(
        body, final_url=url, content_type="text/html", status_code=200
    )
    facts["page_kind"] = page_kind
    return facts


def _types(facts: dict) -> list[str]:
    return [
        str(block.get("type") or "") for block in facts["structured_data"]["blocks"]
    ]


def test_blog_is_a_recognized_listing_schema() -> None:
    """`Blog` is what a correct blog index declares, and it must be read.

    A blog index classifies as a category. While `Blog` was absent from the
    expected types it was never recognized, so the block was skipped whole:
    the page was told its expected schema was absent AND that it published no
    freshness signal, with `dateModified` sitting in the block we declined to
    read. Two issues for marking the page up correctly.
    """
    assert "Blog" in STRUCTURED_DATA_RECOGNIZED_TYPES

    facts = _facts(
        {
            "@context": "https://schema.org",
            "@type": "Blog",
            "name": "Acme Blog",
            "url": "https://acme.test/blog",
            "dateModified": "2026-09-09",
            "blogPost": [
                {
                    "@type": "BlogPosting",
                    "headline": "A post",
                    "url": "https://acme.test/blog/a",
                }
            ],
        },
        url="https://acme.test/blog",
        page_kind=PAGE_KIND_CATEGORY,
    )

    assert "Blog" in _types(facts)
    assert facts["dates"]["modified"] == "2026-09-09"
    assert check_schema_expected_for_type(facts)[0] == RULE_OUTCOME_SATISFIED
    assert check_schema_required_valid(facts)[0] == RULE_OUTCOME_SATISFIED
    assert check_assortment_freshness_signal(facts)[0] == RULE_OUTCOME_SATISFIED


def test_one_entity_declaring_two_expected_types_is_not_ambiguous() -> None:
    """`["CollectionPage", "Blog"]` is one entity, not two competing ones.

    The extractor emits one block per recognized type, so a multi-type object
    produced two candidates and the primary-entity rules abstained with
    `ambiguous_primary_schema_entity` -- on markup that is both valid and
    common.
    """
    facts = _facts(
        {
            "@context": "https://schema.org",
            "@type": ["CollectionPage", "Blog"],
            "@id": "https://acme.test/blog",
            "url": "https://acme.test/blog",
            "name": "Acme Blog",
            "dateModified": "2026-09-09",
        },
        url="https://acme.test/blog",
        page_kind=PAGE_KIND_CATEGORY,
    )

    # Both types are still reported as observed structure...
    assert _types(facts) == ["CollectionPage", "Blog"]
    entity_indexes = {
        block["entity_index"] for block in facts["structured_data"]["blocks"]
    }
    assert len(entity_indexes) == 1, "both blocks came from one JSON-LD object"

    # ...but they resolve to a single primary entity.
    outcome, evidence = check_schema_expected_for_type(facts)
    assert outcome == RULE_OUTCOME_SATISFIED
    assert evidence["candidate_count"] == 1


def test_same_id_objects_are_one_entity_not_competing_candidates() -> None:
    """`@id` IS identity in JSON-LD, so two objects sharing one are one entity.

    A listing page whose `isPartOf` names itself is ordinary markup. Once
    `Blog` became recognized, the nested object turned into a second
    expected-type candidate and the primary-entity rules abstained on a page
    that had been reading fine.
    """
    facts = _facts(
        {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            "@id": "https://acme.test/blog",
            "url": "https://acme.test/blog",
            "name": "Acme Blog",
            "dateModified": "2026-09-09",
            "isPartOf": {
                "@type": "Blog",
                "@id": "https://acme.test/blog",
                "url": "https://acme.test/blog",
                "name": "Acme Blog",
            },
        },
        url="https://acme.test/blog",
        page_kind=PAGE_KIND_CATEGORY,
    )

    assert _types(facts) == ["CollectionPage", "Blog"]
    outcome, evidence = check_schema_expected_for_type(facts)
    assert outcome == RULE_OUTCOME_SATISFIED
    assert evidence["candidate_count"] == 1


def test_the_satisfied_contract_wins_not_the_first_declared_type() -> None:
    """Declaration order must not decide which contract an entity is held to.

    `["ItemList", "Blog"]` on a container carrying `name` and no
    `itemListElement` is valid AS A BLOG. Collapsing to whichever type the
    author listed first reported a required property missing from an entity
    that never claimed to be a bare list.
    """
    facts = _facts(
        {
            "@context": "https://schema.org",
            "@type": ["ItemList", "Blog"],
            "@id": "https://acme.test/blog",
            "url": "https://acme.test/blog",
            "name": "Acme Blog",
            "dateModified": "2026-09-09",
        },
        url="https://acme.test/blog",
        page_kind=PAGE_KIND_CATEGORY,
    )

    assert check_schema_expected_for_type(facts)[0] == RULE_OUTCOME_SATISFIED
    outcome, evidence = check_schema_required_valid(facts)
    assert outcome == RULE_OUTCOME_SATISFIED
    assert evidence["schema_type"] == "Blog"
    assert evidence["missing"] == []


def test_a_nested_blog_reference_does_not_disturb_a_blog_post() -> None:
    """`isPartOf: {"@type": "Blog"}` is ordinary on a post and must stay inert.

    Recognizing `Blog` makes that nested object its own block. It is not an
    expected type for an article, so it must not become a competing candidate
    on every blog post on the internet.
    """
    facts = _facts(
        {
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            "headline": "A post",
            "author": {"@type": "Person", "name": "Someone"},
            "datePublished": "2026-09-01",
            "url": "https://acme.test/blog/a",
            "isPartOf": {
                "@type": "Blog",
                "@id": "https://acme.test/blog",
                "url": "https://acme.test/blog",
                "name": "Acme Blog",
            },
        },
        url="https://acme.test/blog/a",
        page_kind=PAGE_KIND_ARTICLE,
    )

    assert _types(facts) == ["BlogPosting", "Blog"]
    outcome, evidence = check_schema_expected_for_type(facts)
    assert outcome == RULE_OUTCOME_SATISFIED
    assert evidence["candidate_count"] == 1
    assert check_schema_required_valid(facts)[0] == RULE_OUTCOME_SATISFIED
