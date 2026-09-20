import uuid
from dataclasses import replace
from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from pydantic import ValidationError

from app.connectors.answer_engines.errors import ProviderError
from app.connectors.search_intelligence_dataforseo import (
    ResearchResponse,
    _reported_cost,
    _response_body,
)
from app.core.config import settings
from app.core.config.dataforseo import pack_credential
from app.core.config.search_intelligence import estimate_dataset, page_sizes
from app.core.security import encrypt_secret
from app.domain.demand.search_intelligence import executor, targets
from app.domain.demand.search_intelligence.executor import _apply_reported_cost
from app.domain.demand.search_intelligence.normalization import normalize_result
from app.domain.demand.search_intelligence.pagination import (
    UnsupportedSortError,
    sorted_rows,
)
from app.domain.demand.search_intelligence.requests import build_request
from app.domain.demand.search_intelligence.schemas import DatasetSelection, ReviewCreate
from app.domain.demand.search_intelligence.service import _save_review_defaults
from app.domain.demand.search_intelligence.targets import CanonicalTarget
from app.domain.providers.dataforseo_identity import dataforseo_account_identity
from app.models.project import Project
from app.models.search_intelligence import SearchIntelligenceRun
from app.orchestration.provider_capacity import CapacityRequest

OWNED = CanonicalTarget(
    "primary",
    "Example",
    "example.com",
    "www.example.com",
    "https://www.example.com",
    "owned",
)


def test_backlink_identity_preserves_distinct_anchors_and_link_types():
    link = {
        "domain_from": "publisher.test",
        "url_from": "https://publisher.test/article",
        "url_to": OWNED.origin + "/page",
        "anchor": "Example",
        "item_type": "anchor",
    }
    _, rows, _ = normalize_result(
        "backlinks",
        {
            "items": [
                link,
                {**link, "anchor": "Read more"},
                {**link, "item_type": "image"},
                link,
            ]
        },
        {"target": OWNED.public_dict()},
    )
    keys = [row["provider_row_key"] for row in rows]
    assert len(set(keys)) == 3
    assert keys[0] == keys[3]


COMPETITOR = CanonicalTarget(
    "competitor",
    "Rival",
    "rival.test",
    "rival.test",
    "https://rival.test",
    "competitor",
)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "url",
    ["https://www.example.org/shop", "https://blog.example.org", "https://other.com"],
)
async def test_competitor_redirect_resolution_retains_saved_domain(monkeypatch, url):
    monkeypatch.setattr(
        targets,
        "resolve_site",
        AsyncMock(return_value=SimpleNamespace(canonical_url=url, status_code=200)),
    )
    target = replace(
        COMPETITOR,
        registrable_domain="example.org",
        hostname="example.org",
        origin="https://example.org",
    )
    if url == "https://www.example.org/shop":
        resolved = await targets.resolve_competitor(target)
        assert resolved.origin == "https://www.example.org"
        assert resolved.identity == COMPETITOR.identity
    else:
        with pytest.raises(targets.TargetScopeError):
            await targets.resolve_competitor(target)


@pytest.mark.parametrize("cost", [None, Decimal("0.2")])
def test_late_cost_does_not_overwrite_cancellation(cost):
    completed = datetime(2025, 1, 1, tzinfo=UTC)
    run = SearchIntelligenceRun(
        status="cancelled",
        estimated_cost_usd=Decimal("0.1"),
        uncertain_calls=0,
        error_code="cancelled",
        error_detail="Cancelled by user",
        completed_at=completed,
    )
    assert _apply_reported_cost(run, ResearchResponse({}, "", "", cost, None)) is True
    assert run.status == "cancelled"
    assert run.error_code == "cancelled"
    assert run.error_detail == "Cancelled by user"
    assert run.completed_at == completed
    assert run.provider_reported_cost_usd == cost


@pytest.mark.parametrize("count", [0, 1, 25, 26])
def test_review_dataset_count_is_bounded(count):
    datasets = [DatasetSelection(kind="footprint")] * count
    if 1 <= count <= 25:
        ReviewCreate(datasets=datasets)
    else:
        with pytest.raises(ValidationError):
            ReviewCreate(datasets=datasets)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("sort", "direction"), [("unsupported", "asc"), ("keyword", "sideways")]
)
async def test_invalid_ordering_is_distinct_from_invalid_cursor(sort, direction):
    with pytest.raises(UnsupportedSortError):
        await sorted_rows(
            None, None, cursor="invalid", limit=10, sort=sort, direction=direction
        )


