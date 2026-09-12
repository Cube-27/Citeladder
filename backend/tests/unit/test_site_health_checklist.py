"""Focused contract tests for the rebuilt public Site Health checklist."""

from __future__ import annotations

import pytest

from app.analysis.site_health.page_analysis import analyze_page
from app.analysis.site_health.parser import extract_page_facts
from app.analysis.site_health.rules import creates_issue, rule_for
from app.core.config.site_health_rule_types import SCORE_ROLE_WEB_FUNDAMENTALS


def _evaluations(html: bytes, *, url: str = "https://example.test/page"):
    facts = extract_page_facts(html, final_url=url)
    result = analyze_page(facts)
    return {row.rule_id: row for row in result.evaluations}


def test_retired_style_and_universal_schema_rules_are_absent() -> None:
    assert rule_for("technical.single_h1") is None
    assert rule_for("technical.thin_content") is None
    assert rule_for("technical.title_length_band") is None
    assert rule_for("technical.meta_description_length_band") is None
    assert rule_for("aeo.schema_expected_for_type") is None


def test_other_pages_keep_independently_applicable_web_checks() -> None:
    facts = extract_page_facts(
        b"<html><head><title>Page</title></head><body><main></main></body></html>",
        final_url="https://example.test/page",
    )
    result = analyze_page(facts)
    assert result.assessment.page_kind == "other"
    title = next(
        row for row in result.evaluations if row.rule_id == "technical.title_present"
    )
    assert SCORE_ROLE_WEB_FUNDAMENTALS in title.score_roles
    assert title.score_roles


def test_unscored_finding_is_still_admitted() -> None:
    rows = _evaluations(
        b"<html><head><title>Page</title></head><body><main>"
        b"<a href='/missing'>Missing</a></main></body></html>"
    )
    description = rows["technical.meta_description_present"]
    assert description.score_roles == ()
    assert description.outcome == "missing"
    assert creates_issue(description) is True


def test_public_sale_price_remains_applicable_when_price_is_absent() -> None:
    rows = _evaluations(
        b"<html><head><title>Widget</title></head><body><main>"
        b"<h1>Widget</h1><button>Add to cart</button></main></body></html>",
        url="https://example.test/products/widget",
    )
    answer = rows["aeo.product_answer_facts"]
    assert answer.outcome == "missing"
    assert any(
        atom["name"] == "offer" and atom["outcome"] == "missing"
        for atom in answer.evidence["atoms"]
    )


def test_quote_led_product_does_not_require_a_public_price() -> None:
    rows = _evaluations(
        b"<html><head><title>Custom Widget</title></head><body><main>"
        b"<h1>Custom Widget</h1><p>Built for your team.</p>"
        b"<a href='/quote'>Request a quote</a></main></body></html>",
        url="https://example.test/products/custom-widget",
    )
    answer = rows["aeo.product_answer_facts"]
    offer = next(atom for atom in answer.evidence["atoms"] if atom["name"] == "offer")
    assert offer["outcome"] == "satisfied"
    assert answer.evidence["quote_led"] is True
    assert rows["aeo.offer_freshness_signal"].outcome == "not_applicable"


@pytest.mark.parametrize(
    ("label", "quote_led"),
    [
        ("Request a Quote", True),
        ("GET A QUOTE", True),
        ("Request pricing", True),
        ("Customer quotes", False),
        ("Read our quote policy", False),
    ],
)
def test_only_explicit_pricing_actions_make_a_product_quote_led(label, quote_led):
    html = (
        "<html><head><title>Widget</title></head><body><main>"
        f"<h1>Widget</h1><button>Add to cart</button><a href='/quotes'>{label}</a>"
        "</main></body></html>"
    )
    answer = _evaluations(html.encode(), url="https://example.test/products/widget")[
        "aeo.product_answer_facts"
    ]
    assert answer.evidence["quote_led"] is quote_led


def test_truncation_preserves_delivery_failures_but_abstains_on_content_absence():
    facts = extract_page_facts(
        b"<html><body><main><h1>Page</h1><p>Observed content.</p></main></body></html>",
        final_url="http://example.test/page",
    )
    facts["extraction"]["truncated"] = True
    rows = {row.rule_id: row for row in analyze_page(facts).evaluations}

    assert rows["technical.https"].outcome == "missing"
    assert rows["technical.https"].reason_code != "extraction_truncated"
    assert rows["technical.title_present"].outcome == "unknown"
    assert rows["technical.title_present"].reason_code == "extraction_truncated"


def test_empty_collection_differs_from_uncaptured_collection() -> None:
    empty = _evaluations(
        b"<html><head><title>Products</title></head><body><main>"
        b"<h1>Products</h1><p>No products found.</p></main></body></html>",
        url="https://example.test/collections/products",
    )["aeo.listing_answer_set"]
    item_set = next(
        atom for atom in empty.evidence["atoms"] if atom["name"] == "item_set"
    )
    assert item_set["evidence"]["empty_state"] is True


def test_question_association_requires_available_answer_regions() -> None:
    rows = _evaluations(
        b"<html><head><title>FAQ</title></head><body><main>"
        b"<h1>FAQ</h1><h2>What is it?</h2></main></body></html>",
        url="https://example.test/faq",
    )
    assert rows["aeo.question_headings"].outcome == "satisfied"
    assert rows["aeo.answer_first"].outcome == "missing"
