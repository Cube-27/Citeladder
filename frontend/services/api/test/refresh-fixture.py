"""ORM seed and retained development enqueue fixtures for the TS refresh tests."""

import asyncio
import json
import sys
import uuid

from app.core.database import SessionLocal, engine
from app.domain.opportunities.queue import enqueue_opportunity_refresh
from app.models.analysis import Citation, ResponseAnalysis
from tests.component.opportunity_helpers import _seed_scenario


async def seed():
    async with SessionLocal() as session:
        scn = await _seed_scenario(session)
        for _ in range(2):  # a repeated trigger is one task
            await enqueue_opportunity_refresh(
                session,
                workspace_id=scn.workspace_id,
                project_id=scn.project_id,
                trigger_kind="audit",
                trigger_id=scn.audit_id,
            )
        await session.commit()
        return {key: str(value) for key, value in scn.__dict__.items()}


async def cite(workspace, analysis):
    """Give the prompt-0 answer an owned citation, so its visibility hits vanish."""
    async with SessionLocal() as session:
        row = await session.get(ResponseAnalysis, uuid.UUID(analysis))
        session.add(
            Citation(
                workspace_id=uuid.UUID(workspace),
                audit_id=row.audit_id,
                analysis_id=row.id,
                artifact_id=row.artifact_id,
                analyzer_version="b6-analysis-1",
                ordinal=2,
                url="https://acme.com/crm",
                title="Acme CRM",
                domain="acme.com",
                classification="owned",
                is_owned=True,
            )
        )
        await session.commit()
        return {}


PHASES = {
    "seed": seed,
    "cite": cite,
}


async def main():
    result = await PHASES[sys.argv[1]](*sys.argv[2:])
    print(json.dumps(result))
    await engine.dispose()


asyncio.run(main())
