"""Shared errors for the workspace-scoped Opportunities owner."""


class OpportunityNotFoundError(Exception):
    """A workspace-scoped resource was missing or foreign (404)."""


class OpportunityValidationError(Exception):
    """An unknown filter, status, or request token was supplied (422)."""


class OpportunityOrderConflictError(Exception):
    """The project order changed after the caller read its version."""


class InvalidCursorError(Exception):
    """A cursor was tampered with or replayed across scopes (400)."""
