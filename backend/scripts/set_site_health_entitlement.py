#!/usr/bin/env python
# Operator / development command: grant a workspace's account a monitored-URL
# allowance via an audited operator override grant.
#
# Site Health behavior is a runtime projection of the account's resolved
# ``monitored_urls`` entitlement allowance; there is no commercial capability
# row to edit. This command issues an ``override`` grant bundle through the
# append-only write service (``app.domain.entitlements.grants``) and then
# re-projects the workspace runtime row, so behavior stays consistent with
# production grant flows. It emits a single audit-safe log line recording the
# change.
#
# NOTE: allowances SUM across concurrent grants. Granting a second allowance
# ADDS to the first; revoking an earlier grant is a separate audited
# operation (out of scope for this dev/operator convenience command).
#
# Usage (from ``backend/`` with ``DATABASE_URL`` pointing at the target DB):
#
#     uv run python -m scripts.set_site_health_entitlement \
#         <workspace_uuid> <monitored_urls>
#
# See ``docs/DEVELOPMENT.md`` for the local runbook.
from __future__ import annotations

import argparse
import asyncio
import logging
import sys
import uuid
from datetime import UTC, datetime

from sqlalchemy import select

from app.core.config.entitlements import KEY_MONITORED_URLS
from app.core.database import SessionLocal, dispose_engine
from app.domain.entitlements.grants import issue_override_bundle
from app.domain.entitlements.service import (
    refresh_site_health_runtime_for_account,
)
from app.domain.entitlements.types import GrantSpec
from app.models.billing import BillingAccount, WorkspaceBillingLink
from app.models.user import User

logger = logging.getLogger("scripts.set_site_health_entitlement")


async def _run(workspace_id: uuid.UUID, monitored_urls: int) -> None:
    async with SessionLocal() as session:
        link = await session.scalar(
            select(WorkspaceBillingLink).where(
                WorkspaceBillingLink.workspace_id == workspace_id
            )
        )
        if link is None:
            raise RuntimeError(
                f"workspace {workspace_id} has no billing account link"
            )
        owner = await session.scalar(
            select(User)
            .join(
                BillingAccount,
                BillingAccount.owner_user_id == User.id,
            )
            .where(BillingAccount.id == link.billing_account_id)
        )
        if owner is None:
            raise RuntimeError(
                f"workspace {workspace_id} has no resolvable account owner"
            )
        now = datetime.now(UTC)
        await issue_override_bundle(
            session,
            operator_user=owner,
            account_id=link.billing_account_id,
            grants=(GrantSpec(key=KEY_MONITORED_URLS, value=monitored_urls),),
            reason="operator monitored_urls grant (dev/operator command)",
            valid_from=now,
            valid_until=None,
            idempotency_key=f"operator:set-site-health:{workspace_id}:{now.isoformat()}",
        )
        row = await refresh_site_health_runtime_for_account(
            session, account_id=link.billing_account_id, at=now
        )
        await session.commit()
        # Audit-safe log line: identifies the workspace, granted allowance,
        # and resolved provenance — never any secret.
        logger.info(
            "site_health.runtime.granted workspace_id=%s monitored_urls=%s "
            "registry_revision=%s entitlement_lifecycle_version=%s",
            workspace_id,
            monitored_urls,
            row.registry_revision,
            row.entitlement_lifecycle_version,
        )
    await dispose_engine()


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
    )
    parser = argparse.ArgumentParser(
        description=(
            "Grant a monitored-URL allowance to a workspace's billing account "
            "by workspace UUID (audited operator override grant). "
            "Development/operator command."
        )
    )
    parser.add_argument("workspace_id", help="Target workspace UUID.")
    parser.add_argument(
        "monitored_urls",
        type=int,
        help="monitored_urls allowance to grant (0 keeps the sample policy).",
    )
    args = parser.parse_args(argv)

    try:
        workspace_id = uuid.UUID(str(args.workspace_id))
    except ValueError:
        parser.error(f"invalid workspace UUID: {args.workspace_id!r}")
    if args.monitored_urls < 0:
        parser.error("monitored_urls must be non-negative")

    asyncio.run(_run(workspace_id, args.monitored_urls))
    return 0


if __name__ == "__main__":
    sys.exit(main())
