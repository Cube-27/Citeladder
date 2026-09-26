"""Append provider-call attempts without spending the audit's resubmission budget."""
# mypy: disable-error-code=attr-defined

from sqlalchemy import func, select

from app.connectors.search_surfaces.contracts import SearchSurfaceSubmission
from app.core.config.audits import ATTEMPT_STATUS_FAILED, ATTEMPT_STATUS_SUCCEEDED
from app.core.config.task_queue import TASK_STATUS_LEASED, TASK_STATUS_RUNNING
from app.models.audit import ProviderAttempt


class ProviderTaskEvidenceMixin:
    async def _record_provider_exchange(
        self,
        context,
        *,
        error_code: str = "",
        submission: SearchSurfaceSubmission | None = None,
    ) -> None:
        async with self._session_factory() as session:
            locked = await self._lock_owned_running_task(
                session,
                task_id=context.task_id,
                audit_id=context.audit_id,
                allowed_statuses=frozenset({TASK_STATUS_LEASED, TASK_STATUS_RUNNING}),
            )
            if locked is None:
                await session.rollback()
                return
            task, _audit = locked
            if submission is not None:
                task.provider_task_id = submission.provider_task_id
                metadata = dict(task.provider_metadata or {})
                metadata["provider_submission_payload"] = submission.raw_payload
                if submission.provider_cost_microusd is not None:
                    metadata["provider_submission_cost_microusd"] = (
                        submission.provider_cost_microusd
                    )
                task.provider_metadata = metadata
            count = await session.scalar(
                select(func.count())
                .select_from(ProviderAttempt)
                .where(ProviderAttempt.task_id == task.id)
            )
            session.add(
                ProviderAttempt(
                    task_id=task.id,
                    audit_id=task.audit_id,
                    attempt_number=(count or 0) + 1,
                    logical_engine=task.logical_engine,
                    transport_provider=task.transport_provider,
                    transport_model=task.transport_model,
                    status=ATTEMPT_STATUS_FAILED
                    if error_code
                    else ATTEMPT_STATUS_SUCCEEDED,
                    error_code=error_code,
                )
            )
            await session.commit()
