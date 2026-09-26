"""Persist consumer answers through the existing artifact and analysis owners."""
# mypy: disable-error-code=attr-defined

import uuid
from dataclasses import replace

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.service import analyze_task, build_scoring_config
from app.connectors.answer_engines.contracts import (
    AnswerEngineResponse,
    NormalizedUsage,
)
from app.connectors.search_surfaces.contracts import SearchSurfaceResult
from app.core.config.task_queue import TASK_STATUS_LEASED, TASK_STATUS_RUNNING
from app.models.audit import Audit, AuditTask, ProviderAttempt, RawResponseArtifact
from app.workers.audit.provider_task_evidence import ProviderTaskEvidenceMixin
from app.workers.audit.scraper_reconciliation import AuditScraperReconciliationMixin
from app.workers.audit.search_surface_support import _surface_usage
from app.workers.audit_worker_support import (
    apply_response_to_task,
    build_artifact,
    serialize_citations,
    serialize_search_events,
)


async def _persist_answer(
    session: AsyncSession, task: AuditTask, audit: Audit, result: AnswerEngineResponse
) -> RawResponseArtifact:
    metadata = {**(task.provider_metadata or {}), **result.provider_metadata}
    response: AnswerEngineResponse = replace(
        result,
        transport_provider=task.transport_provider,
        transport_model=task.transport_model,
        provider_metadata=metadata,
        normalized_usage=NormalizedUsage(
            provider_cost_microusd=metadata.get("provider_submission_cost_microusd")
        ),
    )
    citations = serialize_citations(response)
    events = serialize_search_events(response)
    artifact = build_artifact(
        audit_id=audit.id,
        task_id=task.id,
        response=response,
        citations=citations,
        search_events=events,
    )
    session.add(artifact)
    await session.flush()
    apply_response_to_task(
        task,
        response=response,
        request_snapshot=task.request_snapshot or {},
        citations=citations,
        search_events=events,
        artifact_id=artifact.id,
    )
    analysis = await analyze_task(
        session, task=task, config=build_scoring_config(audit.configuration)
    )
    if analysis is not None:
        task.score = analysis.score
    return artifact


async def _persist_failure(
    session: AsyncSession, task: AuditTask, result: SearchSurfaceResult
) -> RawResponseArtifact:
    task.error_code = (result.error_code or result.outcome)[:32]
    task.provider_metadata = {
        **(task.provider_metadata or {}),
        "scraper_outcome": result.outcome,
    }
    artifact = RawResponseArtifact(
        audit_id=task.audit_id,
        task_id=task.id,
        logical_engine=task.logical_engine,
        transport_provider=task.transport_provider,
        transport_model=task.transport_model,
        answer_text="",
        search_used=False,
        provider_metadata={
            **(task.provider_metadata or {}),
            "raw_response": result.raw_payload,
            "scraper_outcome": result.outcome,
        },
        usage=_surface_usage(task, result),
    )
    session.add(artifact)
    await session.flush()
    task.result_artifact_id = artifact.id
    return artifact


class AuditScraperFinalizationMixin(
    ProviderTaskEvidenceMixin, AuditScraperReconciliationMixin
):
    async def _finalize_scraper(
        self,
        task_id: uuid.UUID,
        audit_id: uuid.UUID,
        result: AnswerEngineResponse | SearchSurfaceResult,
    ) -> None:
        async with self._session_factory() as session:
            locked = await self._lock_owned_running_task(
                session,
                task_id=task_id,
                audit_id=audit_id,
                allowed_statuses=frozenset({TASK_STATUS_LEASED, TASK_STATUS_RUNNING}),
            )
            if locked is None:
                await session.rollback()
                return
            task, audit = locked
            if task.result_artifact_id is None:
                artifact = (
                    await _persist_answer(session, task, audit, result)
                    if isinstance(result, AnswerEngineResponse)
                    else await _persist_failure(session, task, result)
                )
                self._record_cost_projection(
                    session,
                    artifact=artifact,
                    attempt_count=await session.scalar(
                        select(func.count())
                        .select_from(ProviderAttempt)
                        .where(ProviderAttempt.task_id == task.id)
                    ),
                )
            artifact_id, error_code = task.result_artifact_id, task.error_code
            await session.commit()
        if error_code:
            await self._queue.fail(
                task_id=task_id,
                owner=self.owner,
                error_code=error_code,
                error_detail="Scraper answer could not be recovered",
            )
        else:
            await self._queue.succeed(
                task_id=task_id, owner=self.owner, result_artifact_id=artifact_id
            )
