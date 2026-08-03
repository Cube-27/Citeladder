# Product visibility projections (invariant 7 — persisted rows only).
#
# Every function here reads persisted rows (``ProductMetricSnapshot`` /
# ``ProductResponseAnalysis`` / ``ProductMention`` / ``MerchantMention`` /
# ``Audit``) and NEVER calls a provider and NEVER recomputes a score. They
# back the product visibility/evidence/export endpoints. All queries are
# workspace-scoped (invariant 5). Mirrors ``domain/analysis/service.py`` (B6).
#
# Mixed-version reads: a v2 re-score coexists with v1 rows. The projection
# prefers the current analyzer/rule snapshot per entry but still serves v1
# data, deriving ``price_mismatch_rate`` from the v1 price accuracy and
# falling back to ``match | mismatch | null`` relations (never inventing
# higher/lower direction for v1 evidence).
from __future__ import annotations

import csv
import io
import json
import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.csv_cells import csv_cell
from app.analysis.product_service import build_product_scoring_config
from app.core.config.audits import (
    AUDIT_STATUS_COMPLETED,
    AUDIT_STATUS_PARTIALLY_COMPLETED,
)
from app.core.config.commerce import (
    PRICE_RELATION_HIGHER,
    PRICE_RELATION_LOWER,
    PRICE_RELATION_MATCH,
    PRICE_RELATION_MISMATCH,
    PRODUCT_ATTRIBUTE_EVIDENCE_NAMESPACE,
    PRODUCT_EVIDENCE_KIND_ATTRIBUTE_MENTION,
    PRODUCT_EVIDENCE_KIND_BUYER_DESTINATION,
    PRODUCT_EVIDENCE_KIND_PRODUCT_MENTION,
    SHOPPING_SURFACE_MEASUREMENT,
)
from app.core.config.products import (
    PRODUCT_ANALYZER_VERSION,
    PRODUCT_EVIDENCE_DEFAULT_LIMIT,
    PRODUCT_EVIDENCE_MAX_LIMIT,
    PRODUCT_SCORING_RULE_VERSION,
)
from app.core.config.provider_catalog import LOGICAL_ENGINES
from app.domain.analysis.service import AnalysisNotFoundError, TrendQueryError
from app.domain.products.schemas import (
    CompetitorProductVisibilityEntry,
    FrozenPromptContext,
    ProductEvidenceItem,
    ProductEvidenceResponse,
    ProductVisibilityEntry,
    ProductVisibilityResponse,
)
from app.domain.products.service import ProductNotFoundError
from app.models.audit import Audit, AuditPromptSnapshot, AuditTask
from app.models.product import (
    MerchantMention,
    Product,
    ProductMention,
    ProductMetricSnapshot,
    ProductResponseAnalysis,
)
from app.models.project import Project

# A run is projection-eligible when fully or partially completed (mirror B6).
_DASHBOARD_STATUSES = (
    AUDIT_STATUS_COMPLETED,
    AUDIT_STATUS_PARTIALLY_COMPLETED,
)

# Single source for the repeated "audit missing" detail (asserted by tests).
_AUDIT_NOT_FOUND = "Audit not found"

_CSV_COLUMNS = [
    "audit_id",
    "product",
    "sku",
    "mentions",
    "sov",
    "avg_rank",
    "price_accuracy",
    "engine",
    "product_analyzer_version",
    "surface",
    "win_rate",
    "price_mismatch_rate",
    "price_relation_match_count",
    "price_relation_higher_count",
    "price_relation_lower_count",
    "price_relation_mismatch_count",
    "attribute_dimension_frequency",
    "buyer_destination_mix",
    "competitor_co_placement",
]

# Zero-value fallbacks for the strict JSONB shapes (v1 rows / no data).
_EMPTY_DESTINATION_MIX: dict[str, Any] = {"total": 0, "by_kind": [], "by_domain": []}
_EMPTY_CO_PLACEMENT: dict[str, Any] = {"items": [], "truncated": False}


