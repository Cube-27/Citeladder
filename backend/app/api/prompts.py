# Prompt generation router: POST /prompt-sets/{id}/generate.
#
# Generation stays Python while it calls models through the model gateway and
# the quality judge; it stages candidates for review and never schedules an
# audit. The TypeScript API owns every other prompt-library route (prompt sets,
# prompts, import, candidate review and topics). Workspace-scoped through the
# parent project; the active workspace comes from ``require_active_workspace``.
from __future__ import annotations

import math
import uuid
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    WorkspaceContext,
    get_db,
    require_active_workspace_run,
)
from app.api.usage_limits import enforce_workspace_request
from app.connectors.agent.client import AgentNotConfiguredError
from app.connectors.agent.factory import create_model_gateway
from app.connectors.agent.gateway import ModelGateway
from app.connectors.answer_engines.errors import ProviderError
from app.connectors.jev import create_jev_client
from app.core.config.abuse import abuse_settings
from app.core.config.errors import (
    ERROR_AGENT_CALL_FAILED,
    ERROR_AGENT_NOT_CONFIGURED,
    ERROR_GENERATION_INVALID,
    ERROR_GENERATION_UNPARSEABLE,
    ERROR_RATE_LIMIT,
)
from app.core.config.provider_catalog import (
    ERROR_RATE_LIMIT as PROVIDER_ERROR_RATE_LIMIT,
)
from app.core.errors import ApiException
from app.core.http_errors import (
    coded_error,
    raise_coded_error,
    raise_not_found,
)
from app.domain.prompts.generation import (
    GenerationOutputError,
    GenerationResult,
    GenerationValidationError,
    generate_prompts,
    validate_generation_request,
)
from app.domain.prompts.generation_contract import generation_model_call_budget
from app.domain.prompts.generation_errors import PromptSetNotFoundError
from app.domain.prompts.mappers import (
    active_prompt_counts,
    candidate_to_response,
    topic_to_response,
)
from app.domain.prompts.schemas import (
    PromptGenerateRequest,
    PromptGenerateResponse,
)
from app.models.prompt import PromptSet

router = APIRouter(tags=["prompt-generation"])

# The run capability comes from the ONE role policy
# (app/domain/workspaces/policy.py); nothing here spells a role set.
_RunDep = Annotated[WorkspaceContext, Depends(require_active_workspace_run)]
_SessionDep = Annotated[AsyncSession, Depends(get_db)]

# Resource label passed to raise_not_found (S1192: name the repeated literal).
_RES_PROMPT_SET = "Prompt set"


def _generation_provider_error(exc: ProviderError) -> ApiException:
    if exc.error_code == PROVIDER_ERROR_RATE_LIMIT:
        retry_after = (
            str(max(1, math.ceil(exc.retry_after_seconds)))
            if exc.retry_after_seconds is not None
            else None
        )
        return coded_error(
            status.HTTP_429_TOO_MANY_REQUESTS,
            ERROR_RATE_LIMIT,
            "The AI provider is rate limited. Please try again shortly.",
            headers={"Retry-After": retry_after} if retry_after else None,
        )
    return coded_error(status.HTTP_502_BAD_GATEWAY, ERROR_AGENT_CALL_FAILED, str(exc))


async def _generate_with_judge(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    prompt_set_id: uuid.UUID,
    payload: PromptGenerateRequest,
    agent: ModelGateway | None,
    prompt_set: PromptSet,
) -> GenerationResult:
    # The quality judge is off when JEV_API_KEY is blank. Its calls
    # are bounded by jev_max_calls_per_generation, not the agent-call bucket.
    judge = create_jev_client()
    try:
        return await generate_prompts(
            session,
            workspace_id=workspace_id,
            prompt_set_id=prompt_set_id,
            payload=payload,
            agent=agent,
            judge=judge,
            prompt_set=prompt_set,
        )
    finally:
        if judge is not None:
            await judge.aclose()


async def _generation_agent(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    payload: PromptGenerateRequest,
) -> ModelGateway | None:
    """Configure and budget only requests that need model generation."""
    agent: ModelGateway | None = None
    if payload.cohort != "commerce" and payload.agent_revision_id is None:
        try:
            agent = create_model_gateway()
        except AgentNotConfiguredError as exc:
            raise_coded_error(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                ERROR_AGENT_NOT_CONFIGURED,
                "No default agent is configured. Set the configured provider's "
                "API key in the backend environment.",
                cause=exc,
            )
        await enforce_workspace_request(
            session,
            workspace_id=workspace_id,
            operation="agent.provider_call",
            limit=abuse_settings.agent_call_limit,
            window_seconds=abuse_settings.agent_call_window_seconds,
            amount=generation_model_call_budget(payload.count),
        )
    return agent


@router.post(
    "/prompt-sets/{prompt_set_id}/generate",
    status_code=status.HTTP_201_CREATED,
)
async def generate_prompts_endpoint(
    prompt_set_id: uuid.UUID,
    payload: PromptGenerateRequest,
    ctx: _RunDep,
    session: _SessionDep,
) -> PromptGenerateResponse:
    """Generate candidates or admit a saved Agent proposal for explicit review.

    Scope and request validation precede model configuration and network I/O.
    Nothing is tracked until accepted; generation never schedules an audit.
    """
    try:
        prompt_set = await validate_generation_request(
            session,
            workspace_id=ctx.workspace_id,
            prompt_set_id=prompt_set_id,
            payload=payload,
        )
    except PromptSetNotFoundError as exc:
        raise_not_found(_RES_PROMPT_SET, cause=exc)
    except GenerationValidationError as exc:
        raise_coded_error(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            ERROR_GENERATION_INVALID,
            str(exc),
            cause=exc,
        )
    agent = await _generation_agent(session, ctx.workspace_id, payload)
    try:
        result = await _generate_with_judge(
            session,
            workspace_id=ctx.workspace_id,
            prompt_set_id=prompt_set_id,
            payload=payload,
            agent=agent,
            prompt_set=prompt_set,
        )
    except PromptSetNotFoundError as exc:
        raise_not_found(_RES_PROMPT_SET, cause=exc)
    except GenerationValidationError as exc:
        raise_coded_error(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            ERROR_GENERATION_INVALID,
            str(exc),
            cause=exc,
        )
    except GenerationOutputError as exc:
        raise_coded_error(
            status.HTTP_502_BAD_GATEWAY,
            ERROR_GENERATION_UNPARSEABLE,
            str(exc),
            cause=exc,
        )
    except ProviderError as exc:
        raise _generation_provider_error(exc) from exc
    counts = (
        await active_prompt_counts(session, project_id=result.topics[0].project_id)
        if result.topics
        else {}
    )
    return PromptGenerateResponse(
        candidates=[
            candidate_to_response(c, result.quality_gate) for c in result.candidates
        ],
        topics=[topic_to_response(t, counts) for t in result.topics],
        dropped_duplicates=result.dropped_duplicates,
        candidates_generated=result.candidates_generated,
        quality_gate=result.quality_gate,
        quality_rejected=result.quality_rejected,
        requested_count=payload.count,
    )
