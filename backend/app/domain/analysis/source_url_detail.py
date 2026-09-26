"""Everything one cited URL's own page shows, from persisted rows only.

The Sources table answers "which URLs", this answers "and what about this
one". Kept apart from ``source_projection`` because the questions differ in
shape: that module groups the whole selection into rows, this one narrows to a
single key and then breaks it down several ways.

The tracked answers themselves are NOT here. ``/visibility/evidence`` already
returns them filtered by ``url``, and a second implementation of the same read
would be a second place for the evidence contract to drift.

Two things this deliberately does not claim:

``brands`` is what the ANSWERS naming this source mentioned, not what the page
says. A mention carries no citation reference -- the analyzer records it
against the response -- so the honest reading is co-occurrence: these brands
were named in answers that cited this URL. Who is actually ON the page is a
separate, inspected fact and lives on the page detail.

``first_seen`` is the completion of the earliest run that cited this URL in
the selection, so narrowing the period moves it. It is the first sighting in
what is being looked at, never a claim about the page's age.
"""

from __future__ import annotations

from sqlalchemy import String, cast, func, select

from app.core.config.analysis import VISIBILITY_EVIDENCE_DEFAULT_LIMIT
from app.domain.analysis.brand_identity import brand_identities
from app.domain.analysis.evidence import (
    _authorized_selection,
    _evidence_statement,
)
from app.domain.analysis.schemas import (
    SourceUrlBrand,
    SourceUrlDetail,
    SourceUrlEngineRow,
    SourceUrlPromptRow,
)
from app.domain.analysis.selection import RunSelection
from app.models.analysis import (
    BrandMention,
    Citation,
    CompetitorMention,
    ResponseAnalysis,
)
from app.models.audit import Audit, AuditPromptSnapshot

# Bounds for a detail read. The page shows what a person can take in, and the
# tables below it are not paging surfaces.
SOURCE_URL_MAX_PROMPTS = 50
SOURCE_URL_MAX_BRANDS = 12


async def get_visibility_source_url(
    session,
    selection: RunSelection,
    *,
    url: str,
) -> SourceUrlDetail:
    selection = await _authorized_selection(
        session, selection, limit=VISIBILITY_EVIDENCE_DEFAULT_LIMIT
    )
    statement = _evidence_statement(selection)
    scope = (
        statement.with_only_columns(
            ResponseAnalysis.id.label("analysis_id"),
            ResponseAnalysis.logical_engine.label("logical_engine"),
            ResponseAnalysis.transport_model.label("transport_model"),
            func.coalesce(Audit.completed_at, Audit.created_at).label("observed_at"),
            AuditPromptSnapshot.text.label("prompt_text"),
            AuditPromptSnapshot.theme.label("theme"),
            # Coalesced to the frozen text, exactly as the source projection
            # does. A snapshot whose prompt was deleted carries a NULL id, and
            # `count(distinct)` skips nulls -- so counting the id alone reports
            # fewer prompts than the table below it lists.
            func.coalesce(
                cast(AuditPromptSnapshot.prompt_id, String), AuditPromptSnapshot.text
            ).label("prompt_key"),
        )
        .order_by(None)
        .subquery()
    )
    denominator = int(
        await session.scalar(
            select(func.count(func.distinct(scope.c.analysis_id))).select_from(scope)
        )
        or 0
    )
    cited = (
        select(scope)
        .join(Citation, Citation.analysis_id == scope.c.analysis_id)
        .where(Citation.workspace_id == selection.workspace_id, Citation.url == url)
        .subquery()
    )
    overview = (
        await session.execute(
            select(
                func.count(func.distinct(cited.c.analysis_id)).label("retrievals"),
                func.min(cited.c.observed_at).label("first_seen"),
                func.max(cited.c.observed_at).label("last_seen"),
                func.count(func.distinct(cited.c.prompt_key)).label("prompts"),
            )
        )
    ).one()
    citations = int(
        await session.scalar(
            select(func.count(Citation.id))
            .join(scope, scope.c.analysis_id == Citation.analysis_id)
            .where(Citation.workspace_id == selection.workspace_id, Citation.url == url)
        )
        or 0
    )
    retrievals = int(overview.retrievals or 0)
    return SourceUrlDetail(
        url=url,
        title=await _title(
            session, workspace_id=selection.workspace_id, scope=scope, url=url
        ),
        retrievals=retrievals,
        citations=citations,
        responses=denominator,
        # Per response the URL was RETRIEVED in, matching the URL table's
        # column of the same name. Never per response in the selection.
        citation_rate=citations / retrievals if retrievals else None,
        prompts=int(overview.prompts or 0),
        first_seen=overview.first_seen,
        last_seen=overview.last_seen,
        engines=await _engines(session, cited=cited),
        prompt_rows=await _prompts(session, cited=cited),
        brands=await _brands(
            session,
            workspace_id=selection.workspace_id,
            project_id=selection.project_id,
            cited=cited,
        ),
    )