async def _conversation_context(
    session: AsyncSession, *, audit_id: uuid.UUID, surface: str
) -> dict[
    tuple[str, uuid.UUID], tuple[float | None, list[FrozenPromptContext], list[str]]
]:
    """Persisted prompt coverage/context per catalog entry (never inferred).

    The audit snapshot supplies frozen text/theme/intent, while mentions tell
    us which prompt slots actually discussed an entry. This is a projection of
    existing evidence rather than a new scoring pass.
    """
    prompt_count = int(
        await session.scalar(
            select(func.count())
            .select_from(AuditPromptSnapshot)
            .where(AuditPromptSnapshot.audit_id == audit_id)
        )
        or 0
    )
    rows = (
        await session.execute(
            select(ProductMention, AuditPromptSnapshot)
            .join(
                ProductResponseAnalysis,
                ProductResponseAnalysis.id == ProductMention.analysis_id,
            )
            .join(AuditTask, AuditTask.id == ProductResponseAnalysis.task_id)
            .join(
                AuditPromptSnapshot,
                AuditPromptSnapshot.id == AuditTask.prompt_snapshot_id,
            )
            .where(ProductMention.audit_id == audit_id)
            .where(ProductResponseAnalysis.shopping_surface == surface)
        )
    ).all()
    grouped: dict[tuple[str, uuid.UUID], dict[int, FrozenPromptContext]] = {}
    for mention, prompt in rows:
        entry_id = mention.product_id or mention.competitor_product_id
        if entry_id is None:
            continue
        kind = "product" if mention.product_id is not None else "competitor_product"
        grouped.setdefault((kind, entry_id), {})[prompt.prompt_index] = (
            FrozenPromptContext(
                prompt_index=prompt.prompt_index,
                text=prompt.text,
                theme=prompt.theme,
                intent=prompt.intent,
            )
        )
    return {
        key: (
            round(len(prompts) / prompt_count, 4) if prompt_count else None,
            [prompts[index] for index in sorted(prompts)],
            sorted({prompt.theme for prompt in prompts.values() if prompt.theme}),
        )
        for key, prompts in grouped.items()
    }


def _project_price_relation(
    price_relation: str | None, price_matches_catalog: bool | None
) -> str | None:
    """Mixed-version relation read: persisted v2 relation, else v1 fallback.

    Returns the persisted ``price_relation`` when non-null; otherwise maps
    the legacy boolean (True -> ``match``, False -> ``mismatch``, None ->
    null). Higher/lower direction is NEVER inferred for v1 rows.
    """
    if price_relation is not None:
        return price_relation
    if price_matches_catalog is True:
        return PRICE_RELATION_MATCH
    if price_matches_catalog is False:
        return PRICE_RELATION_MISMATCH
    return None


def _normalize_aggregate(aggregate: dict[str, Any]) -> dict[str, Any]:
    """Project one persisted aggregate dict into the pinned response shape.

    Applies the mixed-version rule: a v1 aggregate (no persisted
    ``price_relation_counts``) reads an empty relation-count map and derives
    ``price_mismatch_rate`` from its price accuracy (null when that is
    null); v2 aggregates serve their persisted values.
    """
    relation_counts = aggregate.get("price_relation_counts")
    price_accuracy = aggregate.get("price_accuracy_rate")
    if relation_counts:
        mismatch_rate = aggregate.get("price_mismatch_rate")
    else:
        # v1 fallback: direction was never persisted, so only the derived
        # mismatch rate is available.
        relation_counts = {}
        mismatch_rate = None if price_accuracy is None else round(1 - price_accuracy, 4)
    return {
        "mention_count": int(aggregate.get("mention_count") or 0),
        "sov_share": float(aggregate.get("sov_share") or 0.0),
        "avg_rank": aggregate.get("avg_rank"),
        "rank_distribution": dict(aggregate.get("rank_distribution") or {}),
        "price_mention_count": int(aggregate.get("price_mention_count") or 0),
        "price_accuracy_rate": price_accuracy,
        "win_rate": aggregate.get("win_rate"),
        "price_relation_counts": dict(relation_counts),
        "price_mismatch_rate": mismatch_rate,
        "attribute_dimension_frequency": {
            str(group): dict(dimensions)
            for group, dimensions in (
                aggregate.get("attribute_dimension_frequency") or {}
            ).items()
        },
        "buyer_destination_mix": aggregate.get("buyer_destination_mix")
        or dict(_EMPTY_DESTINATION_MIX),
        "competitor_co_placement": aggregate.get("competitor_co_placement")
        or dict(_EMPTY_CO_PLACEMENT),
    }


