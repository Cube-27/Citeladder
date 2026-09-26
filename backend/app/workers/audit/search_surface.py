"""Submit, park, poll, finalize — the execution shape of an observed surface.

The LLM path is one attempt equals one call: claim, call, persist, done. A
search surface cannot work that way. The provider is PAID at submission and
answers later, so the execution spans three claims of the same queue row and
the dangerous moment is not the call — it is the gap between paying and
recording that you paid.

    intent  ->  submit  ->  park  ->  poll  ->  finalize

Three rules hold the whole thing up, and every branch here is one of them.

**A committed intent precedes the paid call.** ``provider_submission_ref`` is
written and committed BEFORE the POST. Local deduplication is not submission
idempotency: ``uq_response_analysis_task`` prevents a duplicate ANALYSIS and
does nothing about a duplicate paid TASK. A task carrying a ref has already
attempted a paid submission, and that is the only evidence that survives a
process dying mid-POST.

**Retry means retry RETRIEVAL.** Once a ``provider_task_id`` exists, nothing
re-enters submission. A transient poll failure spends a retrieval attempt and
polls the same task again; it never resubmits and never consumes a customer
unit.

**Uncertainty is not permission.** A timeout after POST, or a reclaimed task
holding an intent with no task id, goes to reconciliation — never to a second
submission on the assumption that the first did not land.

This module does not claim exactly-once submission. It claims
at-most-one-unreconciled submission, and an honest state when even that
cannot be proven.
"""
# mypy: disable-error-code=attr-defined

from __future__ import annotations

import logging
import uuid
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select

from app.analysis.search_surfaces.ai_overview import parse_task_payload
from app.analysis.search_surfaces.llm_scraper import parse_scraper_payload
from app.analysis.service import analyze_task, build_scoring_config
from app.connectors.answer_engines.contracts import AnswerEngineResponse
from app.connectors.answer_engines.errors import ProviderError
from app.connectors.search_surfaces.contracts import (
    ERROR_CREDENTIAL_UNAVAILABLE,
    ERROR_POLL_CEILING_EXCEEDED,
    ERROR_SUBMISSION_UNRECONCILED,
    OUTCOME_EXECUTION_FAILURE,
    RESULT_STILL_PENDING,
    SUCCESSFUL_OUTCOMES,
    SearchSurfaceRequest,
    SearchSurfaceResult,
)
from app.connectors.search_surfaces.dataforseo import (
    DataForSeoSearchSurfaceAdapter,
    UncertainSubmission,
)
from app.core.config import dataforseo as dataforseo_config
from app.core.config.llm_scraper import PRODUCTS
from app.core.config.provider_catalog import (
    ERROR_PARSE,
    RETRYABLE_ERRORS,
    is_endpoint_approved,
)
from app.core.config.task_queue import (
    TASK_STATUS_LEASED,
    TASK_STATUS_RUNNING,
    TASK_STATUS_SUBMISSION_UNCERTAIN,
)
from app.models.audit import Audit, AuditTask, RawResponseArtifact
from app.models.search_surfaces import AioEntityLink, AioObservation
from app.workers.audit.scraper_finalization import AuditScraperFinalizationMixin
from app.workers.audit.search_surface_support import (
    _bound_credential,
    _citation_rows,
    _context_is_owned,
    _context_metadata,
    _frozen_connection_id,
    _frozen_search_context,
    _match_by_tag,
    _provider_refusal,
    _SearchContext,
    _submission_ref,
    _surface_usage,
    _task_metadata,
    recovery_deadline,
)

logger = logging.getLogger("app.workers.audit_worker")

# The row is `leased` on the submit pass and back in a parked status on later
# passes, so the writers here accept both rather than the LLM path's
# `running`-only gate.
_SEARCH_WRITE_STATUSES = frozenset(
    {TASK_STATUS_LEASED, TASK_STATUS_RUNNING, TASK_STATUS_SUBMISSION_UNCERTAIN}
)


def _utcnow() -> datetime:
    return datetime.now(UTC)


