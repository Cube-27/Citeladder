# Content worker: claims ContentGeneration queue rows and calls the provider.
#
# A separate process (the ``content-worker`` compose service / Railway
# service). It claims rows through the generic ``PostgresTaskQueue``
# (``FOR UPDATE SKIP LOCKED``; claim committed BEFORE any network I/O —
# invariant 8), builds a fresh discovery client per attempt (env-driven
# ``SecretStr`` key resolved at call time, never logged — invariant 6), and
# heartbeats the lease while the call runs.
#
# ALL attempt + terminal accounting goes through the worker-owned atomic
# ``finalize_attempt``: one locked transaction per actual HTTP call appends
# exactly one ``ContentGenerationAttempt``, increments ``attempt_count`` once,
# and writes the retry/terminal fields together — a crash mid-write can never
# leave a half-counted attempt. The worker deliberately does NOT use
# ``PostgresTaskQueue.succeed()`` (that method only exists to write the audit
# ``result_artifact_id``); the queue is used for claim/heartbeat/mark_running/
# release_expired only.
from __future__ import annotations

import asyncio
import contextlib
import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.connectors.answer_engines.errors import ProviderError
from app.connectors.discovery_models.contracts import (
    DiscoveryRequest,
    DiscoveryResponse,
)
from app.connectors.discovery_models.factory import build_discovery_client
from app.core.config.app_models import APP_FEATURE_CONTENT
from app.core.config.content import (
    CONTENT_QUEUE_SPEC,
    content_settings,
)
from app.core.config.provider_catalog import ERROR_PARSE, ERROR_UNKNOWN
from app.core.config.task_queue import (
    TASK_STATUS_CANCELLED,
    TASK_STATUS_FAILED,
    TASK_STATUS_RETRY_WAIT,
    TASK_STATUS_SUCCEEDED,
    TASK_TERMINAL_STATUSES,
)
from app.core.database import SessionLocal
from app.core.telemetry import configure_logging, instrument_worker
from app.domain.billing.catalog_revisions import (
    CatalogUnavailableError,
    ai_credit_policy_for_revision,
)
from app.domain.content.context_builder import ContentContext
from app.domain.content.message_builder import build_messages
from app.domain.entitlements.enforcement import (
    CapabilityNotGrantedError,
    require_workspace_capability,
)
from app.domain.entitlements.ledger import release_unused_reservation
from app.domain.entitlements.metered import settle_metered_usage
from app.domain.providers.app_routes import (
    AppModelRouteUnavailableError,
    resolve_app_model_route,
)
from app.models.content import ContentGeneration, ContentGenerationAttempt
from app.orchestration.postgres_task_queue import PostgresTaskQueue
from app.workers.drain import DrainableWorkerMixin

logger = logging.getLogger("app.workers.content_worker")

# Attempt-row statuses (what happened on ONE actual HTTP call).
ATTEMPT_STATUS_DISPATCHED = "dispatched"
ATTEMPT_STATUS_SUCCEEDED = "succeeded"
ATTEMPT_STATUS_FAILED = "failed"
USAGE_COMPLETE = "complete"
USAGE_UNKNOWN = "unknown"

# OpenAI-compatible truncation finish reason: output hit ``max_tokens``.
FINISH_REASON_LENGTH = "length"


def _utcnow() -> datetime:
    return datetime.now(UTC)


@dataclass(frozen=True)
class AttemptOutcome:
    """The result of ONE actual provider HTTP call, ready to finalize."""

    response: DiscoveryResponse | None
    error: ProviderError | None
    observed_usage: dict | None = None

    @property
    def succeeded(self) -> bool:
        return self.response is not None


def _usage_for_outcome(outcome: AttemptOutcome) -> dict | None:
    if outcome.observed_usage is not None:
        return dict(outcome.observed_usage)
    if outcome.response is not None:
        return dict(outcome.response.usage)
    return None