def _entry_metrics(
    snapshot: ProductMetricSnapshot,
    engine: str | None = None,
    surface: str = SHOPPING_SURFACE_MEASUREMENT,
) -> dict[str, Any]:
    """One snapshot's entry metrics, engine/surface-sliced (persisted only).

    With ``engine=None`` on the measurement surface the overall snapshot
    columns are served. With an engine the PERSISTED per-engine aggregate
    (written at finalize) is served; a non-empty surface reads
    ``metrics["per_surface"][surface]`` then its nested per-engine slice.
    Missing data reads as a zero-filled aggregate — never a recompute
    (invariant 7).
    """
    metrics = snapshot.metrics or {}
    if surface == SHOPPING_SURFACE_MEASUREMENT and engine is None:
        # Current snapshots persist an exact measurement slice beside future
        # probe surfaces. Prefer it so probe analyses cannot inflate the
        # default dashboard; legacy snapshots without ``per_surface`` retain
        # their historical snapshot-column fallback.
        measurement = (metrics.get("per_surface") or {}).get(
            SHOPPING_SURFACE_MEASUREMENT
        )
        if measurement is not None:
            return _normalize_aggregate(measurement)
        return _normalize_aggregate(
            {
                **metrics,
                "mention_count": snapshot.mention_count,
                "sov_share": snapshot.sov_share,
                "avg_rank": snapshot.avg_rank,
                "rank_distribution": dict(snapshot.rank_distribution or {}),
                "price_mention_count": snapshot.price_mention_count,
                "price_accuracy_rate": snapshot.price_accuracy_rate,
                "win_rate": snapshot.win_rate,
                "price_mismatch_rate": snapshot.price_mismatch_rate,
            }
        )
    if surface == SHOPPING_SURFACE_MEASUREMENT:
        scope: dict[str, Any] = metrics
    else:
        scope = (metrics.get("per_surface") or {}).get(surface) or {}
    if engine is not None:
        scope = (scope.get("per_engine") or {}).get(engine) or {}
    return _normalize_aggregate(scope)


def _is_current_version(snapshot: ProductMetricSnapshot) -> bool:
    return (
        snapshot.product_analyzer_version == PRODUCT_ANALYZER_VERSION
        and snapshot.product_scoring_rule_version == PRODUCT_SCORING_RULE_VERSION
    )


def select_current_snapshots(
    snapshots: list[ProductMetricSnapshot],
) -> dict[str, ProductMetricSnapshot]:
    """One snapshot per frozen entry id; the CURRENT version wins ties.

    v1 and v2 snapshots coexist for the same entry (widened unique
    indexes); the projection serves the current version when both exist
    and falls back to the v1 row otherwise (v1 rows are never mutated).

    Order-independent: the input list may be in any order, since selection
    is by version, not position.
    """
    by_entry: dict[str, ProductMetricSnapshot] = {}
    for snapshot in snapshots:
        entry_id = _snapshot_entry_id(snapshot)
        existing = by_entry.get(entry_id)
        if existing is None or (
            _is_current_version(snapshot) and not _is_current_version(existing)
        ):
            by_entry[entry_id] = snapshot
    return by_entry


async def _available_surfaces(
    session: AsyncSession, *, audit_id: uuid.UUID
) -> list[str]:
    """Distinct persisted analysis surfaces ∪ {""}: measurement first."""
    persisted = {
        str(surface)
        for surface in (
            await session.scalars(
                select(ProductResponseAnalysis.shopping_surface)
                .where(ProductResponseAnalysis.audit_id == audit_id)
                .distinct()
            )
        ).all()
    }
    persisted.add(SHOPPING_SURFACE_MEASUREMENT)
    return [SHOPPING_SURFACE_MEASUREMENT] + sorted(
        surface for surface in persisted if surface != SHOPPING_SURFACE_MEASUREMENT
    )


