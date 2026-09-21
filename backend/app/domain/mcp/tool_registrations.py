"""Registration adapter for the persisted MCP evidence tools."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any, Literal

from app.core.database import SessionLocal
from app.domain.mcp.data import read_growth_evidence
from app.domain.mcp.evidence_readers import (
    read_prompt_portfolio as read_prompt_portfolio_data,
)
from app.domain.mcp.evidence_readers import (
    read_query_evidence as read_query_evidence_data,
)
from app.domain.mcp.evidence_readers import (
    read_search_dataset as read_search_dataset_data,
)
from app.domain.mcp.evidence_readers import (
    read_search_intelligence as read_search_intelligence_data,
)
from app.domain.mcp.evidence_readers import (
    read_site_links as read_site_links_data,
)
from app.domain.mcp.evidence_readers import (
    read_site_pages as read_site_pages_data,
)
from app.domain.mcp.evidence_readers import (
    read_visibility_results as read_visibility_results_data,
)
from app.domain.mcp.evidence_readers import (
    read_visibility_sources as read_visibility_sources_data,
)
from app.domain.mcp.schemas import EvidenceResponse

PerformanceRange = Literal[
    "day", "week", "month", "3_months", "6_months", "last_synced", "custom"
]
PerformanceGranularity = Literal["day", "week", "month"]
PerformanceCompare = Literal["none", "previous", "year_over_year", "custom"]
PerformanceDimension = Literal[
    "query",
    "page",
    "country",
    "device",
    "search_appearance",
    "day",
    "bing_query",
    "bing_page",
]


def _register_summary_tools(
    evidence_tool: Callable[
        [str, str, str], Callable[[Callable[..., Any]], Callable[..., Any]]
    ],
) -> None:
    @evidence_tool(
        "read_site_health",
        "Read latest Site Health",
        "Read the latest persisted Site Health score and coverage projection for "
        "a project.",
    )
    async def read_site_health(project_id: str) -> EvidenceResponse:
        async with SessionLocal() as session:
            return EvidenceResponse.model_validate(
                await read_growth_evidence(session, project_id, "site.read_snapshot")
            )

    @evidence_tool(
        "read_demand",
        "Read latest demand intelligence",
        "Read the latest persisted demand snapshot, coverage, and comparison for "
        "a project.",
    )
    async def read_demand(project_id: str) -> EvidenceResponse:
        async with SessionLocal() as session:
            return EvidenceResponse.model_validate(
                await read_growth_evidence(session, project_id, "demand.read_snapshot")
            )

    @evidence_tool(
        "read_opportunities",
        "Read ranked opportunities",
        "Read the highest-priority current opportunities and their persisted "
        "evidence references.",
    )
    async def read_opportunities(
        project_id: str,
        cursor: str | None = None,
        limit: int | None = None,
        status: str | None = None,
    ) -> EvidenceResponse:
        async with SessionLocal() as session:
            return EvidenceResponse.model_validate(
                await read_growth_evidence(
                    session,
                    project_id,
                    "opportunities.read_ranked",
                    {"cursor": cursor, "limit": limit, "status": status},
                )
            )

    @evidence_tool(
        "read_visibility_audit",
        "Read latest visibility audit",
        "Read the latest persisted AI visibility audit status, summary, and "
        "evidence reference.",
    )
    async def read_visibility_audit(
        project_id: str,
        audit_id: str | None = None,
        completed_baseline: bool = False,
    ) -> EvidenceResponse:
        async with SessionLocal() as session:
            return EvidenceResponse.model_validate(
                await read_growth_evidence(
                    session,
                    project_id,
                    "audits.read_latest",
                    {"audit_id": audit_id, "completed_baseline": completed_baseline},
                )
            )

    @evidence_tool(
        "read_performance",
        "Read Search Console performance",
        "Read the persisted Search Console/GA4 performance projection for a "
        "project: clicks, impressions, CTR, average position and their series "
        "for a range, with an optional comparison window. Ranges are day, week, "
        "month, 3_months, 6_months, last_synced, or custom with start_date and "
        "end_date (ISO YYYY-MM-DD).",
    )
    async def read_performance(
        project_id: str,
        range: PerformanceRange | None = None,
        granularity: PerformanceGranularity | None = None,
        compare: PerformanceCompare | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
        compare_start_date: str | None = None,
        compare_end_date: str | None = None,
    ) -> EvidenceResponse:
        # ``start_date``/``end_date`` rather than the REST surface's from/to:
        # ``from`` is a Python keyword, so a parameter of that name cannot exist
        # here, and a trailing-underscore spelling is one a client would have to
        # guess from the signature rather than the description.
        async with SessionLocal() as session:
            return EvidenceResponse.model_validate(
                await read_growth_evidence(
                    session,
                    project_id,
                    "performance.read_snapshot",
                    {
                        "range": range,
                        "granularity": granularity,
                        "compare": compare,
                        "from": start_date,
                        "to": end_date,
                        "compare_from": compare_start_date,
                        "compare_to": compare_end_date,
                    },
                )
            )

    @evidence_tool(
        "read_performance_table",
        "Read a performance breakdown",
        "Read one paged breakdown of the persisted performance projection: "
        "query, page, country, device, search_appearance, day, bing_query or "
        "bing_page. Pass the snapshot_id a performance read returned, or a range "
        "(with start_date/end_date when the range is custom) to resolve it.",
    )
    async def read_performance_table(
        project_id: str,
        dimension: PerformanceDimension | None = None,
        snapshot_id: str | None = None,
        range: PerformanceRange | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
        sort: str | None = None,
        cursor: str | None = None,
        page_size: int | None = None,
        compare_snapshot_id: str | None = None,
    ) -> EvidenceResponse:
        async with SessionLocal() as session:
            return EvidenceResponse.model_validate(
                await read_growth_evidence(
                    session,
                    project_id,
                    "performance.read_table",
                    {
                        "dimension": dimension,
                        "snapshot_id": snapshot_id,
                        "range": range,
                        # Forwarded so a custom range resolves the window the caller
                        # asked for; without them the resolver falls back to the
                        # latest snapshot and answers a different question.
                        "from": start_date,
                        "to": end_date,
                        "sort": sort,
                        "cursor": cursor,
                        "page_size": page_size,
                        "compare_snapshot_id": compare_snapshot_id,
                    },
                )
            )

    @evidence_tool(
        "read_ai_referrals",
        "Read AI referral traffic",
        "Read the persisted AI-referral projection for a project: sessions "
        "referred by AI answer engines, their share of traffic, and the sources "
        "behind them. Pass start_date and end_date (ISO YYYY-MM-DD) for an "
        "explicit window.",
    )
    async def read_ai_referrals(
        project_id: str,
        range: PerformanceRange | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> EvidenceResponse:
        async with SessionLocal() as session:
            return EvidenceResponse.model_validate(
                await read_growth_evidence(
                    session,
                    project_id,
                    "referrals.read_snapshot",
                    {"range": range, "from": start_date, "to": end_date},
                )
            )

    @evidence_tool(
        "read_integration_status",
        "Read data connection status",
        "Read which providers are connected to a project, which properties are "
        "mapped, how far the history import has progressed, and how far its "
        "coverage reaches. This is the read that explains why a projection is "
        "empty.",
    )
    async def read_integration_status(project_id: str) -> EvidenceResponse:
        async with SessionLocal() as session:
            return EvidenceResponse.model_validate(
                await read_growth_evidence(
                    session, project_id, "integrations.read_status"
                )
            )


def _register_detail_tools(
    evidence_tool: Callable[
        [str, str, str], Callable[[Callable[..., Any]], Callable[..., Any]]
    ],
) -> None:
    @evidence_tool(
        "read_prompt_portfolio",
        "Read the prompt portfolio",
        "Enumerate the complete persisted prompt portfolio with stable pagination, "
        "cohort, status, and generation provenance.",
    )
    async def read_prompt_portfolio(
        project_id: str,
        prompt_set_id: str | None = None,
        cohort: str | None = None,
        cursor: str | None = None,
        limit: int | None = None,
    ) -> EvidenceResponse:
        async with SessionLocal() as session:
            return EvidenceResponse.model_validate(
                await read_prompt_portfolio_data(
                    session,
                    project_id,
                    prompt_set_id=prompt_set_id,
                    cohort=cohort,
                    cursor=cursor,
                    limit=limit,
                )
            )

    @evidence_tool(
        "read_query_evidence",
        "Read page-linked query evidence",
        "Read an exact saved query/page/date window. Missing windows remain "
        "unavailable and never fall back to another range.",
    )
    async def read_query_evidence(
        project_id: str,
        window_start: str,
        window_end: str,
        query: str | None = None,
        site_url_id: str | None = None,
        resolution_outcome: str | None = None,
        cursor: str | None = None,
        limit: int | None = None,
    ) -> EvidenceResponse:
        async with SessionLocal() as session:
            return EvidenceResponse.model_validate(
                await read_query_evidence_data(
                    session,
                    project_id,
                    window_start=window_start,
                    window_end=window_end,
                    query=query,
                    site_url_id=site_url_id,
                    resolution_outcome=resolution_outcome,
                    cursor=cursor,
                    limit=limit,
                )
            )

    @evidence_tool(
        "read_site_pages",
        "Read persisted Site Health pages",
        "Read bounded page facts, final analysis references, issues, coverage, and "
        "applicability from one persisted crawl.",
    )
    async def read_site_pages(
        project_id: str,
        crawl_id: str | None = None,
        page_kind: str | None = None,
        status: str | None = None,
        cursor: str | None = None,
        limit: int | None = None,
    ) -> EvidenceResponse:
        async with SessionLocal() as session:
            return EvidenceResponse.model_validate(
                await read_site_pages_data(
                    session,
                    project_id,
                    crawl_id=crawl_id,
                    page_kind=page_kind,
                    status=status,
                    cursor=cursor,
                    limit=limit,
                )
            )

    @evidence_tool(
        "read_site_links",
        "Read persisted internal-link evidence",
        "Read page-level internal-link metrics and bounded captured neighbours from "
        "one concrete crawl. Aggregate rows are not individual edges.",
    )
    async def read_site_links(
        project_id: str,
        crawl_id: str,
        site_url_id: str | None = None,
        cursor: str | None = None,
        limit: int | None = None,
    ) -> EvidenceResponse:
        async with SessionLocal() as session:
            return EvidenceResponse.model_validate(
                await read_site_links_data(
                    session,
                    project_id,
                    crawl_id=crawl_id,
                    site_url_id=site_url_id,
                    cursor=cursor,
                    limit=limit,
                )
            )

    @evidence_tool(
        "read_visibility_results",
        "Read frozen visibility answers",
        "Read persisted answers, entity observations, citations, and query-fanout "
        "evidence for one concrete audit without rerunning a provider.",
    )
    async def read_visibility_results(
        project_id: str,
        audit_id: str,
        prompt_id: str | None = None,
        engine: str | None = None,
        cohort: Literal["core", "comparison"] = "core",
        cursor: str | None = None,
        limit: int | None = None,
    ) -> EvidenceResponse:
        async with SessionLocal() as session:
            return EvidenceResponse.model_validate(
                await read_visibility_results_data(
                    session,
                    project_id,
                    audit_id=audit_id,
                    prompt_id=prompt_id,
                    engine=engine,
                    cohort=cohort,
                    cursor=cursor,
                    limit=limit,
                )
            )

    @evidence_tool(
        "read_visibility_sources",
        "Read frozen visibility sources",
        "Read owner-computed source usage and denominators for one audit, keeping "
        "citation occurrence separate from inspected publisher-page presence.",
    )
    async def read_visibility_sources(
        project_id: str,
        audit_id: str,
        level: Literal["domain", "url"] = "domain",
        engine: str | None = None,
        cohort: Literal["core", "comparison"] = "core",
        cursor: str | None = None,
        limit: int | None = None,
    ) -> EvidenceResponse:
        async with SessionLocal() as session:
            return EvidenceResponse.model_validate(
                await read_visibility_sources_data(
                    session,
                    project_id,
                    audit_id=audit_id,
                    level=level,
                    engine=engine,
                    cohort=cohort,
                    cursor=cursor,
                    limit=limit,
                )
            )

    @evidence_tool(
        "read_search_intelligence",
        "Read Search Intelligence availability",
        "Enumerate saved published Search Intelligence datasets, exact target/market "
        "scope, coverage, and acquisition status without acquiring data.",
    )
    async def read_search_intelligence(project_id: str) -> EvidenceResponse:
        async with SessionLocal() as session:
            return EvidenceResponse.model_validate(
                await read_search_intelligence_data(session, project_id)
            )

    @evidence_tool(
        "read_search_dataset",
        "Read a Search Intelligence dataset",
        "Read bounded rows from one published dataset using its dataset-specific "
        "persisted grain. Aggregate backlink datasets are never presented as "
        "backlink edges.",
    )
    async def read_search_dataset(
        project_id: str,
        dataset_id: str,
        cursor: str | None = None,
        limit: int | None = None,
        sort: str = "id",
        direction: Literal["asc", "desc"] = "asc",
    ) -> EvidenceResponse:
        async with SessionLocal() as session:
            return EvidenceResponse.model_validate(
                await read_search_dataset_data(
                    session,
                    project_id,
                    dataset_id=dataset_id,
                    cursor=cursor,
                    limit=limit,
                    sort=sort,
                    direction=direction,
                )
            )


def register_evidence_tools(
    evidence_tool: Callable[
        [str, str, str], Callable[[Callable[..., Any]], Callable[..., Any]]
    ],
) -> None:
    _register_summary_tools(evidence_tool)
    _register_detail_tools(evidence_tool)
