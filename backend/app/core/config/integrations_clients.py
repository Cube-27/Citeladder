from __future__ import annotations

from typing import TYPE_CHECKING, Final

from app.core.config.integrations_settings import integration_settings
from app.core.config.task_queue import ERROR_MAX_ATTEMPTS, PostgresQueueSpec


def _integration_sync_run_model() -> type[IntegrationSyncRun]:
    # Imported lazily so this config module never imports a model at import
    # time (would create a config <-> models circular import).
    from app.models.integrations import IntegrationSyncRun

    return IntegrationSyncRun


def _integration_claim_order(model: type[IntegrationSyncRun]) -> tuple:
    # Deterministic claim order mirroring ``CONTENT_QUEUE_SPEC`` exactly:
    # priority, then FIFO by availability, then the randomized position.
    return (
        model.priority.desc(),
        model.available_at.asc(),
        model.randomized_position.asc(),
    )


INTEGRATION_QUEUE_SPEC: Final[PostgresQueueSpec[IntegrationSyncRun]] = (
    PostgresQueueSpec(
        model_ref=_integration_sync_run_model,
        lease_ttl=lambda: integration_settings.lease_ttl_seconds,
        claim_order=_integration_claim_order,
        max_attempts_error=ERROR_MAX_ATTEMPTS,
    )
)


if TYPE_CHECKING:
    # Type-only: config never imports a model at runtime (circular import).
    from app.models.integrations import IntegrationSyncRun