async def get_product_visibility(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    audit_id: uuid.UUID | None = None,
    engine: str | None = None,
    surface: str = SHOPPING_SURFACE_MEASUREMENT,
) -> ProductVisibilityResponse:
    """Serve the selected-audit product dashboard projection.

    Defaults to the project's latest completed/partially-completed audit that
    has product snapshots when ``audit_id`` is omitted. Identity (sku/name/
    competitor_name) comes from the audit's FROZEN configuration so the
    projection survives later catalog deletes. Pure read of persisted rows;
    no provider call (invariant 7).

    ``engine`` slices every entry to its PERSISTED per-engine aggregate
    (stored in the snapshot at finalize) — still a pure projection, never a
    recompute. ``surface`` selects the persisted per-surface aggregate
    (measurement "" by default; surfaces never aggregate together). An
    unknown engine raises ``TrendQueryError`` (HTTP 422).
    """
    if engine is not None and engine not in LOGICAL_ENGINES:
        raise TrendQueryError(f"Unknown logical engine: {engine!r}")
    audit, snapshots = await _load_audit_and_snapshots(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        audit_id=audit_id,
    )

    config = build_product_scoring_config(audit.configuration)
    by_entry = select_current_snapshots(snapshots)

    sliced = {
        entry_id: _entry_metrics(snapshot, engine, surface)
        for entry_id, snapshot in by_entry.items()
    }
    conversation = await _conversation_context(
        session, audit_id=audit.id, surface=surface
    )

    products: list[ProductVisibilityEntry] = []
    for entry in config.products:
        snapshot = by_entry.get(entry.id)
        if snapshot is None:
            continue
        metrics = sliced[entry.id]
        coverage, prompts, themes = (
            conversation.get(("product", snapshot.product_id), (None, [], []))
            if snapshot.product_id is not None
            else (None, [], [])
        )
        products.append(
            ProductVisibilityEntry(
                product_id=snapshot.product_id,
                sku=entry.sku,
                name=entry.name,
                product_analyzer_version=snapshot.product_analyzer_version,
                mention_count=metrics["mention_count"],
                sov_share=metrics["sov_share"],
                avg_rank=metrics["avg_rank"],
                rank_distribution=metrics["rank_distribution"],
                price_mention_count=metrics["price_mention_count"],
                price_accuracy_rate=metrics["price_accuracy_rate"],
                win_rate=metrics["win_rate"],
                price_mismatch_rate=metrics["price_mismatch_rate"],
                price_relation_counts=metrics["price_relation_counts"],
                attribute_dimension_frequency=metrics["attribute_dimension_frequency"],
                buyer_destination_mix=metrics["buyer_destination_mix"],
                competitor_co_placement=metrics["competitor_co_placement"],
                prompt_coverage=coverage,
                frozen_prompt_context=prompts,
                conversation_themes=themes,
            )
        )

    competitor_products: list[CompetitorProductVisibilityEntry] = []
    for competitor_entry in config.competitor_products:
        snapshot = by_entry.get(competitor_entry.id)
        if snapshot is None:
            continue
        metrics = sliced[competitor_entry.id]
        coverage, prompts, themes = (
            conversation.get(
                ("competitor_product", snapshot.competitor_product_id), (None, [], [])
            )
            if snapshot.competitor_product_id is not None
            else (None, [], [])
        )
        competitor_products.append(
            CompetitorProductVisibilityEntry(
                competitor_product_id=snapshot.competitor_product_id,
                competitor_name=competitor_entry.competitor,
                name=competitor_entry.name,
                product_analyzer_version=snapshot.product_analyzer_version,
                mention_count=metrics["mention_count"],
                sov_share=metrics["sov_share"],
                avg_rank=metrics["avg_rank"],
                rank_distribution=metrics["rank_distribution"],
                price_mention_count=metrics["price_mention_count"],
                price_accuracy_rate=metrics["price_accuracy_rate"],
                win_rate=metrics["win_rate"],
                price_mismatch_rate=metrics["price_mismatch_rate"],
                price_relation_counts=metrics["price_relation_counts"],
                attribute_dimension_frequency=metrics["attribute_dimension_frequency"],
                buyer_destination_mix=metrics["buyer_destination_mix"],
                competitor_co_placement=metrics["competitor_co_placement"],
                prompt_coverage=coverage,
                frozen_prompt_context=prompts,
                conversation_themes=themes,
            )
        )

    total_analyses = await session.scalar(
        select(func.count())
        .select_from(ProductResponseAnalysis)
        .where(ProductResponseAnalysis.audit_id == audit.id)
        .where(ProductResponseAnalysis.shopping_surface == surface)
    )
    # Response-level version label: the first catalog entry's selected
    # snapshot (deterministic catalog order). Row-level DTOs carry their own
    # version, so a mixed-version audit is still labelled correctly per row.
    selected_entry_ids = [entry.id for entry in config.products]
    selected_entry_ids.extend(entry.id for entry in config.competitor_products)
    selected = [
        by_entry[entry_id] for entry_id in selected_entry_ids if entry_id in by_entry
    ]
    if not selected:
        raise AnalysisNotFoundError("Product metrics not available for audit")
    first = selected[0]
    return ProductVisibilityResponse(
        project_id=project_id,
        audit_id=audit.id,
        audit_status=audit.status,
        product_analyzer_version=first.product_analyzer_version,
        product_scoring_rule_version=first.product_scoring_rule_version,
        total_mentions=sum(m["mention_count"] for m in sliced.values()),
        total_analyses=int(total_analyses or 0),
        products=products,
        competitor_products=competitor_products,
        available_surfaces=await _available_surfaces(session, audit_id=audit.id),
        created_at=max(s.created_at for s in selected),
    )


