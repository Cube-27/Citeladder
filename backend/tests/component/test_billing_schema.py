"""Catalog uniqueness stays a PostgreSQL schema decision after native authoring."""

from __future__ import annotations

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.billing import BillingCatalogRevision
from app.models.user import User


@pytest.mark.asyncio
async def test_database_allows_only_one_published_revision(
    db_session: AsyncSession,
) -> None:
    actor = User(email="catalog-schema@example.test", role="admin", is_active=True)
    db_session.add(actor)
    await db_session.flush()
    for suffix in ("a", "b"):
        db_session.add(
            BillingCatalogRevision(
                revision=f"schema-{suffix}",
                payload={},
                payload_sha256=suffix * 64,
                publication_state="published",
                created_by_user_id=actor.id,
                created_reason="schema fixture",
            )
        )
    with pytest.raises(IntegrityError):
        await db_session.flush()