async def _title(session, *, workspace_id, scope, url) -> str:
    """The title the engines reported for this URL, most recent non-empty first."""
    value = await session.scalar(
        select(Citation.title)
        .join(scope, scope.c.analysis_id == Citation.analysis_id)
        .where(
            Citation.workspace_id == workspace_id,
            Citation.url == url,
            Citation.title != "",
        )
        .order_by(scope.c.observed_at.desc())
        .limit(1)
    )
    return str(value or "")


async def _engines(session, *, cited) -> list[SourceUrlEngineRow]:
    rows = (
        await session.execute(
            select(
                cited.c.logical_engine,
                cited.c.transport_model,
                func.count(func.distinct(cited.c.analysis_id)).label("retrievals"),
            ).group_by(cited.c.logical_engine, cited.c.transport_model)
        )
    ).all()
    ordered = sorted(
        rows, key=lambda row: (-int(row.retrievals), str(row.logical_engine or ""))
    )
    return [
        SourceUrlEngineRow(
            logical_engine=str(row.logical_engine or ""),
            transport_model=row.transport_model,
            retrievals=int(row.retrievals),
        )
        for row in ordered
    ]


async def _prompts(session, *, cited) -> list[SourceUrlPromptRow]:
    rows = (
        await session.execute(
            select(
                cited.c.prompt_text,
                cited.c.theme,
                func.count(func.distinct(cited.c.analysis_id)).label("responses"),
                func.max(cited.c.observed_at).label("last_seen"),
                func.array_agg(func.distinct(cited.c.logical_engine)).label("engines"),
            )
            .group_by(cited.c.prompt_text, cited.c.theme)
            .order_by(func.count(func.distinct(cited.c.analysis_id)).desc())
            .limit(SOURCE_URL_MAX_PROMPTS)
        )
    ).all()
    return [
        SourceUrlPromptRow(
            prompt_text=str(row.prompt_text or ""),
            topic=row.theme or None,
            responses=int(row.responses),
            last_seen=row.last_seen,
            engines=sorted(value for value in (row.engines or []) if value),
        )
        for row in rows
    ]


async def _brands(session, *, workspace_id, project_id, cited) -> list[SourceUrlBrand]:
    """Brands and competitors named in the answers that cited this URL.

    Co-occurrence within one answer, which is the strongest link the persisted
    rows support: a mention is recorded against the response, never against
    the citation that sits beside it. The wire field is named for what it is
    so no surface can present it as presence ON the page.
    """
    found: dict[tuple[str, str], int] = {}
    for model, kind, column in (
        (BrandMention, "brand", BrandMention.brand_name),
        (CompetitorMention, "competitor", CompetitorMention.competitor_name),
    ):
        rows = (
            await session.execute(
                select(column, func.count(func.distinct(model.analysis_id)))
                .join(cited, cited.c.analysis_id == model.analysis_id)
                .where(model.workspace_id == workspace_id, column != "")
                .group_by(column)
            )
        ).all()
        for name, responses in rows:
            if name:
                found[(kind, str(name))] = int(responses)
    ordered = sorted(found.items(), key=lambda item: (-item[1], item[0][1]))
    identities = await brand_identities(session, project_id=project_id)
    return [
        SourceUrlBrand(
            kind=kind,
            name=name,
            responses=responses,
            logo_url=(identity := identities.get(" ".join(name.split()).casefold()))
            and identity.logo_url,
            website=identity.website if identity else None,
        )
        for (kind, name), responses in ordered[:SOURCE_URL_MAX_BRANDS]
    ]
