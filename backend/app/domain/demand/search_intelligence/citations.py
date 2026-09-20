"""Deterministic citation matches derived from selected persisted evidence."""

from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime
from urllib.parse import urlsplit

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.demand.search_intelligence.service import (
    SearchIntelligenceError,
    _scope_hash,
    dataset_dict,
)
from app.models.analysis import Citation
from app.models.audit import Audit
from app.models.search_intelligence import (
    SearchIntelligenceDataset,
    SearchIntelligenceRow,
)


def _normalized_domain(value: str) -> str:
    domain = value.casefold().strip().strip(".")
    return domain[4:] if domain.startswith("www.") else domain


async def _published_parent(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    dataset_id: uuid.UUID,
) -> SearchIntelligenceDataset:
    parent = await session.scalar(
        select(SearchIntelligenceDataset).where(
            SearchIntelligenceDataset.workspace_id == workspace_id,
            SearchIntelligenceDataset.project_id == project_id,
            SearchIntelligenceDataset.id == dataset_id,
            SearchIntelligenceDataset.dataset_kind == "referring_domains",
            SearchIntelligenceDataset.status == "published",
        )
    )
    if parent is None:
        raise SearchIntelligenceError(
            "not_found", "Published referring-domain dataset not found"
        )
    return parent


async def _authorized_audits(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    audit_ids: list[uuid.UUID],
) -> set[uuid.UUID]:
    selected = set(audit_ids)
    authorized = set(
        (
            await session.scalars(
                select(Audit.id).where(
                    Audit.workspace_id == workspace_id,
                    Audit.project_id == project_id,
                    Audit.id.in_(selected),
                )
            )
        ).all()
    )
    if authorized != selected:
        raise SearchIntelligenceError(
            "audit_not_found", "One or more visibility audits are unavailable"
        )
    return selected


async def _backlink_domains(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    dataset_id: uuid.UUID,
) -> set[str]:
    values = (
        await session.scalars(
            select(SearchIntelligenceRow.domain).where(
                SearchIntelligenceRow.workspace_id == workspace_id,
                SearchIntelligenceRow.project_id == project_id,
                SearchIntelligenceRow.dataset_id == dataset_id,
                SearchIntelligenceRow.domain != "",
            )
        )
    ).all()
    return {_normalized_domain(value) for value in values}


async def _matching_citations(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    audit_ids: set[uuid.UUID],
    domains: set[str],
) -> tuple[list[Citation], list[tuple[Citation, str]]]:
    citations = list(
        (
            await session.scalars(
                select(Citation)
                .where(
                    Citation.workspace_id == workspace_id,
                    Citation.audit_id.in_(audit_ids),
                )
                .order_by(Citation.audit_id, Citation.id)
            )
        ).all()
    )
    matches: list[tuple[Citation, str]] = []
    for citation in citations:
        source_domain = citation.domain or (
            urlsplit(
                citation.canonical_url or citation.resolved_url or citation.url
            ).hostname
            or ""
        )
        normalized = _normalized_domain(source_domain)
        if normalized in domains:
            matches.append((citation, normalized))
    return citations, matches


def _derived_dataset(
    parent: SearchIntelligenceDataset,
    *,
    audit_ids: set[uuid.UUID],
    citations: list[Citation],
    matches: list[tuple[Citation, str]],
    now: datetime,
) -> SearchIntelligenceDataset:
    selection = {"audit_ids": sorted(str(value) for value in audit_ids)}
    return SearchIntelligenceDataset(
        workspace_id=parent.workspace_id,
        project_id=parent.project_id,
        run_id=parent.run_id,
        parent_dataset_id=parent.id,
        dataset_kind="citation_matches",
        scope_hash=_scope_hash({"parent_dataset_id": str(parent.id), **selection}),
        target_domain=parent.target_domain,
        target_hostname=parent.target_hostname,
        target_origin=parent.target_origin,
        comparison_origin=parent.comparison_origin,
        location_code=None,
        language_code="",
        status="published",
        coverage="empty" if not matches else "complete",
        requested_rows=len(citations),
        raw_rows_received=len(citations),
        unique_rows_saved=len(matches),
        provider_total=None,
        truncated=False,
        summary={
            "selected_audits": len(audit_ids),
            "citations_reviewed": len(citations),
            "matches": len(matches),
        },
        provider_filters=selection,
        parser_version="citation-match-1",
        collection_started_at=now,
        collection_ended_at=now,
        published_at=now,
    )


def _match_row(
    dataset: SearchIntelligenceDataset, citation: Citation, domain: str
) -> SearchIntelligenceRow:
    return SearchIntelligenceRow(
        workspace_id=dataset.workspace_id,
        project_id=dataset.project_id,
        dataset_id=dataset.id,
        call_id=None,
        provider_row_key=hashlib.sha256(str(citation.id).encode()).hexdigest(),
        row_kind="citation_match",
        domain=domain,
        url=citation.canonical_url or citation.resolved_url or citation.url,
        auxiliary={
            "citation_id": str(citation.id),
            "audit_id": str(citation.audit_id),
            "artifact_id": str(citation.artifact_id),
            "title": citation.title,
            "classification": citation.classification,
        },
    )


async def derive_citation_matches(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    backlink_dataset_id: uuid.UUID,
    audit_ids: list[uuid.UUID],
) -> dict[str, object]:
    parent = await _published_parent(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        dataset_id=backlink_dataset_id,
    )
    selected = await _authorized_audits(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        audit_ids=audit_ids,
    )
    domains = await _backlink_domains(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        dataset_id=parent.id,
    )
    citations, matches = await _matching_citations(
        session, workspace_id=workspace_id, audit_ids=selected, domains=domains
    )
    dataset = _derived_dataset(
        parent,
        audit_ids=selected,
        citations=citations,
        matches=matches,
        now=datetime.now(UTC),
    )
    session.add(dataset)
    await session.flush()
    session.add_all(
        [_match_row(dataset, citation, domain) for citation, domain in matches]
    )
    await session.commit()
    return dataset_dict(dataset)
