"""Unit coverage for the greenfield brand-discovery boundary."""

import asyncio
import json
import uuid
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.connectors.web_evidence.brand_evidence import BrandEvidencePage
from app.connectors.web_evidence.firecrawl import FirecrawlPage
from app.core.config.brand_discovery import (
    BrandDiscoverySettings,
    brand_discovery_settings,
)
from app.domain.projects import discovery as discovery_domain
from app.domain.projects.brand_evidence import BrandEvidence
from app.domain.projects.discovery import (
    BrandDiscoveryError,
    _apply_grouped_completion,
    _candidate_name,
    _capacity_approved_prompt_rows,
    _collect_owned_site,
    _complete_synthesis,
    _confirmed_competitor_items,
    _discovery_topic_rows,
    _normalized_url,
    _progress,
    _validated_prompt_suggestions,
    discovery_catalog,
)
from app.domain.projects.discovery_schemas import (
    BrandDiscoveryComplete,
    BrandDiscoveryCreate,
    DiscoveryProfile,
    DiscoverySynthesis,
)
from app.domain.projects.schemas import CompetitorInput
from app.models.discovery import BrandDiscovery
from app.models.prompt import Prompt
from app.workers import brand_discovery_worker


def test_discovery_catalog_declares_required_inputs_and_evidence_methods() -> None:
    catalog = discovery_catalog()

    assert catalog["required_fields"] == ["brand_name", "website_url"]
    assert catalog["business_types"] == ["b2b", "b2c", "both"]
    assert set(catalog["capture_methods"]) == {
        "secure_crawler",
        "firecrawl_rendered",
        "firecrawl_search",
        "user_input",
    }


def test_discovery_requires_the_official_website_anchor() -> None:
    with pytest.raises(ValidationError):
        BrandDiscoveryCreate(brand_name="Acme")


