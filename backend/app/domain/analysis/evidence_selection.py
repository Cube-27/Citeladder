"""Opaque, scope-bound keyset cursors for the evidence reader."""

from __future__ import annotations

import base64
import json
import uuid
from datetime import datetime
from hashlib import sha256

from sqlalchemy import and_, or_

from app.domain.analysis.errors import TrendQueryError
from app.models.analysis import ResponseAnalysis


def scope_digest(values: dict) -> str:
    return sha256(json.dumps(values, sort_keys=True, default=str).encode()).hexdigest()


def encode_cursor(created_at: datetime, identity: uuid.UUID, scope: str) -> str:
    return base64.urlsafe_b64encode(
        json.dumps(
            [
                created_at.isoformat(),
                str(identity),
                scope,
            ]
        ).encode()
    ).decode()


def apply_cursor(statement, cursor: str | None, scope: str):
    if not cursor:
        return statement
    try:
        timestamp, identity, stored_scope = json.loads(base64.urlsafe_b64decode(cursor))
        if not all(
            isinstance(value, str) for value in (timestamp, identity, stored_scope)
        ):
            raise ValueError("Invalid cursor fields")
        at = datetime.fromisoformat(timestamp)
        identity = uuid.UUID(identity)
        if stored_scope != scope or at.tzinfo is None:
            raise ValueError("Cursor scope changed")
    except (ValueError, TypeError, KeyError) as exc:
        raise TrendQueryError("Invalid evidence cursor for this selection") from exc
    return statement.where(
        or_(
            ResponseAnalysis.created_at < at,
            and_(ResponseAnalysis.created_at == at, ResponseAnalysis.id < identity),
        )
    )
