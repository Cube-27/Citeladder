"""Shared commercial instructions and isolation from Commerce's existing examples."""

from app.core.config.visibility_prompts import (
    cohort_system_prompt,
)


def test_core_instruction_sets_commercial_objective_without_quotas() -> None:
    instruction = cohort_system_prompt("b2b_saas")
    assert "spreadsheets" in instruction
    assert "Avoid generic definitions" in instruction
    assert "replace weak or repetitive items yourself" in instruction
    assert "do not name the tracked business" in instruction
    assert "not generation quotas" in instruction
    assert "seven archetypes" not in instruction


def test_named_cohorts_do_not_inherit_core_identity_prohibition() -> None:
    diagnostic = cohort_system_prompt("retail", "brand_diagnostic")
    comparison = cohort_system_prompt("retail", "comparison")
    assert "Every query must name the tracked brand" in diagnostic
    assert "do not name the tracked business" not in diagnostic
    assert "at least one supplied competitor" in comparison


def test_unknown_business_model_uses_neutral_register() -> None:
    instruction = cohort_system_prompt("")
    assert "Which providers should I shortlist" in instruction
    assert "selvedge" not in instruction


def test_commerce_retains_its_existing_instruction_examples() -> None:
    from app.core.config.commerce_catalog import commerce_buyer_prompt_system

    instruction = commerce_buyer_prompt_system("retail")
    assert "I want to buy cheap baby clothes in bulk" in instruction
    assert "Never name the owned brand or the exact owned product" in instruction
