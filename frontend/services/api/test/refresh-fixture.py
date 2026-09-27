"""Python producers/readers exercised by the TypeScript refresh's PostgreSQL test."""

import asyncio
import json
import sys
import uuid

from app.core.database import SessionLocal, engine
from app.domain.opportunities import action_status, actions, queries
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


async def attach(workspace, project, user):
    async with SessionLocal() as session:
        action = await actions.attach_or_create_action(
            session,
            workspace_id=uuid.UUID(workspace),
            project_id=uuid.UUID(project),
            target_kind="page",
            target="https://ACME.test/b",
            user_id=uuid.UUID(user),
        )
        await session.commit()
        return {"id": str(action.id), "origin": action.origin}


async def dismiss(workspace, action, user):
    async with SessionLocal() as session:
        await action_status.update_status(
            session,
            workspace_id=uuid.UUID(workspace),
            action_id=uuid.UUID(action),
            status="dismissed",
            changed_by_user_id=uuid.UUID(user),
        )
        await session.commit()
        return {}


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


async def read(workspace, project):
    """What the retained Python readers see of the TypeScript refresh."""
    scope = {"workspace_id": uuid.UUID(workspace), "project_id": uuid.UUID(project)}
    async with SessionLocal() as session:
        page = await queries.list_opportunities(session, **scope)
        listed, _ = await actions.list_actions(session, **scope)
        return {
            "opportunities": [
                {
                    "rule_id": item["rule_id"],
                    "priority_score": item["priority_score"],
                    "action_id": str(item["action_id"]),
                }
                for item in page["items"]
            ],
            "actions": sorted(str(row.id) for row, _status in listed),
        }


PHASES = {
    "seed": seed,
    "attach": attach,
    "dismiss": dismiss,
    "cite": cite,
    "read": read,
}


async def main():
    result = await PHASES[sys.argv[1]](*sys.argv[2:])
    print(json.dumps(result))
    await engine.dispose()


asyncio.run(main())
