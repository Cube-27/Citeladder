"""Explicit handoff of a saved Agent portfolio into prompt candidate admission."""

from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.prompts import prompt_generation_settings
from app.core.config.visibility_prompts import PROMPT_INTENT_VOCABULARY
from app.domain.prompts.generation_cells import CellTopic
from app.domain.prompts.generation_contract import (
    GenerationOutputError,
    SuggestedTopic,
    parse_generation_output,
)
from app.domain.prompts.generation_errors import GenerationValidationError
from app.domain.prompts.query_patterns import PromptSlot
from app.models.agent import AgentOutput, AgentOutputRevision


class _ProposalRow(BaseModel):
    model_config = ConfigDict(extra="forbid")
    topic_id: uuid.UUID
    text: str
    buyer_stage: str
    prompt_intent: str


class _Proposal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    prompts: list[_ProposalRow] = Field(min_length=1)


@dataclass(frozen=True)
class AgentProposal:
    suggestions: list[SuggestedTopic]
    provenance: dict[str, Any]


def parse_proposal(
    body: str, topics: list[CellTopic], revision_id: uuid.UUID
) -> list[SuggestedTopic]:
    blocks = re.findall(
        r"^```json\s*\n(.*?)^```\s*$", body, flags=re.MULTILINE | re.DOTALL
    )
    if len(blocks) != 1:
        raise GenerationValidationError(
            "The portfolio needs one JSON prompt proposal. "
            "Ask the Agent to format it for prompt review."
        )
    try:
        proposal = _Proposal.model_validate_json(blocks[0])
    except ValidationError as exc:
        raise GenerationValidationError(
            "The saved portfolio has invalid prompt rows. "
            "Ask the Agent to repair the proposal."
        ) from exc
    if len(proposal.prompts) > prompt_generation_settings.max_count:
        raise GenerationValidationError(
            "The portfolio exceeds the prompt generation limit"
        )
    by_id = {topic.topic_id: topic for topic in topics}
    slots: list[PromptSlot] = []
    rows: list[dict[str, str]] = []
    for index, row in enumerate(proposal.prompts):
        topic = by_id.get(row.topic_id)
        if topic is None:
            raise GenerationValidationError(
                "A portfolio topic no longer belongs to this selection. "
                "Ask the Agent to refresh its topics."
            )
        slot_id = f"agent-{index + 1}"
        slots.append(
            PromptSlot(
                slot_id=slot_id,
                topic_id=str(topic.topic_id),
                topic_name=topic.name,
                topic_description=topic.description,
                cohort="core",
                allowed_prompt_intents=PROMPT_INTENT_VOCABULARY,
                evidence_ref={
                    "kind": "agent_output_revision",
                    "id": str(revision_id),
                    "offering": topic.name,
                    "evidence_type": "hypothesis",
                    "review_state": "suggested",
                },
            )
        )
        rows.append(
            {
                "slot_id": slot_id,
                "text": row.text,
                "buyer_stage": row.buyer_stage,
                "prompt_intent": row.prompt_intent,
            }
        )
    try:
        suggestions, _ = parse_generation_output(
            json.dumps({"prompts": rows}), slots=slots
        )
    except GenerationOutputError as exc:
        raise GenerationValidationError(
            "The portfolio contains no admissible prompt rows"
        ) from exc
    return suggestions


async def load_agent_proposal(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    revision_id: uuid.UUID,
    topics: list[CellTopic],
) -> AgentProposal:
    revision = await session.scalar(
        select(AgentOutputRevision)
        .join(
            AgentOutput,
            AgentOutput.id == AgentOutputRevision.output_id,
        )
        .where(
            AgentOutputRevision.id == revision_id,
            AgentOutputRevision.workspace_id == workspace_id,
            AgentOutputRevision.project_id == project_id,
            AgentOutput.workspace_id == workspace_id,
            AgentOutput.project_id == project_id,
            AgentOutput.kind == "prompt_portfolio",
        )
    )
    if revision is None:
        raise GenerationValidationError(
            "The prompt portfolio revision is unavailable in this project"
        )
    return AgentProposal(
        suggestions=parse_proposal(revision.body, topics, revision.id),
        provenance={
            "generation_mode": "agent_proposal",
            "agent_output_id": str(revision.output_id),
            "agent_revision_id": str(revision.id),
            "agent_run_id": str(revision.run_id) if revision.run_id else None,
            "source_refs": list(revision.source_refs or []),
        },
    )