async def get_product_evidence(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    product_id: uuid.UUID,
    audit_id: uuid.UUID | None = None,
    engine: str | None = None,
    surface: str = SHOPPING_SURFACE_MEASUREMENT,
    limit: int = PRODUCT_EVIDENCE_DEFAULT_LIMIT,
) -> ProductEvidenceResponse:
    """Project the workspace-scoped product evidence (invariant 7).

    Pure READ-ONLY projection over persisted ``ProductMention`` rows (one
    base item each plus one item per persisted attribute-mention object)
    and ``MerchantMention`` rows (one buyer-destination item each), joined
    to their parent analysis + frozen prompt text (``AuditPromptSnapshot``)
    and task/execution ids for ``/runs`` linking. Optional ``audit_id`` /
    ``engine`` / ``surface`` filters intersect (``surface`` defaults to
    measurement; it is an EXACT predicate, never a hard-coded brand-only
    filter). Returns at most ``limit`` mention windows newest-first with
    ``truncated`` set when more matches exist (mirror
    ``get_visibility_evidence``).
    """
    if engine is not None and engine not in LOGICAL_ENGINES:
        raise TrendQueryError(f"Unknown logical engine: {engine!r}")
    if limit < 1 or limit > PRODUCT_EVIDENCE_MAX_LIMIT:
        raise TrendQueryError(
            f"'limit' must be between 1 and {PRODUCT_EVIDENCE_MAX_LIMIT}"
        )

    # Ownership pre-check: the product must belong to this workspace (else a
    # cross-workspace/missing id must 404 — never leak that it exists).
    owning = await session.scalar(
        select(Product.id)
        .join(Project, Project.id == Product.project_id)
        .where(Product.id == product_id, Project.workspace_id == workspace_id)
    )
    if owning is None:
        raise ProductNotFoundError(f"Product {product_id} not found")

    # If an audit is selected, it must belong to this workspace (else 404).
    if audit_id is not None:
        owning_audit = await session.scalar(
            select(Audit.id).where(
                Audit.id == audit_id, Audit.workspace_id == workspace_id
            )
        )
        if owning_audit is None:
            raise AnalysisNotFoundError(_AUDIT_NOT_FOUND)

    stmt = (
        select(
            ProductMention,
            ProductResponseAnalysis,
            AuditTask,
            AuditPromptSnapshot,
        )
        .join(
            ProductResponseAnalysis,
            ProductResponseAnalysis.id == ProductMention.analysis_id,
        )
        .join(AuditTask, AuditTask.id == ProductResponseAnalysis.task_id)
        .join(
            AuditPromptSnapshot,
            AuditPromptSnapshot.id == AuditTask.prompt_snapshot_id,
        )
        .join(Audit, Audit.id == ProductMention.audit_id)
        .where(
            ProductMention.workspace_id == workspace_id,
            ProductMention.product_id == product_id,
            Audit.status.in_(_DASHBOARD_STATUSES),
            # Exact surface predicate supplied by the endpoint (measurement
            # by default) — NOT a hard-coded brand-only filter.
            ProductResponseAnalysis.shopping_surface == surface,
        )
    )
    if audit_id is not None:
        stmt = stmt.where(ProductMention.audit_id == audit_id)
    if engine is not None:
        stmt = stmt.where(ProductResponseAnalysis.logical_engine == engine)
    # Newest-first window, deterministic tie-breaks (mirror B6 evidence).
    stmt = stmt.order_by(
        Audit.completed_at.desc().nullslast(),
        Audit.created_at.desc(),
        ProductResponseAnalysis.prompt_index.asc(),
        ProductResponseAnalysis.logical_engine.asc(),
        ProductResponseAnalysis.repetition.asc(),
        ProductMention.id.asc(),
    ).limit(limit + 1)

    rows = list((await session.execute(stmt)).all())
    truncated = len(rows) > limit
    rows = rows[:limit]

    # Batch-load this window's buyer destinations (one item per persisted
    # MerchantMention row) for the SAME analyses + product.
    destinations_by_analysis: dict[uuid.UUID, list[MerchantMention]] = {}
    analysis_ids = list({analysis.id for _, analysis, _, _ in rows})
    if analysis_ids:
        merchant_rows = list(
            (
                await session.scalars(
                    select(MerchantMention)
                    .where(
                        MerchantMention.analysis_id.in_(analysis_ids),
                        MerchantMention.product_id == product_id,
                    )
                    .order_by(
                        MerchantMention.created_at.asc(), MerchantMention.id.asc()
                    )
                )
            ).all()
        )
        for merchant in merchant_rows:
            destinations_by_analysis.setdefault(merchant.analysis_id, []).append(
                merchant
            )

    items: list[ProductEvidenceItem] = []
    destinations_emitted: set[uuid.UUID] = set()
    for mention, analysis, _task, prompt_snapshot in rows:
        common = _evidence_common(
            analysis=analysis,
            prompt_snapshot=prompt_snapshot,
            matched_name=mention.matched_name,
            matched_sku=mention.matched_sku,
        )
        items.append(
            ProductEvidenceItem(
                **common,
                evidence_id=mention.id,
                evidence_kind=PRODUCT_EVIDENCE_KIND_PRODUCT_MENTION,
                product_analyzer_version=mention.product_analyzer_version,
                created_at=mention.created_at,
                first_offset=mention.first_offset,
                rank_position=mention.rank_position,
                price_value=(
                    float(mention.price_value)
                    if mention.price_value is not None
                    else None
                ),
                price_matches_catalog=mention.price_matches_catalog,
                price_relation=_project_price_relation(
                    mention.price_relation, mention.price_matches_catalog
                ),
                price_text=mention.price_text,
                price_currency=mention.price_currency,
            )
        )
        # One item per persisted attribute-mention object. The stable
        # evidence_id is a UUID5 over the provenance tuple (no table/PK).
        for attribute in mention.attribute_mentions or []:
            dimension = str(attribute.get("dimension") or "")
            offset = attribute.get("offset")
            items.append(
                ProductEvidenceItem(
                    **common,
                    evidence_id=uuid.uuid5(
                        PRODUCT_ATTRIBUTE_EVIDENCE_NAMESPACE,
                        f"{analysis.id}:{mention.id}:{dimension}:{offset}",
                    ),
                    evidence_kind=PRODUCT_EVIDENCE_KIND_ATTRIBUTE_MENTION,
                    product_analyzer_version=mention.product_analyzer_version,
                    created_at=mention.created_at,
                    attribute_dimension=dimension,
                    attribute_group=str(attribute.get("group") or ""),
                    attribute_text=str(attribute.get("text") or ""),
                    attribute_offset=offset,
                )
            )
        # One item per persisted MerchantMention row (emitted once per
        # analysis, after its first mention window).
        if analysis.id in destinations_emitted:
            continue
        destinations_emitted.add(analysis.id)
        for merchant in destinations_by_analysis.get(analysis.id, []):
            items.append(
                ProductEvidenceItem(
                    **common,
                    evidence_id=merchant.id,
                    evidence_kind=PRODUCT_EVIDENCE_KIND_BUYER_DESTINATION,
                    product_analyzer_version=merchant.product_analyzer_version,
                    created_at=merchant.created_at,
                    merchant_name=merchant.merchant_name,
                    merchant_domain=merchant.merchant_domain,
                    merchant_kind=merchant.merchant_kind,
                    destination_url=merchant.destination_url,
                )
            )
    return ProductEvidenceResponse(items=items, truncated=truncated)


