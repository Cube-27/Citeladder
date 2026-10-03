"""Persisted finish-reason vocabulary for the Python audit schema model.

Execution contracts and adapters are native; schema models retain this enum.
"""

from __future__ import annotations

from enum import StrEnum


class FinishReason(StrEnum):
    """Canonical, provider-neutral reason a generation stopped.

    Closed vocabulary: gates and persistence read ONLY these values. The raw
    provider token is preserved separately (``raw_finish_reason``) so no
    provider-specific spelling leaks into a decision. Modelled as a ``StrEnum``
    to match the other closed vocabularies in the codebase
    (e.g. ``config/entitlements.CapabilityType``).
    """

    STOP = "stop"
    LENGTH = "length"
    TOOL_ERROR = "tool_error"
    CONTENT_FILTER = "content_filter"
    CANCELLED = "cancelled"
    ERROR = "error"
    UNKNOWN = "unknown"
