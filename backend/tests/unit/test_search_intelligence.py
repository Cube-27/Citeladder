import uuid
from datetime import UTC, datetime
from decimal import Decimal
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
from app.domain.demand.search_intelligence import executor
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
COMPETITOR = CanonicalTarget(
    "competitor",
    "Rival",
    "rival.test",
    "rival.test",
    "https://rival.test",
    "competitor",
)


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

    assert summary == {
        "backlinks": 0,
        "referring_main_domains": None,
        "rank": 0,
        "rank_scale": "one_hundred",
        "object_type": "analyzed_domain",
    }
    assert rows == []
    assert total is None


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


def test_review_defaults_keep_only_supported_expanded_depths() -> None:
    project = Project()
    payload = ReviewCreate(
        datasets=[
            DatasetSelection(kind="footprint", depth=20),
            DatasetSelection(kind="backlink_summary", depth=2),
            DatasetSelection(kind="ranking_keywords", depth=500),
            DatasetSelection(kind="referring_domains", depth=1),
        ]
    )

    _save_review_defaults(project, payload, 2840, "en")

    assert project.search_intelligence_preferences["depths"] == {
        "ranking_keywords": 500
    }


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