async def _settle_platform_attempt(
    session,
    *,
    row: ContentGeneration,
    attempt: ContentGenerationAttempt,
    outcome: AttemptOutcome,
    now: datetime,
) -> None:
    if row.funding_source != "platform" or row.reservation_id is None:
        attempt.settlement_status = "zero_debit"
        return
    if not row.policy_revision:
        await release_unused_reservation(
            session,
            reservation_id=row.reservation_id,
            idempotency_key=f"content:{row.id}:policy-unavailable",
            at=now,
        )
        attempt.settlement_status = "policy_unavailable"
        return
    try:
        policy = await ai_credit_policy_for_revision(session, row.policy_revision)
    except CatalogUnavailableError:
        attempt.settlement_status = "policy_unavailable"
        return
    rate = policy.rate(feature=APP_FEATURE_CONTENT, model=row.requested_model)
    if rate is None:
        await release_unused_reservation(
            session,
            reservation_id=row.reservation_id,
            idempotency_key=f"content:{row.id}:rate-unavailable",
            at=now,
        )
        attempt.settlement_status = "policy_unavailable"
        return
    settlement = await settle_metered_usage(
        session,
        reservation_id=row.reservation_id,
        dispatch_key=str(attempt.dispatch_id),
        attempt=attempt.attempt_number,
        charged_units=rate.charge(_usage_for_outcome(outcome) or {}),
        unknown_usage_charge=rate.unknown_usage_charge,
        idempotency_key=f"content:{row.id}:settle",
        at=now,
    )
    attempt.settled_units = settlement.charged_units
    attempt.absorbed_units = settlement.absorbed_units
    attempt.settlement_status = "settled"


def _apply_attempt_outcome(
    attempt: ContentGenerationAttempt, outcome: AttemptOutcome, *, now: datetime
) -> None:
    response, error = outcome.response, outcome.error
    usage = _usage_for_outcome(outcome)
    attempt.status = (
        ATTEMPT_STATUS_SUCCEEDED if outcome.succeeded else ATTEMPT_STATUS_FAILED
    )
    attempt.returned_model = response.returned_model if response is not None else None
    attempt.finish_reason = response.finish_reason if response is not None else None
    attempt.error_code = error.error_code if error is not None else ""
    attempt.error_detail = str(error)[:2000] if error is not None else ""
    attempt.usage = usage
    usage_complete = bool(
        usage
        and isinstance(usage.get("input_tokens", usage.get("prompt_tokens")), int)
        and isinstance(usage.get("output_tokens", usage.get("completion_tokens")), int)
    )
    attempt.usage_completeness = USAGE_COMPLETE if usage_complete else USAGE_UNKNOWN
    attempt.latency_ms = response.latency_ms if response is not None else None
    attempt.completed_at = now
    attempt.settlement_status = "not_applicable"


def _apply_success(
    row: ContentGeneration, response: DiscoveryResponse, now: datetime
) -> None:
    row.output_text = response.output_text
    row.provider = response.provider
    row.returned_model = response.returned_model
    row.finish_reason = response.finish_reason
    row.output_truncated = response.finish_reason == FINISH_REASON_LENGTH
    row.usage = dict(response.usage)
    row.latency_ms = response.latency_ms
    row.status = TASK_STATUS_SUCCEEDED
    row.completed_at = now
    row.error_code = ""
    row.error_detail = ""


def _apply_failure(
    row: ContentGeneration,
    *,
    error: ProviderError | None,
    attempt_number: int,
    now: datetime,
) -> None:
    if error is not None and error.retryable and attempt_number < row.max_attempts:
        delay = content_settings.retry_delay(attempt_number, error.retry_after_seconds)
        row.status = TASK_STATUS_RETRY_WAIT
        row.available_at = now + timedelta(seconds=delay)
        row.error_code = error.error_code
        row.error_detail = str(error)[:2000]
        return
    row.status = TASK_STATUS_FAILED
    row.completed_at = now
    row.error_code = (
        error.error_code
        if error is not None and not error.retryable
        else CONTENT_QUEUE_SPEC.max_attempts_error
    )
    row.error_detail = str(error)[:2000] if error is not None else ""