def _evidence_common(
    *,
    analysis: ProductResponseAnalysis,
    prompt_snapshot: AuditPromptSnapshot,
    matched_name: str,
    matched_sku: str,
) -> dict[str, Any]:
    """The common provenance fields shared by every evidence kind."""
    return {
        "analysis_id": analysis.id,
        "audit_id": analysis.audit_id,
        "task_id": analysis.task_id,
        "artifact_id": analysis.artifact_id,
        "logical_engine": analysis.logical_engine,
        "transport_model": analysis.transport_model,
        "prompt_text": prompt_snapshot.text or "",
        "prompt_index": analysis.prompt_index,
        "repetition": analysis.repetition,
        "shopping_surface": analysis.shopping_surface,
        "matched_name": matched_name,
        "matched_sku": matched_sku,
    }


async def load_product_visibility_export_bundle(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    audit_id: uuid.UUID | None = None,
) -> tuple[Audit, list[ProductMetricSnapshot]]:
    """Load the audit + its product snapshots for CSV export (invariant 7).

    Defaults to the latest dashboard-eligible audit with product snapshots
    when ``audit_id`` is omitted (same resolution as the dashboard
    projection). 404-class ``AnalysisNotFoundError`` when there is nothing
    persisted to render.
    """
    return await _load_audit_and_snapshots(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        audit_id=audit_id,
    )


