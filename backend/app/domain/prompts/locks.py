# Project advisory-lock bridge for Python source-page admission. TypeScript
# owns prompt writes and uses the same key derivation. Retire this bridge when
# source-page admission moves; locks release automatically at commit/rollback.
from __future__ import annotations

import hashlib
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.prompts import (
    PROJECT_LOCK_NAMESPACE,
    PROMPT_LOCK_PERSON,
)


def _advisory_lock_key(namespace: int, entity_id: uuid.UUID) -> int:
    """Derive the stable signed 64-bit key used by every lock participant."""
    digest = hashlib.blake2b(
        namespace.to_bytes(4, "big") + entity_id.bytes,
        digest_size=8,
        person=PROMPT_LOCK_PERSON.encode(),
    ).digest()
    return int.from_bytes(digest, "big", signed=True)


def _is_postgres(session: AsyncSession) -> bool:
    return session.bind is not None and session.bind.dialect.name == "postgresql"


async def _advisory_xact_lock(
    session: AsyncSession, namespace: int, entity_id: uuid.UUID
) -> None:
    if not _is_postgres(session):
        return
    key = _advisory_lock_key(namespace, entity_id)
    await session.execute(
        text("SELECT pg_advisory_xact_lock(:key)").bindparams(key=key)
    )


async def acquire_project_lock(session: AsyncSession, project_id: uuid.UUID) -> None:
    """Serialize source-page admission with other project writers."""
    await _advisory_xact_lock(session, PROJECT_LOCK_NAMESPACE, project_id)
