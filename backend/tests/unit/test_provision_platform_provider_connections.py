"""Platform provisioning persists only non-secret route metadata."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config.provider_catalog import (
    CREDENTIAL_SOURCE_PLATFORM,
    ENGINE_CLAUDE,
    ENGINE_GEMINI,
    MEASUREMENT_ROUTES,
    TRANSPORT_ANTHROPIC,
    TRANSPORT_GOOGLE,
    TRANSPORT_OPENAI,
)
from app.models.provider import ProviderConnection, ProviderRoute
from app.models.workspace import Workspace
from scripts.provision_platform_provider_connections import (
    PlatformConnectionReport,
    PlatformProvisioningError,
    provision_platform_connections,
)

_OPENAI_REF = "vault://citeladder/platform/openai"
_ANTHROPIC_REF = "vault://citeladder/platform/anthropic"
_GOOGLE_REF = "vault://citeladder/platform/google"
_ROTATED_OPENAI_REF = "vault://citeladder/platform/openai-v2"


def _references(openai: str = _OPENAI_REF) -> dict[str, str]:
    return {
        TRANSPORT_OPENAI: openai,
        TRANSPORT_ANTHROPIC: _ANTHROPIC_REF,
        TRANSPORT_GOOGLE: _GOOGLE_REF,
    }


async def _platform_connections(
    session: AsyncSession,
) -> list[ProviderConnection]:
    result = await session.execute(
        select(ProviderConnection).where(
            ProviderConnection.credential_source == CREDENTIAL_SOURCE_PLATFORM
        )
    )
    return list(result.scalars())


async def test_provision_creates_system_workspace_connections_and_routes(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        reports = await provision_platform_connections(
            session, credential_references=_references()
        )
        assert {report.transport_provider for report in reports} == {
            TRANSPORT_OPENAI,
            TRANSPORT_ANTHROPIC,
            TRANSPORT_GOOGLE,
        }
        assert all(report.status == "created" for report in reports)
        system = await session.scalar(
            select(Workspace).where(Workspace.is_system.is_(True))
        )
        assert system is not None
        connections = await _platform_connections(session)
        assert len(connections) == 3
        assert all(connection.workspace_id == system.id for connection in connections)
        assert {
            connection.platform_credential_ref for connection in connections
        } == set(_references().values())
        assert all(connection.api_key_encrypted == "" for connection in connections)

        routes = (await session.execute(select(ProviderRoute))).scalars().all()
        for engine, approved in MEASUREMENT_ROUTES.items():
            route = next(item for item in routes if item.logical_engine == engine)
            assert route.transport_provider == approved.transport_provider
            assert route.transport_model == approved.transport_model
            assert route.is_default is True
            assert route.workspace_id == system.id


async def test_provision_is_idempotent(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        first = await provision_platform_connections(
            session, credential_references=_references()
        )
    async with session_factory() as session:
        second = await provision_platform_connections(
            session, credential_references=_references()
        )
        assert [report.connection_id for report in second] == [
            report.connection_id for report in first
        ]
        assert all(report.status == "updated" for report in second)
        systems = await session.scalar(
            select(func.count()).select_from(Workspace).where(Workspace.is_system)
        )
        assert systems == 1
        assert len(await _platform_connections(session)) == 3


async def test_reference_rotation_updates_metadata_without_storing_a_key(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        first = await provision_platform_connections(
            session, credential_references=_references()
        )
        connection_id = next(
            report.connection_id
            for report in first
            if report.transport_provider == TRANSPORT_OPENAI
        )
    async with session_factory() as session:
        reports = await provision_platform_connections(
            session,
            credential_references=_references(openai=_ROTATED_OPENAI_REF),
        )
        report = next(
            item for item in reports if item.transport_provider == TRANSPORT_OPENAI
        )
        assert report.connection_id == connection_id
        assert report.status == "updated"
        connection = await session.get(ProviderConnection, connection_id)
        assert connection is not None
        assert connection.platform_credential_ref == _ROTATED_OPENAI_REF
        assert connection.api_key_encrypted == ""


@pytest.mark.parametrize(
    "reference",
    ("", "sk-live-value", "production-secret", "password-value"),
)
async def test_secret_shaped_or_empty_reference_is_rejected_without_writes(
    session_factory: async_sessionmaker[AsyncSession],
    reference: str,
) -> None:
    async with session_factory() as session:
        with pytest.raises(PlatformProvisioningError):
            await provision_platform_connections(
                session,
                credential_references={TRANSPORT_OPENAI: reference},
            )
        await session.rollback()
    async with session_factory() as session:
        assert await _platform_connections(session) == []
        assert await session.scalar(select(func.count()).select_from(Workspace)) == 0


async def test_dry_run_writes_nothing(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        reports = await provision_platform_connections(
            session,
            credential_references=_references(),
            dry_run=True,
        )
        assert all(report.status == "created" for report in reports)
    async with session_factory() as session:
        assert await _platform_connections(session) == []
        assert await session.scalar(select(func.count()).select_from(Workspace)) == 0
        assert (
            await session.scalar(select(func.count()).select_from(ProviderRoute)) == 0
        )


async def test_report_exposes_only_transport_id_and_status(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        reports = await provision_platform_connections(
            session, credential_references=_references()
        )
    for report in reports:
        assert isinstance(report, PlatformConnectionReport)
        assert isinstance(report.connection_id, uuid.UUID)
        assert report.status in {"created", "updated"}
        rendered = str(report)
        assert "vault://" not in rendered
        assert "api_key" not in rendered


async def test_unknown_transport_is_rejected(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        with pytest.raises(PlatformProvisioningError, match="unknown transport"):
            await provision_platform_connections(
                session,
                credential_references={**_references(), "mistral": "vault://mistral"},
            )
        await session.rollback()


async def test_single_transport_provisions_independently(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    async with session_factory() as session:
        reports = await provision_platform_connections(
            session,
            credential_references={TRANSPORT_ANTHROPIC: _ANTHROPIC_REF},
        )
        assert len(reports) == 1
        connection = await session.get(ProviderConnection, reports[0].connection_id)
        assert connection is not None
        assert connection.platform_credential_ref == _ANTHROPIC_REF
        assert connection.api_key_encrypted == ""
        routes = (await session.execute(select(ProviderRoute))).scalars().all()
        assert {route.logical_engine for route in routes} == {ENGINE_CLAUDE}
        assert ENGINE_GEMINI not in {route.logical_engine for route in routes}
