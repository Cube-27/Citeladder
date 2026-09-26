"""Offline coverage for the onboarding golden corpus and its scoring."""

from __future__ import annotations

from app.core.config.brand_discovery import SERVICE_BUSINESS_MODELS
from evaluations.onboarding_cases import GOLDEN_ONBOARDING_CASES
from evaluations.onboarding_corpus import (
    BUSINESS_MODELS,
    BUYER_REGISTERS,
    BUYER_TYPES,
    KNOWLEDGE_STRENGTHS,
    MARKET_SCOPES,
)
from evaluations.onboarding_golden import (
    CASES_BY_SLUG,
    evaluate_competitors,
    evaluate_context,
)

FEEDONOMICS = CASES_BY_SLUG["feedonomics-united-states"]


def test_corpus_covers_the_agreed_cases() -> None:
    # Membership is the contract, not ordering: the cases are assembled from the
    # commerce and services modules, so their order follows that split rather
    # than the sequence they were first written in. Sorted comparison still
    # fails on a missing, added, or duplicated case.
    slugs = [case.slug for case in GOLDEN_ONBOARDING_CASES]
    assert sorted(slugs) == sorted(
        [
            "flipkart-india",
            "best-less-australia",
            "feedonomics-united-states",
            "canva-australia",
            "puma-india",
            "urban-company-india",
            "jupiter-india",
            "zoho-india",
            "graza-united-states",
            "wakefit-india",
            "burrow-united-states",
            "valtech-global",
        ]
    )
    assert len(set(slugs)) == len(slugs)


def test_corpus_covers_service_businesses_not_only_product_sellers() -> None:
    """A corpus of product sellers cannot catch a services firm read as a vendor.

    The pipeline shipped an ecommerce *agency* described as an ecommerce
    *platform*, with the platforms it implements returned as its competitors.
    Nothing in eleven cases could have failed on that, because every one of them
    sold a product.
    """
    models = {case.business_model for case in GOLDEN_ONBOARDING_CASES}
    assert models & SERVICE_BUSINESS_MODELS, (
        "no golden case is a service business, so agency/vendor confusion "
        "cannot be measured"
    )


def test_every_case_uses_the_closed_facet_vocabularies() -> None:
    for case in GOLDEN_ONBOARDING_CASES:
        assert case.business_model in BUSINESS_MODELS, case.slug
        assert case.market_scope in MARKET_SCOPES, case.slug
        assert case.buyer_type in BUYER_TYPES, case.slug
        assert case.knowledge_strength in KNOWLEDGE_STRENGTHS, case.slug
        assert case.buyer_register in BUYER_REGISTERS, case.slug


def test_competitor_evaluation_reports_overlap_and_unexpected_names() -> None:
    case = CASES_BY_SLUG["flipkart-india"]
    result = evaluate_competitors(case, ["Amazon India", "Meesho", "Random Shop"])
    assert result.precision == 2 / 3
    assert result.recall == 2 / 5
    assert set(result.missing) == {"JioMart", "Myntra", "Tata CLiQ"}
    assert result.unexpected == ("Random Shop",)


def test_competitor_matching_ignores_market_and_category_suffixes() -> None:
    """ "Nike" and "Nike India" are one company; "Gold" and "Fat Gold" are not."""
    case = CASES_BY_SLUG["puma-india"]
    result = evaluate_competitors(case, ["Nike", "Adidas", "Reebok"])
    # Exact matching scored this 0.0 and reported a correct discovery as a miss.
    assert result.recall == 2 / 5
    assert "Nike India" not in result.missing
    assert "Adidas India" not in result.missing

    graza = CASES_BY_SLUG["graza-united-states"]
    decoy = evaluate_competitors(graza, ["Gold"])
    assert decoy.recall == 0.0, "a bare token must not satisfy a two-word brand"


def test_category_match_requires_more_than_a_shared_generic_word() -> None:
    """'software' must not satisfy 'feed management software'."""
    loose = evaluate_context(FEEDONOMICS, {"category": "Software"})
    assert not loose.category_match

    exact = evaluate_context(FEEDONOMICS, {"category": "product feed management"})
    assert exact.category_match


def test_context_evaluation_scores_facets_and_reports_mismatches() -> None:
    result = evaluate_context(
        FEEDONOMICS,
        {
            "category": "product feed management platform",
            "business_model": "b2b_saas",
            "market_scope": "global",
            "buyer_type": "consumer",
            "category_terms": ["product feed management", "marketplace integrations"],
        },
    )
    assert result.facet_accuracy == 2 / 3
    assert any("buyer_type" in mismatch for mismatch in result.mismatches)
    assert result.jtbd_coverage > 0.0
