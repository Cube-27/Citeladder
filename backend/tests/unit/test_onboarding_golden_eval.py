"""Offline and mocked-network coverage for onboarding golden evaluation."""

from __future__ import annotations

import json

import httpx

from app.evaluations.onboarding_golden import (
    BRAND_RELEVANT_COUNT,
    GOLDEN_ONBOARDING_CASES,
    MARKET_VISIBILITY_COUNT,
    PORTFOLIO_SIZE,
    PortfolioPrompt,
    evaluate_competitors,
    evaluate_portfolio,
    evaluate_with_nvidia,
)


def _valid_portfolio(case) -> list[PortfolioPrompt]:
    market = case.primary_market
    products = case.products_or_services
    use_cases = case.use_cases
    return [
        PortfolioPrompt(
            f"What are my best options for {products[0]} in {market}?",
            "market_visibility",
        ),
        PortfolioPrompt(
            f"Which provider should I choose for {products[1]} in {market}?",
            "market_visibility",
        ),
        PortfolioPrompt(
            f"How do I compare {products[2]} options in {market}?",
            "market_visibility",
        ),
        PortfolioPrompt(
            f"What is the best way for me to {use_cases[0]} in {market}?",
            "market_visibility",
        ),
        PortfolioPrompt(
            f"Which tools can help me {use_cases[1]} in {market}?",
            "market_visibility",
        ),
        PortfolioPrompt(
            f"Which provider can help me {use_cases[2]} in {market}?",
            "brand_relevant",
        ),
        PortfolioPrompt(
            f"Where can I find {products[0]} in {market}?",
            "brand_relevant",
        ),
        PortfolioPrompt(
            f"When should I choose a provider for {products[1]} in {market}?",
            "brand_relevant",
        ),
        PortfolioPrompt(
            f"What should I look for when choosing {products[2]} in {market}?",
            "brand_relevant",
        ),
        PortfolioPrompt(
            f"Which options can help me {use_cases[0]} in {market}?",
            "brand_relevant",
        ),
    ]


def test_golden_corpus_covers_the_agreed_five_market_cases() -> None:
    assert [case.slug for case in GOLDEN_ONBOARDING_CASES] == [
        "flipkart-india",
        "best-less-australia",
        "feedonomics-united-states",
        "canva-australia",
        "puma-india",
    ]
    assert all(case.primary_market for case in GOLDEN_ONBOARDING_CASES)
    assert all(case.expected_competitors for case in GOLDEN_ONBOARDING_CASES)


def test_portfolio_evaluation_accepts_a_balanced_market_aware_portfolio() -> None:
    for case in GOLDEN_ONBOARDING_CASES:
        result = evaluate_portfolio(case, _valid_portfolio(case))
        assert result.valid, (case.slug, result.issues)
        assert result.market_visibility_count == MARKET_VISIBILITY_COUNT
        assert result.brand_relevant_count == BRAND_RELEVANT_COUNT


def test_portfolio_evaluation_rejects_identity_duplicates_and_missing_coverage() -> (
    None
):
    case = GOLDEN_ONBOARDING_CASES[0]
    prompts = _valid_portfolio(case)
    prompts[0] = PortfolioPrompt(
        "Is Flipkart better than Amazon India in India?", "market_visibility"
    )
    prompts[-1] = PortfolioPrompt(prompts[-2].text, "brand_relevant")
    result = evaluate_portfolio(case, prompts)
    assert not result.valid
    assert "prompt portfolio contains duplicate questions" in result.issues
    assert "all prompts must be brand and competitor neutral" in result.issues


def test_competitor_evaluation_reports_overlap_and_unexpected_names() -> None:
    case = GOLDEN_ONBOARDING_CASES[0]
    result = evaluate_competitors(case, ["Amazon India", "Meesho", "Random Shop"])
    assert result.precision == 2 / 3
    assert result.recall == 2 / 5
    assert set(result.missing) == {"JioMart", "Myntra", "Tata CLiQ"}
    assert result.unexpected == ("Random Shop",)


async def test_nvidia_evaluation_skips_without_a_key(monkeypatch) -> None:
    monkeypatch.delenv("NVIDIA_API_KEY", raising=False)
    result = await evaluate_with_nvidia(
        GOLDEN_ONBOARDING_CASES[0], _valid_portfolio(GOLDEN_ONBOARDING_CASES[0])
    )
    assert result.skipped
    assert result.quality_score is None


async def test_nvidia_evaluation_uses_json_mode_without_exposing_key() -> None:
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["authorization"] = request.headers["authorization"]
        captured["payload"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {"quality_score": 91, "findings": ["market-specific"]}
                            )
                        }
                    }
                ]
            },
        )

    case = GOLDEN_ONBOARDING_CASES[0]
    result = await evaluate_with_nvidia(
        case,
        _valid_portfolio(case),
        api_key="test-key",
        endpoint="https://mock.nvidia.test/v1/chat/completions",
        transport=httpx.MockTransport(handler),
    )
    assert not result.skipped
    assert result.quality_score == 91
    assert captured["authorization"] == "Bearer test-key"
    assert "test-key" not in json.dumps(captured["payload"])
    assert captured["payload"]["response_format"] == {"type": "json_object"}
    assert len(captured["payload"]["messages"][1]["content"]) > PORTFOLIO_SIZE