def test_account_identity_survives_jwt_and_password_rotation(monkeypatch):
    def identity(login, password):
        return dataforseo_account_identity(
            encrypt_secret(pack_credential(login=login, password=password))
        )

    original = identity("Account@example.com", "old-password")
    monkeypatch.setattr(settings, "jwt_secret_key", "rotated-jwt-secret")
    assert identity(" account@EXAMPLE.com ", "new-password") == original
    assert identity("other@example.com", "new-password") != original


def test_quote_uses_ceil_pages_and_exact_decimal_rates() -> None:
    assert page_sizes(1001) == (1000, 1)
    assert estimate_dataset("ranking_keywords", rows=1001).estimated_usd == Decimal(
        "0.14412"
    )
    assert estimate_dataset("referring_domains", rows=1001).estimated_usd == Decimal(
        "0.084036"
    )


def test_request_contract_freezes_host_and_prefix_scope() -> None:
    _, ranking = build_request(
        kind="ranking_keywords",
        target=OWNED,
        comparison=None,
        location_code=2840,
        language_code="en",
        limit=1000,
        offset=0,
    )
    _, backlinks = build_request(
        kind="referring_domains",
        target=OWNED,
        comparison=None,
        location_code=None,
        language_code="",
        limit=1000,
        offset=0,
    )
    _, missing = build_request(
        kind="missing_keywords",
        target=OWNED,
        comparison=COMPETITOR,
        location_code=2840,
        language_code="en",
        limit=100,
        offset=0,
    )

    assert ranking["filters"] == [
        "ranked_serp_element.serp_item.domain",
        "=",
        "www.example.com",
    ]
    assert backlinks["include_subdomains"] is True
    assert backlinks["backlinks_filters"] == [
        [
            ["url_to", "like", "https://www.example.com/%"],
            "or",
            ["url_to", "like", "http://www.example.com/%"],
            "or",
            ["url_to", "=", "https://www.example.com"],
            "or",
            ["url_to", "=", "http://www.example.com"],
        ],
        "and",
        ["domain_from", "<>", "example.com"],
        "and",
        ["domain_from", "not_like", "%.example.com"],
    ]
    assert missing["pages"] == {"1": "https://rival.test/*"}
    assert missing["exclude_pages"] == ["https://www.example.com/*"]


def test_normalizer_rejects_provider_rows_outside_reviewed_scope() -> None:
    plan = {"target": OWNED.public_dict(), "comparison": None}
    result = {
        "items": [
            {
                "keyword_data": {"keyword": "escape"},
                "ranked_serp_element": {
                    "serp_item": {"type": "organic", "url": "https://other.test/page"}
                },
            }
        ]
    }

    with pytest.raises(ValueError, match="canonical host scope"):
        normalize_result("ranking_keywords", result, plan)

    result["items"][0]["ranked_serp_element"]["serp_item"]["url"] = (
        "http://www.example.com/page"
    )
    _, rows, _ = normalize_result("ranking_keywords", result, plan)
    assert rows[0]["url"] == "http://www.example.com/page"
    result["items"][0]["ranked_serp_element"]["serp_item"]["url"] = (
        "https://www.example.com.evil.test/page"
    )
    with pytest.raises(ValueError, match="canonical host scope"):
        normalize_result("ranking_keywords", result, plan)


def test_task_cost_wins_over_envelope_cost() -> None:
    assert _reported_cost({"cost": 9, "tasks": [{"cost": "0.024"}]}) == (
        Decimal("0.024"),
        "task",
    )
    assert _reported_cost({"cost": "0.12", "tasks": [{}]}) == (
        Decimal("0.12"),
        "envelope",
    )
    assert _reported_cost({"tasks": [{}]}) == (None, None)