def product_visibility_csv(
    audit: Audit,
    snapshots: list[ProductMetricSnapshot],
    surface: str = SHOPPING_SURFACE_MEASUREMENT,
) -> str:
    """Render the per-entry product visibility rows as CSV (invariant 7).

    Renders PERSISTED ``ProductMetricSnapshot`` rows only — one overall row
    (``engine=all``) plus one row per engine from the snapshot's persisted
    per-engine breakdown, for the selected surface (measurement default;
    non-empty surfaces read the persisted per-surface aggregates). Column
    style mirrors ``analysis/exports.py``; structured cells are stable JSON
    (sorted keys, compact separators) so repeated exports are byte-equal.
    """
    config = build_product_scoring_config(audit.configuration)
    by_entry = select_current_snapshots(snapshots)
    ordered = [(entry.id, entry.name, entry.sku) for entry in config.products]
    ordered += [(entry.id, entry.name, "") for entry in config.competitor_products]

    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=_CSV_COLUMNS)
    writer.writeheader()

    def _row(
        *,
        name: str,
        sku: str,
        engine: str,
        aggregate: dict,
        analyzer_version: str,
    ) -> dict[str, object]:
        relation_counts = aggregate.get("price_relation_counts") or {}
        avg_rank = aggregate.get("avg_rank")
        price_accuracy = aggregate.get("price_accuracy_rate")
        win_rate = aggregate.get("win_rate")
        mismatch_rate = aggregate.get("price_mismatch_rate")
        return {
            "audit_id": str(audit.id),
            # User-controlled strings (CRUD / CSV import) — neutralize
            # spreadsheet formula triggers on export (csv_cells owner).
            "product": csv_cell(name),
            "sku": csv_cell(sku),
            "mentions": aggregate.get("mention_count", 0),
            "sov": aggregate.get("sov_share", 0.0),
            # None (not verifiable) renders blank; 0.0 must survive as 0.0.
            "avg_rank": "" if avg_rank is None else avg_rank,
            "price_accuracy": "" if price_accuracy is None else price_accuracy,
            "engine": engine,
            "product_analyzer_version": analyzer_version,
            "surface": surface,
            "win_rate": "" if win_rate is None else win_rate,
            "price_mismatch_rate": "" if mismatch_rate is None else mismatch_rate,
            "price_relation_match_count": int(
                relation_counts.get(PRICE_RELATION_MATCH) or 0
            ),
            "price_relation_higher_count": int(
                relation_counts.get(PRICE_RELATION_HIGHER) or 0
            ),
            "price_relation_lower_count": int(
                relation_counts.get(PRICE_RELATION_LOWER) or 0
            ),
            "price_relation_mismatch_count": int(
                relation_counts.get(PRICE_RELATION_MISMATCH) or 0
            ),
            # Structured cells: stable JSON (sorted keys, compact separators).
            "attribute_dimension_frequency": json.dumps(
                aggregate.get("attribute_dimension_frequency") or {},
                sort_keys=True,
                separators=(",", ":"),
            ),
            "buyer_destination_mix": json.dumps(
                aggregate.get("buyer_destination_mix") or _EMPTY_DESTINATION_MIX,
                sort_keys=True,
                separators=(",", ":"),
            ),
            "competitor_co_placement": json.dumps(
                aggregate.get("competitor_co_placement") or _EMPTY_CO_PLACEMENT,
                sort_keys=True,
                separators=(",", ":"),
            ),
        }

    for entry_id, name, sku in ordered:
        snapshot = by_entry.get(entry_id)
        if snapshot is None:
            continue
        overall = _entry_metrics(snapshot, None, surface)
        writer.writerow(
            _row(
                name=name,
                sku=sku,
                engine="all",
                aggregate=overall,
                analyzer_version=snapshot.product_analyzer_version,
            )
        )
        metrics = snapshot.metrics or {}
        if surface == SHOPPING_SURFACE_MEASUREMENT:
            per_engine = metrics.get("per_engine") or {}
        else:
            per_engine = ((metrics.get("per_surface") or {}).get(surface) or {}).get(
                "per_engine"
            ) or {}
        for engine in sorted(per_engine):
            aggregate = per_engine[engine]
            if aggregate is None:
                continue
            writer.writerow(
                _row(
                    name=name,
                    sku=sku,
                    engine=engine,
                    aggregate=_normalize_aggregate(aggregate),
                    analyzer_version=snapshot.product_analyzer_version,
                )
            )
    return buffer.getvalue()


