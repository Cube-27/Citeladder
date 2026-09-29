"""The frozen context manifest one agent run starts from (invariant 11).

Built at admission, before any provider I/O, from the single context builder
(reviewed brand facts, target-page evidence, related pages and the chat's typed
evidence references), the attached and @-mentioned Actions' deterministic
diagnoses and the project's standing agent instructions. The model reads more
through the tool catalog; this package is what it starts from and what
provenance records.
"""

from __future__ import annotations

import json
import uuid
from collections.abc import Sequence
from typing import Any, Final

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.agent import AGENT_CONTEXT_PACKAGE_MAX_CHARS
from app.domain.agent.context_builder import (
    ContentContext,
    ContentContextNotFoundError,
    build_content_context,
)
from app.domain.agent.context_refs import (
    SearchIntelligenceReference,
    SiteHealthReference,
)
from app.models.agent import AgentChat, AgentInstructionRevision
from app.models.opportunity import Action

AGENT_CONTEXT_MANIFEST_VERSION: Final = "agent-context-1"


def _uuid(value: object) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(value)) if value else None
    except ValueError:
        return None


async def latest_instructions(
    session: AsyncSession, *, workspace_id: uuid.UUID, project_id: uuid.UUID
) -> AgentInstructionRevision | None:
    return await session.scalar(
        select(AgentInstructionRevision)
        .where(
            AgentInstructionRevision.workspace_id == workspace_id,
            AgentInstructionRevision.project_id == project_id,
        )
        .order_by(AgentInstructionRevision.revision.desc())
        .limit(1)
    )


async def build_manifest(
    session: AsyncSession,
    *,
    chat: AgentChat,
    request: str,
    mention_ids: Sequence[uuid.UUID] = (),
) -> dict[str, Any]:
    """Resolve, authorize and freeze everything a run starts from.

    ``mention_ids`` are the Actions the request @-mentions, in order.
    """
    mentioned = await _mentioned_actions(session, chat=chat, action_ids=mention_ids)
    refs = dict(chat.context_refs or {})
    site_health = refs.get("site_health_reference")
    search = refs.get("search_intelligence_reference")
    package: ContentContext = await build_content_context(
        session,
        workspace_id=chat.workspace_id,
        project_id=chat.project_id,
        user_instruction=request,
        target_site_url_id=_uuid(refs.get("target_site_url_id")),
        target_url=str(refs.get("target_url") or ""),
        opportunity_id=_uuid(refs.get("opportunity_id")),
        demand_signal_id=_uuid(refs.get("demand_signal_id")),
        site_health_reference=(
            SiteHealthReference.model_validate(site_health) if site_health else None
        ),
        search_intelligence_reference=(
            SearchIntelligenceReference.model_validate(search) if search else None
        ),
    )
    action = (
        await session.scalar(
            select(Action).where(
                Action.id == chat.action_id,
                Action.workspace_id == chat.workspace_id,
                Action.project_id == chat.project_id,
            )
        )
        if chat.action_id is not None
        else None
    )
    instructions = await latest_instructions(
        session, workspace_id=chat.workspace_id, project_id=chat.project_id
    )
    return {
        "version": AGENT_CONTEXT_MANIFEST_VERSION,
        "refs": refs,
        "package": package.snapshot(),
        "action": _action_block(action),
        "mentions": [_action_block(item) for item in mentioned],
        "instructions": (
            {"revision": instructions.revision, "text": instructions.text}
            if instructions is not None and instructions.text.strip()
            else None
        ),
    }


async def _mentioned_actions(
    session: AsyncSession, *, chat: AgentChat, action_ids: Sequence[uuid.UUID]
) -> list[Action]:
    """The @-mentioned Actions, in mention order, authorized to the chat.

    A mention outside the chat's project (or of a deleted Action) refuses the
    turn rather than silently dropping evidence the user named.
    """
    if not action_ids:
        return []
    rows = (
        await session.scalars(
            select(Action).where(
                Action.id.in_(action_ids),
                Action.workspace_id == chat.workspace_id,
                Action.project_id == chat.project_id,
            )
        )
    ).all()
    found = {row.id: row for row in rows}
    if len(found) != len(set(action_ids)):
        raise ContentContextNotFoundError(
            "A mentioned Action is not available in this project."
        )
    return [found[action_id] for action_id in action_ids]


def _action_block(action: Action | None) -> dict[str, Any] | None:
    """The attached Action's frozen identity and diagnosis, or None."""
    if action is None:
        return None
    snapshot_id = action.opportunity_snapshot_id
    return {
        "id": str(action.id),
        "target_kind": action.target_kind,
        "target_label": action.target_label,
        "target_url": action.target_url,
        "approach": action.approach,
        "skill_id": action.skill_id,
        "families": list(action.families or []),
        "diagnosis": action.diagnosis or {},
        "opportunity_snapshot_id": str(snapshot_id) if snapshot_id else None,
    }


def render_manifest(manifest: dict[str, Any]) -> str:
    """The model-facing text of a frozen manifest, within its size bound."""
    package = ContentContext.from_snapshot(manifest.get("package") or {})
    parts: list[str] = []
    instructions = manifest.get("instructions")
    if instructions:
        parts.append(
            "STANDING AGENT INSTRUCTIONS (from the project owner)\n\n"
            f"{instructions['text']}"
        )
    parts += package.reference_blocks()
    action = manifest.get("action")
    if action:
        parts.append(
            "ATTACHED ACTION (deterministic diagnosis)\n\n"
            + json.dumps(action, ensure_ascii=False, default=str)
        )
    mentions = manifest.get("mentions") or []
    if mentions:
        parts.append(
            "ACTIONS THE USER MENTIONED (deterministic diagnoses)\n\n"
            + json.dumps(mentions, ensure_ascii=False, default=str)
        )
    omissions = (package.summary or {}).get("omissions") or []
    if omissions:
        parts.append("CONTEXT OMISSIONS\n\n" + json.dumps(omissions, default=str))
    text = "\n\n".join(parts)
    if len(text) > AGENT_CONTEXT_PACKAGE_MAX_CHARS:
        text = (
            text[:AGENT_CONTEXT_PACKAGE_MAX_CHARS]
            + "\n[context package truncated at its size bound; read details with tools]"
        )
    return text