def test_competitor_scope_is_explicit_per_dataset_kind() -> None:
    DatasetSelection(
        kind="referring_domains",
        competitor_id="7bc011d3-67d3-4ec8-8669-29fe18e3bfc5",
        depth=10,
    )
    with pytest.raises(ValueError, match="does not support"):
        DatasetSelection(
            kind="ranking_keywords",
            competitor_id="7bc011d3-67d3-4ec8-8669-29fe18e3bfc5",
            depth=10,
        )
    with pytest.raises(ValueError, match="require one competitor"):
        DatasetSelection(kind="missing_keywords", depth=10)


def test_backlink_summary_preserves_zero_and_unknown_metrics() -> None:
    plan = {"target": OWNED.public_dict(), "comparison": None}
    summary, rows, total = normalize_result(
        "backlink_summary",
        {"backlinks": 0, "referring_main_domains": None, "rank": 0},
        plan,
    )

    assert {
        key: summary[key]
        for key in (
            "backlinks",
            "referring_main_domains",
            "rank",
            "rank_scale",
            "object_type",
        )
    } == {
        "backlinks": 0,
        "referring_main_domains": None,
        "rank": 0,
        "rank_scale": "one_hundred",
        "object_type": "analyzed_domain",
    }
    assert rows == []
    assert total is None


@pytest.mark.parametrize("port", ["", ":8443"])
def test_backlink_url_filters_preserve_explicit_port(port):
    _, request = build_request(
        kind="backlink_summary",
        target=replace(OWNED, origin=f"https://www.example.com{port}"),
        comparison=None,
        location_code=None,
        language_code="",
        limit=1,
        offset=0,
    )
    predicates = request["backlinks_filters"][0][::2]
    assert [item[2] for item in predicates] == [
        f"https://www.example.com{port}/%",
        f"http://www.example.com{port}/%",
        f"https://www.example.com{port}",
        f"http://www.example.com{port}",
    ]
    assert request["include_indirect_links"] is False


def test_broad_backlink_request_keeps_indirect_links_without_destination_filter():
    _, request = build_request(
        kind="backlink_summary",
        target=OWNED,
        comparison=None,
        location_code=None,
        language_code="",
        limit=1,
        offset=0,
        research_scope="domain_subdomains",
    )
    assert request["include_indirect_links"] is True
    assert all(
        item[0] == "domain_from"
        for item in request["backlinks_filters"]
        if isinstance(item, list)
    )


@pytest.mark.parametrize("kind", ["ranking_keywords", "organic_pages", "backlinks"])
@pytest.mark.parametrize(
    "host,allowed",
    [
        ("shop.example.com", True),
        ("example.com.evil.test", False),
        ("otherexample.com", False),
    ],
)
def test_broad_rows_allow_only_owned_domain_tree(kind, host, allowed):
    url = f"https://{host}/page?q=1"
    item = {
        "page_address": url,
        "url_to": url,
        "domain_from": "outside.test",
        "url_from": "https://outside.test/p",
        "keyword_data": {"keyword": "family", "keyword_info": {"cpc": 1.25}},
        "ranked_serp_element": {
            "serp_item": {"url": url, "rank_group": 2, "rank_absolute": 4}
        },
    }
    plan = {"target": OWNED.public_dict(), "research_scope": "domain_subdomains"}
    if not allowed:
        with pytest.raises(ValueError):
            normalize_result(kind, {"items": [item]}, plan)
        return
    _, rows, _ = normalize_result(kind, {"items": [item]}, plan)
    assert rows[0]["url"] == url
    if kind == "ranking_keywords":
        assert rows[0]["rank_group"] == 2
        assert rows[0]["auxiliary"]["rank_absolute"] == 4
        assert rows[0]["auxiliary"]["cpc"] == "1.25"


