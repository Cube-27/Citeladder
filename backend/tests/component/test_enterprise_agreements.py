"""Signed references require operator and tenant authority and preserve history."""

import asyncio
from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.domain.auth.enterprise_agreements import (
    AgreementReferenceInput,
    record_agreement_reference,
)
from app.models.policy_acceptance import EnterpriseAgreementReference, PolicyAcceptance
from app.models.security_event import SecurityEvent
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember


@pytest.mark.asyncio
async def test_signed_reference_authority_replay_conflict_and_rollback(
    db_session, session_factory
):
    operator = User(email="contracts-operator@example.com", role="admin")
    signer = User(email="contracts-signer@example.com")
    workspace = Workspace(name="Contracts")
    foreign = Workspace(name="Other tenant")
    db_session.add_all([operator, signer, workspace, foreign])
    await db_session.flush()
    db_session.add(
        WorkspaceMember(workspace_id=workspace.id, user_id=signer.id, role="owner")
    )
    await db_session.commit()
    operator_id, signer_id, workspace_id, foreign_id = (
        operator.id,
        signer.id,
        workspace.id,
        foreign.id,
    )
    payload = AgreementReferenceInput(
        workspace_id=workspace_id,
        signatory_id=signer_id,
        reference="MSA-2026-1",
        document_sha256="a" * 64,
        signed_at=datetime(2026, 1, 1, tzinfo=UTC),
        authority_verified=True,
    )
    with pytest.raises(PermissionError, match="platform administrator"):
        await record_agreement_reference(
            db_session, actor_id=signer_id, payload=payload
        )
    await db_session.rollback()
    with pytest.raises(PermissionError, match="target workspace"):
        await record_agreement_reference(
            db_session,
            actor_id=operator_id,
            payload=payload.model_copy(update={"workspace_id": foreign_id}),
        )
    await db_session.rollback()
    await record_agreement_reference(db_session, actor_id=operator_id, payload=payload)
    await db_session.rollback()
    assert await db_session.scalar(select(EnterpriseAgreementReference.id)) is None
    assert await db_session.scalar(select(SecurityEvent.id)) is None

    row = await record_agreement_reference(
        db_session, actor_id=operator_id, payload=payload
    )
    record_id = row.id
    await db_session.commit()
    replay = await record_agreement_reference(
        db_session, actor_id=operator_id, payload=payload
    )
    assert replay.id == record_id
    await db_session.commit()
    with pytest.raises(ValueError, match="different signed evidence"):
        await record_agreement_reference(
            db_session,
            actor_id=operator_id,
            payload=payload.model_copy(update={"document_sha256": "b" * 64}),
        )
    await db_session.rollback()
    assert list(await db_session.scalars(select(SecurityEvent.target_id))) == [
        record_id
    ]
    assert await db_session.scalar(select(PolicyAcceptance.id)) is None
    await db_session.rollback()

    async def concurrent_record():
        async with session_factory() as session:
            reference = await record_agreement_reference(
                session,
                actor_id=operator_id,
                payload=payload.model_copy(update={"reference": "MSA-concurrent"}),
            )
            await session.commit()
            return reference.id

    left, right = await asyncio.gather(concurrent_record(), concurrent_record())
    assert left == right
    assert list(
        await db_session.scalars(
            select(SecurityEvent.target_id).where(
                SecurityEvent.target_id == left,
            )
        )
    ) == [left]
