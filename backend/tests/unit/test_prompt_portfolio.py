"""Shared prompt identity policy coverage."""

from app.domain.prompts.portfolio import (
    contains_tracked_name,
    prompt_identity_is_valid,
)


def test_tracked_names_use_word_boundaries() -> None:
    assert contains_tracked_name("How does ACME Inc compare?", ["Acme Inc"])
    assert not contains_tracked_name("Acmeology market trends", ["Acme"])


def test_core_prompts_are_brand_neutral() -> None:
    terms = {"brand_terms": ["Acme"], "competitor_terms": ["Globex"]}
    assert prompt_identity_is_valid(
        text="Which analytics platforms support retailers?",
        cohort="core",
        intent="discovery",
        **terms,
    )
    assert not prompt_identity_is_valid(
        text="Which Acme features support retailers?",
        cohort="core",
        intent="discovery",
        **terms,
    )


def test_comparisons_require_both_sides_and_comparison_intent() -> None:
    terms = {"brand_terms": ["Acme"], "competitor_terms": ["Globex"]}
    assert prompt_identity_is_valid(
        text="How does Acme compare with Globex for analytics?",
        cohort="comparison",
        intent="comparison",
        **terms,
    )
    assert not prompt_identity_is_valid(
        text="How does Globex compare for analytics?",
        cohort="comparison",
        intent="comparison",
        **terms,
    )
    assert not prompt_identity_is_valid(
        text="Why choose Acme instead of Globex?",
        cohort="comparison",
        intent="purchase",
        **terms,
    )
