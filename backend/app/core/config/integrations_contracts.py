from __future__ import annotations

from typing import TYPE_CHECKING, Final

if TYPE_CHECKING:
    # Type-only: config never imports a model at runtime (circular import).
    pass

GRANT_STATUS_CONNECTED: Final = "connected"

GRANT_STATUS_NEEDS_REAUTH: Final = "needs_reauth"

GRANT_STATUS_PENDING_REVOCATION: Final = "pending_revocation"

GRANT_STATUS_REVOKED: Final = "revoked"

GRANT_STATUS_ERROR: Final = "error"

INTEGRATION_GRANT_STATUSES: Final[frozenset[str]] = frozenset(
    {
        GRANT_STATUS_CONNECTED,
        GRANT_STATUS_NEEDS_REAUTH,
        GRANT_STATUS_PENDING_REVOCATION,
        GRANT_STATUS_REVOKED,
        GRANT_STATUS_ERROR,
    }
)

MAPPING_STATUS_ACTIVE: Final = "active"

MAPPING_STATUS_DISABLED: Final = "disabled"

INTEGRATION_MAPPING_STATUSES: Final[frozenset[str]] = frozenset(
    {MAPPING_STATUS_ACTIVE, MAPPING_STATUS_DISABLED}
)

SYNC_KIND_SCHEDULED: Final = "scheduled"

SYNC_KIND_ON_DEMAND: Final = "on_demand"

SYNC_KIND_BACKFILL: Final = "backfill"

INTEGRATION_SYNC_KINDS: Final[frozenset[str]] = frozenset(
    {SYNC_KIND_SCHEDULED, SYNC_KIND_ON_DEMAND, SYNC_KIND_BACKFILL}
)

EVENT_INTEGRATION_CONNECTED: Final = "integration.connected"

EVENT_INTEGRATION_TESTED: Final = "integration.tested"

EVENT_INTEGRATION_SYNC_STARTED: Final = "integration.sync_started"

EVENT_INTEGRATION_SYNC_FINISHED: Final = "integration.sync_finished"

EVENT_INTEGRATION_REAUTH_REQUIRED: Final = "integration.reauth_required"

EVENT_INTEGRATION_REVOKED: Final = "integration.revoked"

EVENT_INTEGRATION_DISCONNECTED: Final = "integration.disconnected"

# --- Backfill progress states (the Settings connection card) ----------------
# The history import's rollup state. These stay DISTINCT (invariant 7): a
# connection that never enqueued a backfill is not one that imported zero
# windows, and a partially-failed import is not a complete one.
BACKFILL_STATE_NOT_STARTED: Final = "not_started"
BACKFILL_STATE_IMPORTING: Final = "importing"
BACKFILL_STATE_COMPLETE: Final = "complete"
BACKFILL_STATE_PARTIAL: Final = "partial"
BACKFILL_STATES: Final[frozenset[str]] = frozenset(
    {
        BACKFILL_STATE_NOT_STARTED,
        BACKFILL_STATE_IMPORTING,
        BACKFILL_STATE_COMPLETE,
        BACKFILL_STATE_PARTIAL,
    }
)

EVENT_INTEGRATION_REVOKE_FAILED: Final = "integration.revoke_failed"

ERROR_UNMAPPED_PROPERTY: Final = "unmapped_property"

ERROR_TOKEN_REFRESH_FAILED: Final = "token_refresh_failed"

ERROR_PROVIDER_API: Final = "provider_api_error"

ERROR_RATE_LIMITED: Final = "rate_limited"

ERROR_UNAPPROVED_ENDPOINT: Final = "unapproved_endpoint"

ERROR_GRANT_AUTH_FAILED: Final = "grant_auth_failed"

ERROR_OAUTH_STATE_INVALID: Final = "oauth_state_invalid"

ERROR_OAUTH_EXCHANGE_FAILED: Final = "oauth_exchange_failed"

ERROR_OAUTH_NOT_CONFIGURED: Final = "oauth_not_configured"

ERROR_SYNC_WINDOW_INVALID: Final = "sync_window_invalid"

ERROR_SYNC_ACTIVE_WINDOW_CONFLICT: Final = "sync_active_window_conflict"

ERROR_PAYLOAD_TOO_LARGE: Final = "payload_too_large"

ERROR_MAPPING_PROVIDER_MISMATCH: Final = "mapping_provider_mismatch"

ERROR_MAPPING_PROPERTY_NOT_OWNED: Final = "mapping_property_not_owned"

ERROR_MAPPING_ACTIVE_OWNER_CONFLICT: Final = "mapping_active_owner_conflict"

ERROR_PROPERTY_DISCOVERY_UNSUPPORTED: Final = "property_discovery_unsupported"

ERROR_GA4_DIMENSION_INCOMPATIBLE: Final = "ga4_dimension_incompatible"

INTEGRATION_IMPORTER_VERSION: Final = "integrations-importer-1"


# --- Post-connect readiness ladder (Slice 4.1) -------------------------------
# The stages a project passes through after its first connect, in order. The
# surface renders WHERE a project is rather than one long spinner, so a user
# who has just connected sees their own numbers as soon as they exist instead
# of an empty dashboard that looks broken.
#
# Every input is already persisted — grant status, backfill runs, snapshot
# presence, demand snapshot presence, opportunity count — so the ladder is a
# pure projection over them (invariant 7), never a new table and never a
# recomputation.
#
# The stages are DISTINCT states, not a progress percentage: "no connection"
# is not "importing with nothing yet", and core data present with analysis
# still running is not the same as analysis that ran and found nothing
# (invariant 7 — unknown, unavailable and zero stay apart).
READINESS_NOT_CONNECTED: Final = "not_connected"
READINESS_CONNECTED: Final = "connected"
READINESS_IMPORTING: Final = "importing"
READINESS_CORE_DATA_READY: Final = "core_data_ready"
READINESS_ANALYSIS_READY: Final = "analysis_ready"

# OFF the ladder, not a rung on it: every backfill window reached a terminal
# status and none succeeded, so no further data is coming. It is reported
# separately because "importing" here would spin forever over an import that
# already failed — the user needs a retry, not patience (invariant 7: a
# failure and a pending state are not the same unknown).
READINESS_IMPORT_FAILED: Final = "import_failed"

# In ladder order; the projection returns the HIGHEST stage a project has
# reached, and the surface may render the ones below it as completed.
INTEGRATION_READINESS_STAGES: Final[tuple[str, ...]] = (
    READINESS_NOT_CONNECTED,
    READINESS_CONNECTED,
    READINESS_IMPORTING,
    READINESS_CORE_DATA_READY,
    READINESS_ANALYSIS_READY,
)

# Every value ``stage`` can carry: the ladder plus the off-ladder failure.
INTEGRATION_READINESS_STATES: Final[frozenset[str]] = frozenset(
    set(INTEGRATION_READINESS_STAGES) | {READINESS_IMPORT_FAILED}
)
