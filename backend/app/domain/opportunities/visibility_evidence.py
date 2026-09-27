"""The project's reviewed owned domains, in one deterministic order.

What remains of the Python visibility-evidence loader after the Opportunity
refresh moved to TypeScript (migration PR 7a): placement checks freeze this
list into their expectation, and the refresh reads the same order.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.brand import OwnedDomain

__all__ = ["owned_domain_list"]


async def owned_domain_list(
    session: AsyncSession, *, project_id: uuid.UUID
) -> list[str]:
    """The project's reviewed owned domains, in one deterministic order.

    The ORDER is the point: a placement check freezes this list into its
    expectation, so two callers ordering it differently would freeze two
    different-looking records of the same fact.
    """
    return list(
        (
            await session.scalars(
                select(OwnedDomain.domain)
                .where(OwnedDomain.project_id == project_id)
                .order_by(OwnedDomain.domain.asc())
            )
        ).all()
    )
