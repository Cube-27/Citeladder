"""Persisted producer rows for the TypeScript Action route tests, no providers."""

import asyncio
import json
import sys
import uuid
from datetime import UTC, datetime, timedelta
from sqlalchemy import select

from app.core.database import SessionLocal, engine
from app.models.agent import AgentChat, AgentOutput, AgentOutputRevision
from app.models.opportunity import Opportunity, OpportunitySnapshot
from app.models.project import Project
from app.models.site_health.analysis import SitePageAnalysis
from app.models.site_health.acquisition import SiteFetchArtifact
from app.analysis.site_health.parser import extract_page_facts
from app.models.source_pages import SourcePage, SourcePageEntityPresence, SourcePageSnapshot
from tests.component.opportunity_helpers import _seed_scenario, seed_action_for, seed_live_set


async def seed():
    async with SessionLocal() as session:
        scn = await _seed_scenario(session)
        rows = await seed_live_set(session, scn)
        return {
            **{key: str(value) for key, value in scn.__dict__.items()},
            "actions": {key: str(row.action_id) for key, row in rows.items()},
            "members": {key: str(row.id) for key, row in rows.items()},
        }


async def revision(workspace, project, action, phase):
    async with SessionLocal() as session:
        scope = {"workspace_id": uuid.UUID(workspace), "project_id": uuid.UUID(project)}
        chat = AgentChat(**scope, action_id=uuid.UUID(action), title="Page edits")
        session.add(chat)
        await session.flush()
        output = AgentOutput(**scope, chat_id=chat.id, action_id=chat.action_id,
                             kind="page_edits", skill_id="gsc_optimize", phase=phase)
        session.add(output)
        await session.flush()
        row = AgentOutputRevision(**scope, output_id=output.id, number=1, author="run",
                                  phase=phase, title="Page edits", body="Rewrite the title.")
        session.add(row)
        await session.commit()
        return str(row.id)


async def earned(workspace, project):
    async with SessionLocal() as session:
        scope = {"workspace_id": uuid.UUID(workspace), "project_id": uuid.UUID(project)}
        url = "https://review.example/best-tools"
        page = SourcePage(**scope, canonical_url=url, url_hash="b" * 64,
                          registrable_domain="review.example", inspection_state="inspected")
        session.add(page)
        await session.flush()
        snapshot = SourcePageSnapshot(**scope, source_page_id=page.id, requested_url=url,
                                      final_url=url, outcome="inspected", extracted_chars=5000,
                                      fetched_at=datetime.now(UTC))
        session.add(snapshot)
        await session.flush()
        presence = SourcePageEntityPresence(**scope, source_page_id=page.id, snapshot_id=snapshot.id,
                                           entity_kind="brand", entity_name="Acme", presence="not_detected",
                                           match_method="none", match_count=0, roster_version="roster-fixed")
        session.add(presence)
        member = Opportunity(**scope, rule_id="earned_page_acquire_listing", opportunity_type="visibility",
                             severity="high", priority_score=30, title="Acquire listing", target_key="earned-page:" + "b" * 64,
                             target_url=url, evidence={"content_handoff": {
                                 "url_hash": "b" * 64, "snapshot_id": str(snapshot.id),
                                 "page_entities": [{"entity_kind": "brand", "entity_name": "Acme"}],
                                 "discrepancies": [], "deterioration": [],
                             }})
        session.add(member)
        await session.flush()
        action_id = await seed_action_for(session, member, target_kind="earned_page")
        return {"action_id": str(action_id), "page_id": str(page.id), "snapshot_id": str(snapshot.id)}


async def sibling(workspace):
    async with SessionLocal() as session:
        project = Project(workspace_id=uuid.UUID(workspace), name="Sibling", website_url="https://sibling.test/")
        session.add(project)
        await session.flush()
        scope = {"workspace_id": project.workspace_id, "project_id": project.id}
        session.add(OpportunitySnapshot(**scope))
        member = Opportunity(**scope, rule_id="high_impression_low_ctr", opportunity_type="traffic",
                             severity="high", priority_score=30, title="Improve CTR", target_key="query:sibling")
        session.add(member)
        await session.flush()
        action = await seed_action_for(session, member, target_kind="query")
        return {"project_id": str(project.id), "action_id": str(action)}


async def observe(workspace, project, page_id):
    async with SessionLocal() as session:
        scope = {"workspace_id": uuid.UUID(workspace), "project_id": uuid.UUID(project)}
        page = await session.get(SourcePage, uuid.UUID(page_id))
        moment = datetime.now(UTC) + timedelta(days=4)
        snapshot = SourcePageSnapshot(**scope, source_page_id=page.id, requested_url=page.canonical_url,
                                      final_url=page.canonical_url, outcome="inspected", extracted_chars=5000,
                                      fetched_at=moment)
        session.add(snapshot)
        await session.flush()
        session.add(SourcePageEntityPresence(**scope, source_page_id=page.id, snapshot_id=snapshot.id,
                                            entity_kind="brand", entity_name="Acme", presence="present",
                                            match_method="exact_alias", match_count=2, roster_version="roster-fixed"))
        await session.commit()
        return {"snapshot_id": str(snapshot.id), "observed_at": moment.isoformat()}


async def main():
    result = await {"seed": seed, "revision": revision, "earned": earned,
                    "sibling": sibling, "observe": observe, "content": content}[sys.argv[1]](*sys.argv[2:])
    print(json.dumps(result))
    await engine.dispose()


async def content():
    result = await seed()
    async with SessionLocal() as session:
        rows = list(await session.scalars(select(SitePageAnalysis).where(
            SitePageAnalysis.crawl_id == uuid.UUID(result["crawl_id"]))))
        names = ["Garden soil guide", "Soil testing kit", "Compost for healthy soil"]
        for index, row in enumerate(rows):
            artifact = await session.get(SiteFetchArtifact, row.artifact_id)
            name = names[index % len(names)]
            artifact.normalized_facts = extract_page_facts(
                body=(f'<html><title>{name} | Acme</title><main><h1>{name}</h1>'
                      '<p>Use a soil testing kit to understand nutrient levels before planting.</p>'
                      '<p>Add compost to improve moisture retention and support a thriving garden.</p></main></html>').encode(),
                final_url=artifact.final_url, content_type="text/html", status_code=200,
                redacted_headers={},
            )
            row.main_content_indexable = True
            row.finalized_at = datetime.now(UTC)
            row.is_current = True
        await session.commit()
    return result


asyncio.run(main())