def test_broad_comparison_direction_and_history_price():
    endpoint, request = build_request(
        kind="missing_keywords",
        target=OWNED,
        comparison=COMPETITOR,
        location_code=2036,
        language_code="en",
        limit=100,
        offset=0,
        research_scope="domain_subdomains",
    )
    assert endpoint.endswith("domain_intersection/live")
    assert request["target1"] == "rival.test"
    assert request["target2"] == "example.com"
    assert request["intersections"] is False
    assert "include_subdomains" not in request
    plan = {
        "target": OWNED.public_dict(),
        "comparison": COMPETITOR.public_dict(),
        "research_scope": "domain_subdomains",
    }
    _, rows, _ = normalize_result(
        "shared_keywords",
        {
            "items": [
                {
                    "keyword_data": {"keyword": "family"},
                    "first_domain_serp_element": {
                        "url": "https://shop.rival.test/x",
                        "rank_group": 2,
                    },
                    "second_domain_serp_element": {
                        "url": "https://example.com/x",
                        "rank_group": 5,
                    },
                }
            ]
        },
        plan,
    )
    assert (rows[0]["rank_group"], rows[0]["owned_rank_group"]) == (2, 5)
    assert estimate_dataset("backlink_history", rows=13).estimated_usd == Decimal(
        "0.024468"
    )


@pytest.mark.parametrize(
    ("cost", "status", "error_code"),
    [
        (None, "uncertain", "provider_cost_unavailable"),
        (Decimal("0.2"), "partial", "cost_ceiling_exceeded"),
        (Decimal("0.1"), "running", ""),
    ],
)
def test_reported_cost_terminalizes_only_stopped_runs(cost, status, error_code) -> None:
    run = SearchIntelligenceRun(
        status="running",
        estimated_cost_usd=Decimal("0.1"),
        uncertain_calls=0,
        error_code="",
    )
    before = datetime.now(UTC)
    stopped = _apply_reported_cost(run, ResearchResponse({}, "", "", cost, None))

    assert stopped is (status != "running")
    assert run.status == status
    assert run.error_code == error_code
    if stopped:
        assert before <= run.completed_at <= datetime.now(UTC)
    else:
        assert run.completed_at is None
        assert run.provider_reported_cost_usd == cost


def test_review_defaults_preserve_other_depths_and_selected_depth_one() -> None:
    project = Project()
    project.search_intelligence_preferences = {"depths": {"organic_pages": 75}}
    competitor_id = uuid.uuid4()
    payload = ReviewCreate(
        datasets=[
            DatasetSelection(kind="footprint", depth=20),
            DatasetSelection(kind="backlink_summary", depth=2),
            DatasetSelection(kind="ranking_keywords", depth=500),
            DatasetSelection(kind="referring_domains", depth=1),
            DatasetSelection(kind="missing_keywords", competitor_id=competitor_id),
            DatasetSelection(kind="shared_keywords", competitor_id=competitor_id),
        ]
    )

    _save_review_defaults(project, payload, 2840, "en")

    depths = project.search_intelligence_preferences["depths"]
    assert depths["ranking_keywords"] == 500
    assert depths["referring_domains"] == 1
    assert depths["organic_pages"] == 75
    assert "footprint" not in depths
    assert project.search_intelligence_preferences["competitor_ids"] == [
        str(competitor_id)
    ]


def test_non_keyword_acquisition_rejects_ignored_controls() -> None:
    with pytest.raises(ValueError, match="keyword dataset"):
        DatasetSelection(kind="backlinks", order="traffic")
    with pytest.raises(ValueError, match="keyword dataset"):
        DatasetSelection(kind="organic_pages", min_volume=10)


@pytest.mark.asyncio
async def test_provider_rate_limit_releases_shared_capacity_with_retry_hint(
    monkeypatch,
):
    rate_limited = httpx.Response(429, headers={"Retry-After": "12"})
    with pytest.raises(ProviderError) as raised:
        _response_body(rate_limited)
    release = AsyncMock()
    monkeypatch.setattr(executor, "execute_live", AsyncMock(side_effect=raised.value))
    monkeypatch.setattr(executor, "release_provider_capacity", release)
    request = CapacityRequest(
        task_id=None,
        analytics_task_id=uuid.uuid4(),
        attempt_number=1,
        logical_engine="search_intelligence",
        transport_provider="dataforseo",
        credential_kind="byok",
        connection_id=uuid.uuid4(),
    )

    response, error = await executor._send_once(
        None,
        request,
        executor._PreparedCall("dispatch"),
        {"endpoint": "/test", "request": {}},
    )

    assert response is None
    assert error is raised.value
    outcome = release.call_args.kwargs["outcome"]
    assert outcome.kind == "rate_limited"
    assert outcome.retry_after_seconds == 12