class ContentWorker(DrainableWorkerMixin):
    """Claim/lease loop for ``ContentGeneration`` rows.

    ``transport`` is the test seam: an ``httpx.MockTransport`` makes the real
    OpenAI-compatible client run without a network. Production passes none.
    """

    def __init__(
        self,
        *,
        session_factory: async_sessionmaker[AsyncSession] | None = None,
        owner: str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._session_factory = session_factory or SessionLocal
        self._queue = PostgresTaskQueue(self._session_factory, CONTENT_QUEUE_SPEC)
        self._transport = transport
        self.owner = owner or f"content-worker-{uuid.uuid4().hex[:12]}"

    # --- Loop -------------------------------------------------------------

    async def run_once(self) -> int:
        """Sweep expired leases, claim one row, run it. Returns count run."""
        await self._queue.release_expired()
        rows = await self._queue.claim(owner=self.owner, limit=1)
        for row in rows:
            await self._execute(row)
        return len(rows)

    async def run_forever(self) -> None:  # pragma: no cover - process loop
        logger.info("content worker started", extra={"owner": self.owner})
        while True:
            try:
                ran = await self.run_once()
            except Exception:  # defensive: a bad row must not kill the loop
                logger.exception("content worker loop iteration failed")
                ran = 0
            if ran == 0:
                await asyncio.sleep(max(0.05, content_settings.poll_interval_seconds))

    # --- One claimed row --------------------------------------------------

    async def _execute(self, claimed: ContentGeneration) -> None:
        generation_id = claimed.id
        try:
            # Cooperative cancel at the boundary: if the row was cancelled
            # between enqueue and claim, never touch the provider.
            async with self._session_factory() as session:
                row = await session.get(ContentGeneration, generation_id)
                if row is None or row.status in TASK_TERMINAL_STATUSES:
                    return

            if not await self._queue.mark_running(
                task_id=generation_id, owner=self.owner
            ):
                # Lease lost before the call started; another worker retries.
                return

            await self._run_provider_call(claimed)
        except Exception as exc:  # defensive: never kill the loop
            logger.exception(
                "content generation crashed",
                extra={"generation_id": str(generation_id)},
            )
            with contextlib.suppress(Exception):
                await self.finalize_attempt(
                    generation_id=generation_id,
                    owner=self.owner,
                    outcome=AttemptOutcome(
                        response=None,
                        error=ProviderError(
                            f"worker crash: {type(exc).__name__}",
                            error_code=ERROR_UNKNOWN,
                            retryable=False,
                        ),
                    ),
                )

    async def _route_client(self, claimed: ContentGeneration):
        if claimed.funding_source == "platform":
            return build_discovery_client(transport=self._transport)
        async with self._session_factory() as session:
            await require_workspace_capability(
                session, workspace_id=claimed.workspace_id, key="content_creation"
            )
            route = await resolve_app_model_route(
                session,
                workspace_id=claimed.workspace_id,
                feature=APP_FEATURE_CONTENT,
                at=_utcnow(),
            )
        frozen = (
            route.route_id,
            route.connection_id,
            route.route_revision,
            route.credential_revision,
            route.model,
        )
        expected = (
            claimed.route_id,
            claimed.connection_id,
            claimed.route_revision,
            claimed.credential_revision,
            claimed.requested_model,
        )
        if frozen != expected:
            raise AppModelRouteUnavailableError(
                "The admitted app model route changed before dispatch"
            )
        if self._transport is not None:
            # Deterministic test seam after the same exact route/key recheck.
            return build_discovery_client(transport=self._transport)
        return build_discovery_client(app_route=route)

    async def _route_failure(
        self, claimed: ContentGeneration, dispatch_id: uuid.UUID, exc: Exception
    ) -> None:
        error = (
            exc
            if isinstance(exc, ProviderError)
            else ProviderError(
                str(exc),
                error_code="credentials_unavailable",
                retryable=False,
            )
        )
        await self.finalize_attempt(
            generation_id=claimed.id,
            dispatch_id=dispatch_id,
            owner=self.owner,
            outcome=AttemptOutcome(response=None, error=error),
        )

    async def _run_provider_call(self, claimed: ContentGeneration) -> None:
        dispatch_id = await self._start_dispatch(claimed.id)
        if dispatch_id is None:
            return
        # Rebuild the exact frozen messages from the immutable inputs (the
        # snapshot was truncated for provenance; the digest pins the content).
        context = ContentContext.from_snapshot(claimed.context_snapshot or {})
        messages, _digest, _snapshot = build_messages(
            user_instruction=claimed.user_instruction,
            context=context,
            skill_id=claimed.skill_id,
        )
        request = DiscoveryRequest(
            messages=tuple(messages),
            model=claimed.requested_model or content_settings.resolved_model,
            timeout_seconds=content_settings.request_timeout_seconds,
            max_output_tokens=content_settings.max_output_tokens,
        )

        # Resolve the exact workspace customer route at dispatch. Missing,
        # replaced, revoked, or unprobed routes refuse; never use env keys.
        try:
            client = await self._route_client(claimed)
        except (
            AppModelRouteUnavailableError,
            CapabilityNotGrantedError,
            ProviderError,
        ) as exc:
            await self._route_failure(claimed, dispatch_id, exc)
            return

        heartbeat = asyncio.create_task(self._heartbeat_loop(claimed.id))
        try:
            response = await client.generate(request)
            outcome = AttemptOutcome(response=response, error=None)
        except ProviderError as exc:
            outcome = AttemptOutcome(response=None, error=exc)
        finally:
            heartbeat.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await heartbeat

        # Empty output on an otherwise-successful call is a parse-class
        # failure (retryable per budget), never a success. Nothing else about
        # the text is validated — the model is asked to ground its content,
        # not to satisfy a machine-checked citation contract.
        ok_response = outcome.response
        if ok_response is not None and not (ok_response.output_text or "").strip():
            outcome = AttemptOutcome(
                response=None,
                error=ProviderError(
                    "provider returned an empty output",
                    error_code=ERROR_PARSE,
                    retryable=True,
                ),
                observed_usage=dict(ok_response.usage),
            )
        await self.finalize_attempt(
            generation_id=claimed.id,
            dispatch_id=dispatch_id,
            owner=self.owner,
            outcome=outcome,
        )

    async def _heartbeat_loop(
        self, generation_id: uuid.UUID
    ) -> None:  # pragma: no cover - timing loop
        interval = max(1.0, content_settings.heartbeat_interval_seconds)
        while True:
            await asyncio.sleep(interval)
            try:
                await self._queue.heartbeat(task_id=generation_id, owner=self.owner)
            except asyncio.CancelledError:
                raise
            except Exception:
                # A dead heartbeat loop silently expires the lease and lets the
                # sweeper hand the generation to another worker mid-call; keep
                # beating through transient failures instead.
                logger.exception(
                    "heartbeat failed; retrying",
                    extra={"generation_id": str(generation_id)},
                )

    # --- Atomic attempt + terminal accounting -----------------------------

    async def _start_dispatch(self, generation_id: uuid.UUID) -> uuid.UUID | None:
        """Persist the immutable dispatch receipt before provider I/O."""
        async with self._session_factory() as session:
            row = await session.get(
                ContentGeneration, generation_id, with_for_update=True
            )
            if (
                row is None
                or row.lease_owner != self.owner
                or row.status in TASK_TERMINAL_STATUSES
                or row.funding_source not in {"customer_byok", "platform"}
            ):
                await session.commit()
                return None
            attempt_number = row.attempt_count + 1
            attempt = ContentGenerationAttempt(
                content_generation_id=row.id,
                attempt_number=attempt_number,
                status=ATTEMPT_STATUS_DISPATCHED,
                funding_source=row.funding_source,
                route_id=row.route_id,
                connection_id=row.connection_id,
                route_revision=row.route_revision,
                credential_revision=row.credential_revision,
                reservation_id=row.reservation_id,
                hold_units=row.customer_charge_cap or 0,
                policy_revision=row.policy_revision,
                customer_charge_cap=row.customer_charge_cap,
                requested_model=row.requested_model,
                usage_completeness=USAGE_UNKNOWN,
                settlement_status="not_applicable",
                dispatched_at=_utcnow(),
            )
            row.attempt_count = attempt_number
            session.add(attempt)
            await session.commit()
            return attempt.id

    async def _fail_without_attempt(
        self, *, generation_id: uuid.UUID, error: ProviderError
    ) -> None:
        """Terminal failure with NO attempt accounting (no HTTP call ran).

        Same lock + owner/status re-checks as ``finalize_attempt``, but no
        ``ContentGenerationAttempt`` row and no ``attempt_count`` increment:
        once the misconfiguration is fixed, a regenerate starts with the full
        retry budget.
        """
        async with self._session_factory() as session:
            row = await session.get(
                ContentGeneration, generation_id, with_for_update=True
            )
            if (
                row is None
                or row.lease_owner != self.owner
                or row.status in TASK_TERMINAL_STATUSES
            ):
                await session.commit()
                return
            row.status = TASK_STATUS_FAILED
            row.completed_at = _utcnow()
            row.error_code = error.error_code
            row.error_detail = str(error)[:2000]
            row.lease_owner = None
            row.lease_expires_at = None
            await session.commit()

    async def finalize_attempt(
        self,
        *,
        generation_id: uuid.UUID,
        owner: str,
        outcome: AttemptOutcome,
        dispatch_id: uuid.UUID | None = None,
    ) -> bool:
        """ONE locked transaction per actual HTTP call (the only writer).

        Locks the row ``FOR UPDATE``, re-checks owner + status (a lost lease
        or an already-terminal row writes nothing; a ``cancelled`` row still
        records the attempt for auditability but discards the output), then
        appends the attempt, increments ``attempt_count`` exactly once, and
        writes the matching retry/terminal fields — all committed together.
        """
        now = _utcnow()
        async with self._session_factory() as session:
            row = await session.get(
                ContentGeneration, generation_id, with_for_update=True
            )
            if row is None:
                await session.commit()
                return False

            cancelled = row.status == TASK_STATUS_CANCELLED
            if row.lease_owner != owner and not cancelled:
                # Lease lost (sweeper reclaimed it): another worker owns the
                # row now; writing anything would violate single-writer.
                await session.commit()
                return False
            if row.status in TASK_TERMINAL_STATUSES and not cancelled:
                await session.commit()
                return False

            attempt = (
                await session.get(
                    ContentGenerationAttempt, dispatch_id, with_for_update=True
                )
                if dispatch_id is not None
                else None
            )
            if attempt is None:
                attempt_number = row.attempt_count + 1
                row.attempt_count = attempt_number
                attempt = ContentGenerationAttempt(
                    content_generation_id=row.id,
                    attempt_number=attempt_number,
                    status=ATTEMPT_STATUS_DISPATCHED,
                    funding_source=row.funding_source,
                    route_id=row.route_id,
                    connection_id=row.connection_id,
                    route_revision=row.route_revision,
                    credential_revision=row.credential_revision,
                    requested_model=row.requested_model,
                )
                session.add(attempt)
            else:
                attempt_number = attempt.attempt_number
            _apply_attempt_outcome(attempt, outcome, now=now)
            await _settle_platform_attempt(
                session, row=row, attempt=attempt, outcome=outcome, now=now
            )

            if cancelled:
                # Record the real provider outcome above, but the row stays
                # cancelled and no result fields are written (invariant 3/9).
                await session.commit()
                return True

            if outcome.succeeded:
                assert outcome.response is not None  # noqa: S101 - narrows for the type checker; not a runtime check
                _apply_success(row, outcome.response, now)
            else:
                _apply_failure(
                    row,
                    error=outcome.error,
                    attempt_number=attempt_number,
                    now=now,
                )
            row.lease_owner = None
            row.lease_expires_at = None
            await session.commit()
            return True


def main() -> None:  # pragma: no cover - process entrypoint
    configure_logging()
    instrument_worker("content-worker")
    worker = ContentWorker()
    asyncio.run(worker.run_forever())


if __name__ == "__main__":  # pragma: no cover
    main()