def _snapshot_entry_id(snapshot: ProductMetricSnapshot) -> str:
    """Frozen catalog entry id for a snapshot.

    The live FK is SET NULL when the catalog row is deleted, so fall back to
    the frozen ``entry_id`` persisted in ``metrics`` at finalize time.
    """
    live = snapshot.product_id or snapshot.competitor_product_id
    if live is not None:
        return str(live)
    return str((snapshot.metrics or {}).get("entry_id") or "")


async def _load_audit_and_snapshots(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    audit_id: uuid.UUID | None,
) -> tuple[Audit, list[ProductMetricSnapshot]]:
    """Resolve the audit + load its product snapshots (shared resolution).

    Defaults to the latest dashboard-eligible audit with product snapshots
    when ``audit_id`` is omitted. 404-class ``AnalysisNotFoundError`` when
    the audit is missing/cross-workspace or has no product snapshots.
    """
    if audit_id is None:
        audit_id = await _latest_product_audit_id(
            session, workspace_id=workspace_id, project_id=project_id
        )
        if audit_id is None:
            raise AnalysisNotFoundError(
                "No completed audit with product metrics for project"
            )
    audit = await session.scalar(
        select(Audit).where(
            Audit.id == audit_id,
            Audit.workspace_id == workspace_id,
            Audit.project_id == project_id,
        )
    )
    if audit is None:
        raise AnalysisNotFoundError(_AUDIT_NOT_FOUND)
    snapshots = list(
        (
            await session.scalars(
                select(ProductMetricSnapshot).where(
                    ProductMetricSnapshot.audit_id == audit.id,
                    ProductMetricSnapshot.workspace_id == workspace_id,
                )
            )
        ).all()
    )
    if not snapshots:
        raise AnalysisNotFoundError("Product metrics not available for audit")
    return audit, snapshots


async def _latest_product_audit_id(
    session: AsyncSession, *, workspace_id: uuid.UUID, project_id: uuid.UUID
) -> uuid.UUID | None:
    """Latest dashboard-eligible audit having >=1 product snapshot."""
    has_snapshots = (
        select(ProductMetricSnapshot.id)
        .where(ProductMetricSnapshot.audit_id == Audit.id)
        .exists()
    )
    return await session.scalar(
        select(Audit.id)
        .where(
            Audit.workspace_id == workspace_id,
            Audit.project_id == project_id,
            Audit.status.in_(_DASHBOARD_STATUSES),
            has_snapshots,
        )
        .order_by(Audit.completed_at.desc().nullslast(), Audit.created_at.desc())
        .limit(1)
    )
