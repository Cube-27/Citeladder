"""Read sync targets for the integrations-owned sync endpoint."""

from __future__ import annotations

import uuid

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.integrations_contracts import (
    GRANT_STATUS_CONNECTED,
    MAPPING_STATUS_ACTIVE,
)
from app.core.config.traffic import TRAFFIC_SYNC_PROVIDERS
from app.models.integrations import (
    IntegrationConnection,
    IntegrationOAuthGrant,
    IntegrationPropertyMapping,
)


async def list_traffic_sync_targets(
    session: AsyncSession, *, workspace_id: uuid.UUID, project_id: uuid.UUID
) -> list[IntegrationPropertyMapping]:
    """The ACTIVE sync targets of the project — one per mapped PROPERTY.

    The "Sync now" fan-out set: every ACTIVE ``IntegrationPropertyMapping``
    of the project whose connection is a ``TRAFFIC_SYNC_PROVIDERS`` one on a
    CONNECTED grant. One entry per PROPERTY, not per connection: a
    connection with two mapped properties holds two independent imports, and
    collapsing them to one run left whichever property the connection last
    pointed at as the only one that ever synced. Bing is in that set so a
    connected Bing property keeps importing; whether a provider's rows feed
    the Performance tables is a projection question, not a collection one.
    Read-only; the enqueue per target is owned by
    ``domain/integrations/sync.py`` (invariant 2).
    """
    stmt = (
        select(IntegrationPropertyMapping)
        .join(
            IntegrationConnection,
            and_(
                IntegrationConnection.workspace_id
                == IntegrationPropertyMapping.workspace_id,
                IntegrationConnection.id == IntegrationPropertyMapping.connection_id,
            ),
        )
        .join(
            IntegrationOAuthGrant,
            and_(
                IntegrationOAuthGrant.workspace_id
                == IntegrationConnection.workspace_id,
                IntegrationOAuthGrant.id == IntegrationConnection.grant_id,
            ),
        )
        .where(IntegrationConnection.workspace_id == workspace_id)
        .where(IntegrationPropertyMapping.project_id == project_id)
        .where(IntegrationPropertyMapping.status == MAPPING_STATUS_ACTIVE)
        .where(IntegrationConnection.provider.in_(sorted(TRAFFIC_SYNC_PROVIDERS)))
        .where(IntegrationOAuthGrant.status == GRANT_STATUS_CONNECTED)
        .order_by(
            IntegrationPropertyMapping.created_at.asc(),
            IntegrationPropertyMapping.id.asc(),
        )
    )
    return list((await session.scalars(stmt)).all())