class AuditSearchSurfaceMixin(AuditScraperFinalizationMixin):
    """The submit/park/poll/finalize path for a ``search_ai`` route."""

    async def _run_search_surface(
        self, task_id: uuid.UUID, audit_id: uuid.UUID
    ) -> bool:
        """Advance one observed-surface task by exactly one phase.

        Returns True when the task was PARKED rather than finished, so the
        caller's slot moves on instead of spinning on a row that is waiting
        for someone else.

        Which phase runs is decided by the row's own committed state, never by
        an in-memory flag: the phases are separated by process boundaries, and
        a worker restart between any two of them must resume rather than
        restart.
        """
        async with self._session_factory() as session:
            task = await session.get(AuditTask, task_id)
            if task is None:
                return False
            has_intent = bool(task.provider_submission_ref)
            has_task_id = bool(task.provider_task_id)
            uncertain = task.status == TASK_STATUS_SUBMISSION_UNCERTAIN
            deadline = recovery_deadline(task)

        if deadline is not None and _utcnow() >= deadline:
            context = await self._load_search_context(task_id, audit_id)
            if context is not None:
                await self._finalize_search_surface(
                    task_id,
                    audit_id,
                    SearchSurfaceResult(
                        outcome=OUTCOME_EXECUTION_FAILURE,
                        error_code=ERROR_SUBMISSION_UNRECONCILED,
                    ),
                    context=context,
                )
            return False

        if has_task_id:
            return await self._poll_search_surface(task_id, audit_id)
        if uncertain or has_intent:
            # An intent with no task id means a paid submission may already be
            # outstanding. Reconcile it; never assume it did not land.
            return await self._reconcile_search_surface(task_id, audit_id)
        return await self._submit_search_surface(task_id, audit_id)

    # --- Phase 1: submit --------------------------------------------------

    async def _submit_search_surface(
        self, task_id: uuid.UUID, audit_id: uuid.UUID
    ) -> bool:
        """Commit the intent, then pay. In that order, in separate commits."""
        context = await self._load_search_context(task_id, audit_id)
        if context is None:
            return False
        if not context.secret:
            await self._finalize_search_surface(
                task_id,
                audit_id,
                SearchSurfaceResult(
                    outcome=OUTCOME_EXECUTION_FAILURE,
                    error_code=ERROR_CREDENTIAL_UNAVAILABLE,
                ),
                context=context,
            )
            return False

        submission_ref = _submission_ref(context.idempotency_key)
        # Its own transaction, committed BEFORE the POST. If the process dies
        # one instruction later, this row is the only thing that will say a
        # paid submission was attempted — and it is enough.
        async with self._session_factory() as session:
            locked = await self._lock_owned_running_task(
                session,
                task_id=task_id,
                audit_id=audit_id,
                allowed_statuses=_SEARCH_WRITE_STATUSES,
            )
            if locked is None:
                await session.rollback()
                return False
            task, _audit = locked
            task.provider_submission_ref = submission_ref
            task.provider_task_submitted_at = _utcnow()
            task.provider_connection_id = context.connection_id
            task.provider_credential_revision = context.credential_revision
            await session.commit()

        adapter = DataForSeoSearchSurfaceAdapter(
            secret=context.secret,
            base_url=context.base_url,
            logical_engine=context.logical_engine,
        )
        request = SearchSurfaceRequest(
            query=context.prompt_text,
            location_code=context.location_code,
            language_code=context.language_code,
            device=context.device,
            depth=dataforseo_config.DEFAULT_DEPTH,
            load_async_ai_overview=dataforseo_config.LOAD_ASYNC_AI_OVERVIEW,
            timeout_seconds=dataforseo_config.dataforseo_settings.request_timeout_seconds,
            provider_submission_ref=submission_ref,
            request_settings=context.request_settings,
        )
        try:
            submission = await adapter.submit(request)
        except ProviderError as exc:
            await self._record_provider_exchange(
                context,
                error_code=exc.error_code,
                submission=exc.submission
                if isinstance(exc, UncertainSubmission)
                else None,
            )
            if exc.error_code in RETRYABLE_ERRORS or exc.error_code == ERROR_PARSE:
                # A timeout, connection fault or unreadable/id-less response
                # AFTER the POST left the wire is an UNCERTAIN submission, not
                # a failed one. The request may
                # have landed and been charged, so this waits for
                # reconciliation rather than trying again.
                await self._park_submission_uncertain(task_id, audit_id)
                return True
            # A refused submission (bad field, bad credential) created no
            # task and cost nothing, so it terminates outright.
            await self._finalize_search_surface(
                task_id,
                audit_id,
                _provider_refusal(exc),
                context=context,
            )
            return False

        await self._record_provider_exchange(context, submission=submission)
        await self._park_awaiting_result(
            task_id,
            audit_id,
            provider_task_id=submission.provider_task_id,
            cost_microusd=submission.provider_cost_microusd,
            delay_seconds=dataforseo_config.FIRST_POLL_DELAY_SECONDS,
        )
        return True

    # --- Phase 2: poll ----------------------------------------------------

    async def _poll_search_surface(
        self, task_id: uuid.UUID, audit_id: uuid.UUID
    ) -> bool:
        """Collect a submitted task. Never resubmits, whatever goes wrong."""
        context = await self._load_search_context(task_id, audit_id)
        if context is None:
            return False
        if not context.secret:
            # The submitting connection was rotated, paused or removed while
            # the task was in flight. Polling a DIFFERENT account would return
            # "task not found" and look like a provider fault, so this
            # terminates with a name instead.
            await self._finalize_search_surface(
                task_id,
                audit_id,
                SearchSurfaceResult(
                    outcome=OUTCOME_EXECUTION_FAILURE,
                    error_code=ERROR_CREDENTIAL_UNAVAILABLE,
                ),
                context=context,
            )
            return False
        if (
            context.logical_engine not in PRODUCTS
            and context.poll_count >= dataforseo_config.POLL_CEILING
        ):
            await self._finalize_search_surface(
                task_id,
                audit_id,
                SearchSurfaceResult(
                    outcome=OUTCOME_EXECUTION_FAILURE,
                    error_code=ERROR_POLL_CEILING_EXCEEDED,
                ),
                context=context,
            )
            return False

        adapter = DataForSeoSearchSurfaceAdapter(
            secret=context.secret,
            base_url=context.base_url,
            logical_engine=context.logical_engine,
        )
        try:
            payload = await adapter.fetch(context.provider_task_id)
        except ProviderError as exc:
            await self._record_provider_exchange(context, error_code=exc.error_code)
            if exc.error_code in RETRYABLE_ERRORS:
                # Retrieval itself faulted. Spend a RETRIEVAL attempt and poll
                # the same task again — this is the only counter that moves,
                # and it governs backoff, never billing and never quota.
                await self._park_awaiting_result(
                    task_id,
                    audit_id,
                    delay_seconds=dataforseo_config.POLL_INTERVAL_SECONDS,
                    spend_poll=True,
                )
                return True
            await self._finalize_search_surface(
                task_id, audit_id, _provider_refusal(exc), context=context
            )
            return False

        await self._record_provider_exchange(context)
        try:
            result = (
                parse_scraper_payload(
                    payload,
                    expected_task_id=context.provider_task_id,
                    logical_engine=context.logical_engine,
                )
                if context.logical_engine in PRODUCTS
                else parse_task_payload(
                    payload, expected_task_id=context.provider_task_id
                )
            )
        except ProviderError as exc:
            result = replace(_provider_refusal(exc), raw_payload=payload)
        if isinstance(result, AnswerEngineResponse):
            await self._finalize_scraper(task_id, audit_id, result)
            return False
        if result is RESULT_STILL_PENDING:
            # The provider says it is queued or handed. No attempt is spent:
            # nothing failed, and the task is making normal progress.
            await self._park_awaiting_result(
                task_id,
                audit_id,
                delay_seconds=dataforseo_config.POLL_INTERVAL_SECONDS,
                spend_poll=True,
            )
            return True
        if not isinstance(result, SearchSurfaceResult):
            # Unreachable: the parser returns a result or the pending
            # sentinel. Handled rather than asserted so a future third return
            # value cannot silently finalize a task as something it is not.
            logger.error(
                "search surface parser returned an unexpected value",
                extra={"task_id": str(task_id)},
            )
            await self._park_awaiting_result(
                task_id,
                audit_id,
                delay_seconds=dataforseo_config.POLL_INTERVAL_SECONDS,
                spend_poll=True,
            )
            return True
        await self._finalize_search_surface(task_id, audit_id, result, context=context)
        return False

    # --- Phase 3: reconcile ----------------------------------------------

    async def _reconcile_search_surface(
        self, task_id: uuid.UUID, audit_id: uuid.UUID
    ) -> bool:
        """Find an outstanding paid submission again, or say we could not.

        Matching requires the TAG. Account, time window and request context
        narrow the candidate set; they do not establish identity. Two
        repetitions of the same prompt from the same account with the same
        location, language, device and depth have identical contexts, and
        binding on context or nearest timestamp would not fail loudly — it
        would retrieve a real AI Overview and attach it to the wrong
        repetition. There is no context-only fallback.
        """
        context = await self._load_search_context(task_id, audit_id)
        if context is None:
            return False
        if not context.secret or not context.submission_ref:
            await self._finalize_search_surface(
                task_id,
                audit_id,
                SearchSurfaceResult(
                    outcome=OUTCOME_EXECUTION_FAILURE,
                    error_code=ERROR_SUBMISSION_UNRECONCILED,
                ),
                context=context,
            )
            return False

        adapter = DataForSeoSearchSurfaceAdapter(
            secret=context.secret,
            base_url=context.base_url,
            logical_engine=context.logical_engine,
        )
        # The upper bound must be strictly in the past or the provider refuses
        # the window outright.
        upper = _utcnow() - timedelta(
            seconds=dataforseo_config.RECONCILE_WINDOW_LAG_SECONDS
        )
        lower = context.submitted_at or (
            upper - timedelta(hours=dataforseo_config.RECONCILE_WINDOW_HOURS)
        )
        lower -= timedelta(seconds=dataforseo_config.RECONCILE_WINDOW_LAG_SECONDS)
        if context.logical_engine in PRODUCTS:
            return await self._reconcile_scraper_page(context, adapter, lower, upper)
        try:
            listing = await adapter.list_task_ids(
                datetime_from=lower, datetime_to=upper
            )
        except ProviderError:
            # Reconciliation is itself retryable; the submission stays
            # uncertain rather than being declared lost on one bad sweep.
            await self._park_submission_uncertain(task_id, audit_id, spend_poll=True)
            return True

        matched = _match_by_tag(listing, context.submission_ref)
        if matched is None:
            if context.poll_count >= dataforseo_config.POLL_CEILING:
                # Missing, absent or ambiguous identity is not resolved by
                # guessing. The task terminates honestly.
                await self._finalize_search_surface(
                    task_id,
                    audit_id,
                    SearchSurfaceResult(
                        outcome=OUTCOME_EXECUTION_FAILURE,
                        error_code=ERROR_SUBMISSION_UNRECONCILED,
                    ),
                    context=context,
                )
                return False
            await self._park_submission_uncertain(task_id, audit_id, spend_poll=True)
            return True

        # Bound only now, on a verified tag match — and the budget resets.
        #
        # One counter covers two phases, and they are not the same phase.
        # Reconciliation sweeps spend it looking for the task; polling spends
        # it waiting for that task's result. Carrying the sweep's spend into
        # the polling phase means a submission reconciled on its LAST sweep
        # enters polling already at the ceiling, finalizes as
        # `poll_ceiling_exceeded` before a single fetch, and throws away a
        # paid, matched provider task while naming the wrong cause.
        await self._park_awaiting_result(
            task_id,
            audit_id,
            provider_task_id=matched,
            delay_seconds=dataforseo_config.FIRST_POLL_DELAY_SECONDS,
            reset_poll_count=True,
        )
        logger.info(
            "reconciled an uncertain submission by tag",
            extra={"task_id": str(task_id), "provider_task_id": matched},
        )
        return True

    # --- Parking ----------------------------------------------------------

    async def _park_awaiting_result(
        self,
        task_id: uuid.UUID,
        audit_id: uuid.UUID,
        *,
        provider_task_id: str | None = None,
        cost_microusd: int | None = None,
        delay_seconds: float,
        spend_poll: bool = False,
        reset_poll_count: bool = False,
    ) -> None:
        del audit_id  # parking needs only the row

        def _apply(task: Any) -> None:
            _cap_recovery_time(task)
            if provider_task_id is not None:
                task.provider_task_id = provider_task_id
            if reset_poll_count:
                task.provider_poll_count = 0
            if spend_poll:
                task.provider_poll_count = (task.provider_poll_count or 0) + 1
            if cost_microusd is not None:
                # The submission charge is recorded the moment it is known,
                # not when the result arrives: a task whose retrieval never
                # succeeds has still cost money, and its cost record has to
                # say so.
                metadata = dict(task.provider_metadata or {})
                metadata["provider_submission_cost_microusd"] = cost_microusd
                task.provider_metadata = metadata

        await self._queue.park_awaiting_provider_result(
            task_id=task_id,
            owner=self.owner,
            available_at=_utcnow() + timedelta(seconds=delay_seconds),
            mutate=_apply,
        )

    async def _park_submission_uncertain(
        self,
        task_id: uuid.UUID,
        audit_id: uuid.UUID,
        *,
        spend_poll: bool = False,
        reconciliation: dict | None = None,
    ) -> None:
        del audit_id

        def _apply(task: Any) -> None:
            _cap_recovery_time(task)
            if reconciliation is not None:
                task.provider_metadata = {
                    **(task.provider_metadata or {}),
                    "reconciliation": reconciliation,
                }
            if spend_poll:
                task.provider_poll_count = (task.provider_poll_count or 0) + 1

        await self._queue.park_submission_uncertain(
            task_id=task_id,
            owner=self.owner,
            available_at=_utcnow()
            + timedelta(seconds=dataforseo_config.POLL_INTERVAL_SECONDS),
            mutate=_apply,
        )

    # --- Finalization -----------------------------------------------------

    async def _finalize_search_surface(
        self,
        task_id: uuid.UUID,
        audit_id: uuid.UUID,
        result: SearchSurfaceResult,
        *,
        context: _SearchContext,
    ) -> None:
        """Write the observation, and the analysis, in ONE transaction.

        Coherence is the requirement. An interrupted write must not leave an
        observation permanently marked ``ai_overview_present`` with no
        analysis behind it, so the observation row, the artifact, the
        ``ResponseAnalysis`` and its child mention and citation rows commit
        together or not at all.

        The observation is written for EVERY terminal outcome, including the
        ones that never produce an analysis. That is the point of keying it on
        the task.
        """
        if context.logical_engine in PRODUCTS:
            await self._finalize_scraper(task_id, audit_id, result)
            return
        succeeded = result.outcome in SUCCESSFUL_OUTCOMES
        artifact_id: uuid.UUID | None = None
        async with self._session_factory() as session:
            locked = await self._lock_owned_running_task(
                session,
                task_id=task_id,
                audit_id=audit_id,
                allowed_statuses=_SEARCH_WRITE_STATUSES,
            )
            if locked is None:
                await session.rollback()
                return
            task, audit = locked

            existing = await session.scalar(
                select(AioObservation).where(AioObservation.task_id == task_id)
            )
            if existing is not None:
                # The observation is already recorded, so the EVIDENCE side is
                # done and must not be written twice — this codebase's
                # idempotency style is unique constraint plus pre-check, not
                # upsert.
                #
                # But returning here is not enough. The observation and the
                # queue terminalization commit in separate transactions, so a
                # lease lost between them leaves a recorded observation on a
                # task that is still claimable. It would be polled again, land
                # here, return without terminalizing, and repeat until the
                # sweeper failed it — marking a SUCCESSFUL observation as
                # failed. So the queue is repaired from what was already
                # recorded rather than from the result just parsed.
                # Read the outcome out BEFORE the session goes: the row is
                # detached after the rollback and touching it later would try
                # to refresh it with no connection to refresh from.
                recorded_outcome = existing.outcome
                recorded_error_code = existing.error_code
                recorded_artifact_id = task.result_artifact_id
                await session.rollback()
                await self._terminalize_search_task(
                    task_id,
                    outcome=recorded_outcome,
                    error_code=recorded_error_code,
                    artifact_id=recorded_artifact_id,
                )
                return

            observation = AioObservation(
                workspace_id=task.workspace_id,
                audit_id=audit_id,
                task_id=task_id,
                outcome=result.outcome,
                error_code=result.error_code,
                provider_status_code=result.provider_status_code,
                aio_present=result.aio_present,
                aio_serp_position=result.aio_serp_position,
                location_code=context.location_code,
                language_code=context.language_code,
                device=context.device,
                provider_task_id=context.provider_task_id,
                provider_submission_ref=context.submission_ref,
                provider_connection_id=context.connection_id,
                element_count=len(result.elements),
                reference_count=len(result.references),
                observed_at=result.observed_at,
                retrieved_at=_utcnow(),
            )
            session.add(observation)
            await session.flush()

            for link in result.links:
                session.add(
                    AioEntityLink(
                        workspace_id=task.workspace_id,
                        observation_id=observation.id,
                        url=link.url,
                        domain=link.domain,
                        title=link.title,
                        element_index=link.element_index,
                    )
                )

            if succeeded:
                citations = _citation_rows(result)
                artifact = RawResponseArtifact(
                    audit_id=audit_id,
                    task_id=task_id,
                    logical_engine=task.logical_engine,
                    transport_provider=task.transport_provider,
                    transport_model=task.transport_model,
                    answer_text=result.answer_text,
                    # Nothing was "searched" on our behalf: the SERP IS the
                    # observation, so the LLM retrieval flag stays false
                    # rather than being repurposed.
                    search_used=False,
                    search_events=None,
                    citations=citations,
                    # The COMPLETE task object, every item type included.
                    # Nothing outside the parser reads the other types and no
                    # projection exposes them.
                    provider_metadata=result.raw_payload,
                    # The flat per-task fee this surface actually cost. The
                    # route is priced per task rather than per token, so this
                    # is the whole of its usage -- and leaving it null was
                    # what kept every AI Overview task out of the cost ledger
                    # entirely, so an audit's total silently omitted the one
                    # route whose real charge the provider reports outright.
                    usage=_surface_usage(task, result),
                )
                session.add(artifact)
                await session.flush()
                artifact_id = artifact.id
                # Same append-only projection the LLM path records. Every
                # token rate on this route is permanently null, so the row
                # lands as `partial`, carrying the provider-reported charge
                # and no fabricated estimate beside it.
                self._record_cost_projection(
                    session, artifact=artifact, attempt_count=task.attempt_count or 0
                )
                task.result_artifact_id = artifact_id
                task.answer_text = result.answer_text
                task.citations = citations
                task.search_used = False
                task.provider_metadata = _task_metadata(task, result)

                config = build_scoring_config(audit.configuration)
                analysis = await analyze_task(session, task=task, config=config)
                if analysis is not None:
                    task.score = analysis.score
            else:
                task.error_code = (result.error_code or result.outcome)[:32]
                task.error_detail = f"search surface outcome {result.outcome}" + (
                    f" (provider status {result.provider_status_code})"
                    if result.provider_status_code is not None
                    else ""
                )
            await session.commit()

        await self._terminalize_search_task(
            task_id,
            outcome=result.outcome,
            error_code=result.error_code,
            artifact_id=artifact_id,
        )

    async def _terminalize_search_task(
        self,
        task_id: uuid.UUID,
        *,
        outcome: str,
        error_code: str,
        artifact_id: uuid.UUID | None,
    ) -> None:
        """Move the queue row to its terminal status for one outcome."""
        if outcome in SUCCESSFUL_OUTCOMES:
            # The artifact id is passed through rather than left to the write
            # above: ``succeed`` sets this column unconditionally, so omitting
            # it here would null the evidence link the transaction just made.
            await self._queue.succeed(
                task_id=task_id, owner=self.owner, result_artifact_id=artifact_id
            )
            return
        await self._queue.fail(
            task_id=task_id,
            owner=self.owner,
            error_code=(error_code or outcome)[:32],
            error_detail=f"search surface outcome {outcome}",
        )

    # --- Context ----------------------------------------------------------

    async def _load_search_context(
        self, task_id: uuid.UUID, audit_id: uuid.UUID
    ) -> _SearchContext | None:
        """Everything one phase needs, read in one short session.

        The credential is the BOUND connection, loaded by the id frozen at
        submission and checked against the revision it was valid at. It is
        never re-resolved: DataForSEO task ids are scoped to the account that
        created them, so selecting a different account at poll time would turn
        a settings change into a mystery "task not found".
        """
        async with self._session_factory() as session:
            task = await session.get(AuditTask, task_id)
            audit = await session.get(Audit, audit_id)
            if task is None or audit is None:
                return None
            if not _context_is_owned(task, audit, self.owner, _utcnow()):
                return None
            route = dict(task.provider_route_snapshot or {})
            connection_id = task.provider_connection_id or _frozen_connection_id(route)
            secret, revision = await _bound_credential(
                session,
                connection_id=connection_id,
                revision=task.provider_credential_revision,
                workspace_id=task.workspace_id,
            )
            if not is_endpoint_approved(
                task.transport_provider, str(route.get("base_url") or "")
            ):
                secret = ""
            return _SearchContext(
                task_id=task_id,
                audit_id=audit_id,
                prompt_text=task.prompt_text or "",
                logical_engine=task.logical_engine,
                submitted_at=task.provider_task_submitted_at,
                **_context_metadata(task),
                idempotency_key=task.idempotency_key,
                submission_ref=task.provider_submission_ref,
                provider_task_id=task.provider_task_id,
                poll_count=task.provider_poll_count or 0,
                connection_id=connection_id,
                credential_revision=revision,
                secret=secret,
                **_frozen_search_context(task.request_snapshot),
            )


__all__ = ["AuditSearchSurfaceMixin"]


def _cap_recovery_time(task: Any) -> None:
    deadline = recovery_deadline(task)
    if deadline is not None:
        task.available_at = min(task.available_at, deadline)