@pytest.mark.asyncio
async def test_owned_site_collection_crawls_the_user_supplied_website(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    crawled_urls: list[str] = []

    async def approve(url: str) -> SimpleNamespace:
        crawled_urls.append(f"approved:{url}")
        return SimpleNamespace(url=url)

    async def collect(url: str) -> BrandEvidence:
        crawled_urls.append(f"secure:{url}")
        return BrandEvidence(
            pages=(
                BrandEvidencePage(
                    url=url,
                    title="Acme",
                    meta_description="Analytics for marketing teams",
                    text="First-party product evidence",
                ),
            )
        )

    async def render(url: str) -> FirecrawlPage:
        crawled_urls.append(f"firecrawl:{url}")
        return FirecrawlPage(url=url, title="Acme", text="Rendered product evidence")

    monkeypatch.setattr(discovery_domain, "_approve_vendor_url", approve)
    monkeypatch.setattr(discovery_domain, "collect_brand_evidence", collect)
    monkeypatch.setattr(discovery_domain, "rendered_scrape", render)
    monkeypatch.setattr(brand_discovery_settings, "minimum_evidence_words", 5)
    row = BrandDiscovery(
        input_data={"brand_name": "Acme", "website_url": "www.acme.example/products"}
    )

    result = await _collect_owned_site(row, row.input_data)

    assert result.homepage.startswith("https://www.acme.example/products")
    assert result.owned_domain == "acme.example"
    assert crawled_urls == [
        f"approved:{result.homepage}",
        f"secure:{result.homepage}",
        f"firecrawl:{result.homepage}",
    ]
    assert "First-party product evidence" in result.captured_text
    assert "Rendered product evidence" in result.captured_text
    assert result.gaps == []


@pytest.mark.asyncio
async def test_owned_site_collection_marks_evidence_below_configured_word_floor(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def no_op(url: str) -> SimpleNamespace:
        return SimpleNamespace(url=url)

    async def collect(url: str) -> BrandEvidence:
        return BrandEvidence(
            pages=(
                BrandEvidencePage(
                    url=url,
                    title="Acme",
                    meta_description="",
                    text="Too little evidence",
                ),
            )
        )

    async def render(url: str) -> FirecrawlPage:
        return FirecrawlPage(url=url, title="Acme", text="")

    monkeypatch.setattr(discovery_domain, "_approve_vendor_url", no_op)
    monkeypatch.setattr(discovery_domain, "collect_brand_evidence", collect)
    monkeypatch.setattr(discovery_domain, "rendered_scrape", render)
    monkeypatch.setattr(brand_discovery_settings, "minimum_evidence_words", 4)
    row = BrandDiscovery(
        input_data={"brand_name": "Acme", "website_url": "acme.example"}
    )

    result = await _collect_owned_site(row, row.input_data)

    assert result.gaps == ["official_site_evidence"]


@pytest.mark.parametrize(
    "value",
    [
        "localhost",
        "http://127.0.0.1",
        "http://10.0.0.8",
        "http://172.16.0.1",
        "http://192.168.1.1",
        "http://169.254.169.254/latest/meta-data",
        "http://[::1]",
        "http://[fc00::1]",
        "file:///etc/passwd",
        "not a valid host",
    ],
)
def test_normalized_url_rejects_malformed_and_non_public_targets(value: str) -> None:
    with pytest.raises(BrandDiscoveryError):
        _normalized_url(value)


def test_normalized_url_canonicalizes_and_derives_owned_domain() -> None:
    url, domain = _normalized_url("WWW.Example.COM/products/?utm_source=test")

    assert url.startswith("https://www.example.com/products")
    assert domain == "example.com"


def test_candidate_name_uses_title_then_domain_without_inventing_identity() -> None:
    assert _candidate_name("Acme | Official Website", "acme.example") == "Acme"
    assert _candidate_name("", "shop.example.com") == "Shop"


def test_discovery_prompt_validation_enforces_core_and_comparison_identity() -> None:
    synthesis = DiscoverySynthesis.model_validate(
        {
            "profile": {"business_type": "b2b"},
            "competitors": [],
            "topics": ["Analytics"],
            "prompts": [
                {
                    "text": "Which analytics platforms support marketing attribution?",
                    "theme": "Analytics",
                    "intent": "discovery",
                    "cohort": "core",
                },
                {
                    "text": "Is Acme a good analytics platform?",
                    "theme": "Analytics",
                    "intent": "discovery",
                    "cohort": "core",
                },
                {
                    "text": "How does Acme compare with Globex for attribution?",
                    "theme": "Analytics",
                    "intent": "comparison",
                    "cohort": "comparison",
                },
                {
                    "text": "How does Acme compare with other platforms?",
                    "theme": "Analytics",
                    "intent": "comparison",
                    "cohort": "comparison",
                },
            ],
        }
    )

    prompts = _validated_prompt_suggestions(
        synthesis,
        brand_name="Acme",
        competitors=[{"name": "Globex", "aliases": [], "domains": ["globex.com"]}],
    )

    assert [prompt["text"] for prompt in prompts] == [
        "Which analytics platforms support marketing attribution?",
    ]


def test_discovery_prompt_limit_preserves_final_core_share(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    synthesis = DiscoverySynthesis.model_validate(
        {
            "profile": {},
            "topics": ["Analytics"],
            "prompts": [
                {
                    "text": f"Which analytics platform supports capability {index}?",
                    "theme": "Analytics",
                    "intent": "discovery",
                    "cohort": "core",
                }
                for index in range(3)
            ]
            + [
                {
                    "text": "How does Acme compare with Globex for analytics?",
                    "theme": "Analytics",
                    "intent": "comparison",
                    "cohort": "comparison",
                }
            ],
        }
    )
    monkeypatch.setattr(brand_discovery_settings, "synthesis_prompt_count", 2)

    prompts = _validated_prompt_suggestions(
        synthesis,
        brand_name="Acme",
        competitors=[{"name": "Globex", "aliases": [], "domains": ["globex.com"]}],
    )

    assert [prompt["cohort"] for prompt in prompts] == ["core", "core"]


def test_discovery_topics_are_deduplicated_case_insensitively() -> None:
    topics = _discovery_topic_rows(
        ["Analytics", "analytics", "Commerce"], uuid.uuid4()
    )

    assert [topic.name for topic in topics] == ["Analytics", "Commerce"]


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("firecrawl_max_attempts", 0),
        ("synthesis_max_attempts", 0),
        ("firecrawl_timeout_seconds", 0),
        ("synthesis_prompt_count", 0),
    ],
)
def test_brand_discovery_numeric_settings_reject_non_positive_values(
    field: str, value: int
) -> None:
    with pytest.raises(ValidationError):
        BrandDiscoverySettings.model_validate({field: value})


def test_discovery_profile_rejects_unsupported_price_tier() -> None:
    with pytest.raises(ValidationError):
        DiscoveryProfile(price_tier="affordable")


def test_confirmed_competitors_reject_brand_identity_and_owned_domain() -> None:
    matching_brand = CompetitorInput(name="Acme", domains=["other.example"])
    with pytest.raises(BrandDiscoveryError, match="tracked brand"):
        _confirmed_competitor_items(
            [matching_brand],
            brand_name="Acme",
            owned_domains=["acme.example"],
        )

    matching_domain = CompetitorInput(name="Globex", domains=["acme.example"])
    with pytest.raises(BrandDiscoveryError, match="owned domain"):
        _confirmed_competitor_items(
            [matching_domain],
            brand_name="Acme",
            owned_domains=["acme.example"],
        )


def test_confirmed_competitors_normalize_domains_and_reject_duplicates() -> None:
    confirmed = _confirmed_competitor_items(
        [
            CompetitorInput(
                name="Globex",
                domains=["https://www.globex.example/pricing", "globex.example"],
            )
        ],
        brand_name="Acme",
        owned_domains=["acme.example"],
    )
    assert confirmed[0]["domains"] == ["globex.example"]


def test_sixth_competitor_and_unbounded_grouped_prompts_are_rejected() -> None:
    competitors = [
        {"name": f"Peer {index}", "domains": [f"peer{index}.example"]}
        for index in range(6)
    ]
    with pytest.raises(ValidationError):
        BrandDiscoveryComplete.model_validate(
            {
                "profile": {},
                "domains": ["acme.example"],
                "competitors": competitors,
                "prompt_groups": [
                    {
                        "topic": "General",
                        "prompts": [
                            {
                                "text": "Which platform solves this need?",
                                "intent": "discovery",
                                "cohort": "core",
                            }
                        ],
                    }
                ],
            }
        )


def test_progress_counters_never_decrease_across_terminal_transition() -> None:
    previous = {
        "completed_steps": 3,
        "pages_read": 7,
        "competitors_found": 4,
        "prompts_prepared": 9,
    }
    result = _progress(phase="complete", completed_steps=99, previous=previous)

    assert result["completed_steps"] == result["total_steps"] == 5
    assert result["pages_read"] == 7
    assert result["competitors_found"] == 4
    assert result["prompts_prepared"] == 9


@pytest.mark.asyncio
async def test_heartbeat_cleanup_isolates_non_cancellation_failure() -> None:
    async def fail_heartbeat() -> None:
        raise RuntimeError("heartbeat failed")

    heartbeat = asyncio.create_task(fail_heartbeat())
    await asyncio.sleep(0)

    await brand_discovery_worker._stop_heartbeat(heartbeat)


def test_grouped_completion_revalidates_cohort_identity() -> None:
    row = BrandDiscovery(
        input_data={"brand_name": "Acme", "website_url": "https://acme.example"}
    )
    payload = BrandDiscoveryComplete.model_validate(
        {
            "profile": {},
            "domains": ["acme.example"],
            "competitors": [{"name": "Globex", "domains": ["globex.example"]}],
            "prompt_groups": [
                {
                    "topic": "Analytics",
                    "prompts": [
                        {
                            "text": "Is Acme the best analytics platform?",
                            "intent": "discovery",
                            "cohort": "core",
                        }
                    ],
                }
            ],
        }
    )

    with pytest.raises(BrandDiscoveryError, match="cohort"):
        _apply_grouped_completion(row, payload=payload, key="complete-1")


@pytest.mark.asyncio
async def test_capacity_filter_retains_first_duplicate_prompt_only(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    prompt_set_id = uuid.uuid4()
    prompts = [
        Prompt(prompt_set_id=prompt_set_id, text="Which platform is best?"),
        Prompt(prompt_set_id=prompt_set_id, text="  which PLATFORM is best?  "),
    ]

    async def approve(*_args, **_kwargs) -> frozenset[str]:
        return frozenset({prompts[0].normalized_text_hash})

    monkeypatch.setattr(discovery_domain, "prepare_prompt_inserts", approve)
    retained = await _capacity_approved_prompt_rows(
        SimpleNamespace(),
        workspace_id=uuid.uuid4(),
        prompt_set_id=prompt_set_id,
        prompt_rows=prompts,
    )

    assert retained == [prompts[0]]


@pytest.mark.asyncio
async def test_synthesis_retries_branded_heavy_prompt_portfolio() -> None:
    class FakeAgent:
        def __init__(self) -> None:
            self.users: list[dict] = []

        async def complete_json(self, *, system: str, user: str) -> str:
            del system
            payload = json.loads(user)
            self.users.append(payload)
            prompts = (
                [
                    {
                        "text": f"Why choose Acme for analytics {index}?",
                        "theme": "Analytics",
                        "intent": "discovery",
                        "cohort": "core",
                    }
                    for index in range(5)
                ]
                if len(self.users) == 1
                else [
                    {
                        "text": f"Which analytics platform supports need {index}?",
                        "theme": "Analytics",
                        "intent": "discovery",
                        "cohort": "core",
                    }
                    for index in range(4)
                ]
                + [
                    {
                        "text": "How does Acme compare with Globex for analytics?",
                        "theme": "Analytics",
                        "intent": "comparison",
                        "cohort": "comparison",
                    }
                ]
            )
            return json.dumps(
                {
                    "profile": {},
                    "competitors": [],
                    "topics": ["Analytics"],
                    "prompts": prompts,
                }
            )

    agent = FakeAgent()
    result = await _complete_synthesis(
        agent,
        user_payload={
            "brand_name": "Acme",
            "verified_competitors": [
                {"name": "Globex", "aliases": [], "domains": ["globex.example"]}
            ],
        },
        attempts_remaining=2,
    )

    assert len(agent.users) == 2
    assert agent.users[1]["previous_validation_errors"]
    assert len(result.prompts) == 5
