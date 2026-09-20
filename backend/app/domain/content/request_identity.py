"""Stable identity for one Content generation request."""

from __future__ import annotations

import hashlib
import json
import uuid

from app.core.config.content import CONTENT_DEFAULT_SKILL


def request_fingerprint(
    *,
    project_id: uuid.UUID,
    user_instruction: str,
    skill_id: str = CONTENT_DEFAULT_SKILL,
    target_site_url_id: uuid.UUID | None = None,
    target_url: str | None = None,
    opportunity_id: uuid.UUID | None = None,
    demand_signal_id: uuid.UUID | None = None,
    site_health_reference: dict | None = None,
    search_intelligence_reference: dict | None = None,
) -> str:
    """A repeated idempotency key must have the same instruction and evidence IDs."""
    canonical = "\x1f".join(
        [
            str(project_id),
            user_instruction.strip(),
            skill_id,
            _optional_uuid(target_site_url_id),
            (target_url or "").strip(),
            _optional_uuid(opportunity_id),
            _optional_uuid(demand_signal_id),
            json.dumps(
                site_health_reference or {}, sort_keys=True, separators=(",", ":")
            ),
            json.dumps(
                search_intelligence_reference or {},
                sort_keys=True,
                separators=(",", ":"),
            ),
        ]
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _optional_uuid(value: uuid.UUID | None) -> str:
    return "" if value is None else str(value)
