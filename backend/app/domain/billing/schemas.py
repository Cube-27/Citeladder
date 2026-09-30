"""Retained provider-connection DTOs until PR 17."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

ProviderConnectionState = Literal["connected", "missing", "failed", "unavailable"]


class _StrictResponse(BaseModel):
    """Base for every response DTO: unspecified fields are forbidden."""

    model_config = ConfigDict(extra="forbid")


class ProviderProbeResponse(_StrictResponse):
    """Null on the parent for never-probed/missing/unavailable providers."""

    status: Literal["ok", "failed"]
    safe_reason: str | None
    tested_at: datetime
    model: str | None
    latency_ms: int | None


class ProviderConnectionStateResponse(_StrictResponse):
    """For Copilot, ``grant_key='provider.copilot'`` is descriptive catalog
    identity only; the registry's ``issuable=False`` remains authoritative.
    """

    key: str
    label: str
    state: ProviderConnectionState
    safe_reason: str | None
    grant_key: str
    latest_probe: ProviderProbeResponse | None


class ProviderConnectionStatesResponse(_StrictResponse):
    workspace_id: uuid.UUID
    providers: list[ProviderConnectionStateResponse]
