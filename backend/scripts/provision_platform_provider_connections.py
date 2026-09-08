"""Provision non-secret platform provider route metadata.

Platform secrets remain in the deployment secret manager. This command stores
only opaque credential references and approved route identities. It accepts no
raw credentials or env files and never calls a provider.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import uuid
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Final

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.provider_catalog import (
    ACTIVE_TRANSPORTS,
    CREDENTIAL_SOURCE_PLATFORM,
    SYSTEM_WORKSPACE_NAME,
    engines_for_transport,
    measurement_route,
)
from app.core.database import SessionLocal, dispose_engine
from app.models.provider import ProviderConnection, ProviderRoute
from app.models.workspace import Workspace

_STATUS_CREATED: Final = "created"
_STATUS_UPDATED: Final = "updated"


class PlatformProvisioningError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class PlatformConnectionReport:
    transport_provider: str
    connection_id: uuid.UUID | None
    status: str


async def _system_workspace(session: AsyncSession) -> Workspace:
    workspace = await session.scalar(
        select(Workspace).where(Workspace.is_system.is_(True))
    )
    if workspace is None:
        workspace = Workspace(name=SYSTEM_WORKSPACE_NAME, is_system=True)
        session.add(workspace)
        await session.flush()
    return workspace


async def provision_platform_connections(
    session: AsyncSession,
    *,
    credential_references: Mapping[str, str],
    dry_run: bool = False,
) -> tuple[PlatformConnectionReport, ...]:
    unknown = sorted(set(credential_references) - ACTIVE_TRANSPORTS)
    if unknown:
        raise PlatformProvisioningError("unknown transport(s): " + ", ".join(unknown))
    workspace = await _system_workspace(session)
    reports: list[PlatformConnectionReport] = []
    for transport in sorted(credential_references):
        reference = credential_references[transport].strip()
        if not reference or any(
            token in reference.lower() for token in ("sk-", "secret", "password")
        ):
            raise PlatformProvisioningError(
                "credential reference must be a non-secret opaque name"
            )
        connection = await session.scalar(
            select(ProviderConnection).where(
                ProviderConnection.workspace_id == workspace.id,
                ProviderConnection.credential_source == CREDENTIAL_SOURCE_PLATFORM,
                ProviderConnection.transport_provider == transport,
            )
        )
        status = _STATUS_UPDATED
        if connection is None:
            connection = ProviderConnection(
                workspace_id=workspace.id,
                label=f"platform {transport} metadata",
                transport_provider=transport,
                credential_source=CREDENTIAL_SOURCE_PLATFORM,
                api_key_encrypted="",
                platform_credential_ref=reference,
                active=True,
                last_test_status="",
            )
            session.add(connection)
            await session.flush()
            status = _STATUS_CREATED
        else:
            connection.api_key_encrypted = ""
            connection.platform_credential_ref = reference
            connection.active = True
        for engine in engines_for_transport(transport):
            route = await session.scalar(
                select(ProviderRoute).where(
                    ProviderRoute.connection_id == connection.id,
                    ProviderRoute.logical_engine == engine,
                )
            )
            approved = measurement_route(engine)
            if route is None:
                session.add(
                    ProviderRoute(
                        workspace_id=workspace.id,
                        connection_id=connection.id,
                        logical_engine=engine,
                        transport_provider=transport,
                        transport_model=approved.transport_model,
                        is_default=True,
                    )
                )
            else:
                route.transport_model = approved.transport_model
                route.active = True
                route.is_default = True
        reports.append(
            PlatformConnectionReport(
                transport_provider=transport, connection_id=connection.id, status=status
            )
        )
    await session.flush()
    if dry_run:
        await session.rollback()
    else:
        await session.commit()
    return tuple(reports)


async def _run(
    references: Mapping[str, str], *, dry_run: bool
) -> tuple[PlatformConnectionReport, ...]:
    async with SessionLocal() as session:
        return await provision_platform_connections(
            session, credential_references=references, dry_run=dry_run
        )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--credential-ref",
        action="append",
        default=[],
        metavar="TRANSPORT=REFERENCE",
        help="Non-secret secret-manager reference; repeat per transport",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    references: dict[str, str] = {}
    for item in args.credential_ref:
        transport, separator, reference = item.partition("=")
        if not separator:
            parser.error("--credential-ref requires TRANSPORT=REFERENCE")
        references[transport] = reference
    if not references:
        parser.error("at least one --credential-ref is required")
    try:
        reports = asyncio.run(_run(references, dry_run=args.dry_run))
    except PlatformProvisioningError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    finally:
        asyncio.run(dispose_engine())
    for report in reports:
        print(f"{report.transport_provider}\t{report.connection_id}\t{report.status}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
