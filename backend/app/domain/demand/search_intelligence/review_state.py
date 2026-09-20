"""Frozen review state and explicit default persistence."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Any

from app.core.config.search_intelligence import (
    DEFAULT_DEPTHS,
    PRICE_VERSION,
    REVIEW_TTL_SECONDS,
    QuoteLine,
    quote_total,
)
from app.domain.demand.search_intelligence.schemas import (
    ReviewCreate,
    SearchIntelligencePreferences,
)
from app.domain.demand.search_intelligence.targets import CanonicalTarget
from app.domain.providers.dataforseo_identity import dataforseo_account_identity
from app.models.project import Project
from app.models.provider import ProviderConnection
from app.models.search_intelligence import SearchIntelligenceRun


def _new_review_run(
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    actor_user_id: uuid.UUID,
    idempotency_key: str,
    payload: ReviewCreate,
    target: CanonicalTarget,
    connection: ProviderConnection,
    location: int | None,
    language: str,
    call_plan: list[dict[str, Any]],
    reused: list[dict[str, Any]],
    quote_lines: list[QuoteLine],
    now: datetime,
) -> SearchIntelligenceRun:
    return SearchIntelligenceRun(
        workspace_id=workspace_id,
        project_id=project_id,
        actor_user_id=actor_user_id,
        previous_run_id=payload.previous_run_id,
        connection_id=connection.id,
        connection_revision=connection.credential_revision,
        account_identity=dataforseo_account_identity(connection.api_key_encrypted),
        status="reviewed",
        action=payload.action,
        idempotency_key=idempotency_key,
        frozen_scope={
            "research_scope": payload.research_scope,
            "owned_target": target.public_dict(),
            "location_code": location,
            "language_code": language,
            "datasets": [item.model_dump(mode="json") for item in payload.datasets],
            "connection_id": str(connection.id),
            "connection_revision": str(connection.credential_revision),
        },
        call_plan=call_plan,
        reused_datasets=reused,
        pricing_version=PRICE_VERSION,
        estimated_cost_usd=quote_total(tuple(quote_lines)),
        planned_calls=len(call_plan),
        planned_rows=sum(line.requested_rows for line in quote_lines),
        expires_at=now + timedelta(seconds=REVIEW_TTL_SECONDS),
    )


def _save_review_defaults(
    project: Project, payload: ReviewCreate, location: int | None, language: str
) -> None:
    project.search_intelligence_preferences = SearchIntelligencePreferences(
        research_scope=payload.research_scope or "domain_subdomains",
        owned_target_id=payload.owned_target_id,
        competitor_ids=[
            item.competitor_id for item in payload.datasets if item.competitor_id
        ],
        location_code=location,
        language_code=language,
        reuse_recent=payload.reuse_recent,
        depths={
            item.kind: item.depth
            for item in payload.datasets
            if item.depth > 1 and item.kind in DEFAULT_DEPTHS
        },
    ).model_dump(mode="json")
