"""Provisional competitor discovery uses one search and stable identity cleanup."""

from __future__ import annotations

import json

import pytest

from app.connectors.keenable import KeenableSearchResponse, KeenableSearchResult
from app.domain.projects.discovery_schemas import DiscoveryProfile
from app.domain.projects.onboarding.competitor_research import (
    discover_competitor_candidates,
    suggest_competitors,
)
from app.domain.projects.onboarding.research_evidence import (
    CompetitiveSignature,
    ResearchCallBudget,
)


class _Search:
    def __init__(self, *, fails: bool = False) -> None:
        self.calls: list[str] = []
        self.fails = fails

    async def search(self, query: str, **_kwargs) -> KeenableSearchResponse:
        self.calls.append(query)
        if self.fails:
            raise RuntimeError("search unavailable")
        return KeenableSearchResponse(
            results=(
                KeenableSearchResult(
                    title="Owned", url="https://acme.com", snippet="owned"
                ),
                KeenableSearchResult(
                    title="Directory", url="https://g2.com/list", snippet="peer"
                ),
                KeenableSearchResult(
                    title="Source",
                    url="https://source.com/list",
                    snippet="Peer offers workflow tools",
                ),
                KeenableSearchResult(
                    title="Duplicate source",
                    url="https://source.com/other",
                    snippet="Peer",
                ),
            )
        )


class _Gateway:
    base_url_host = "provider.test"
    model = "model-test"

    def __init__(self, competitors: list[dict]) -> None:
        self.competitors = competitors
        self.calls = 0

    async def complete_structured_json(self, **_kwargs) -> str:
        self.calls += 1
        return json.dumps({"competitors": self.competitors})


@pytest.mark.asyncio
async def test_optional_search_is_one_bounded_category_market_query() -> None:
    client = _Search()
    budget = ResearchCallBudget(2)
    result = await discover_competitor_candidates(
        client,
        owned_domain="acme.com",
        signature=CompetitiveSignature(category="workflow analytics"),
        budget=budget,
        market="United States",
    )
    assert client.calls == ["workflow analytics United States competing brands"]
    assert budget.used == 1
    assert [item.source_url for item in result.evidence] == ["https://source.com/list"]
    assert result.state == "ready"


@pytest.mark.asyncio
async def test_failed_search_does_not_block_model_suggestions() -> None:
    search = await discover_competitor_candidates(
        _Search(fails=True),
        owned_domain="acme.com",
        signature=CompetitiveSignature(category="workflow analytics"),
        budget=ResearchCallBudget(1),
    )
    gateway = _Gateway([{"name": " Peer  Inc ", "domain": "https://www.peer.com/path"}])
    suggestions = await suggest_competitors(
        gateway,
        profile=DiscoveryProfile(category="workflow analytics"),
        signature=CompetitiveSignature(category="workflow analytics"),
        evidence=search.evidence,
        brand_name="Acme",
        owned_domain="acme.com",
    )
    assert search.state == "failed"
    assert gateway.calls == 1
    assert [(item.name, item.domains) for item in suggestions] == [
        ("Peer Inc", ["peer.com"])
    ]


@pytest.mark.asyncio
async def test_suggestions_drop_noise_duplicates_and_owned_domains_in_model_order() -> (
    None
):
    gateway = _Gateway(
        [
            {"name": "First", "domain": "first.com"},
            {"name": "Same site", "domain": "https://www.first.com/about"},
            {"name": "Owned", "domain": "acme.com"},
            {"name": "Directory", "domain": "g2.com"},
            {"name": "FIRST", "domain": "another.com"},
            {"name": "Second", "domain": "second.com"},
            {"name": "Invalid", "domain": "not a domain"},
        ]
    )
    suggestions = await suggest_competitors(
        gateway,
        profile=DiscoveryProfile(category="workflow analytics"),
        signature=CompetitiveSignature(category="workflow analytics"),
        evidence=(),
        brand_name="Acme",
        owned_domain="acme.com",
    )
    assert [(item.name, item.domains[0]) for item in suggestions] == [
        ("First", "first.com"),
        ("Second", "second.com"),
    ]
