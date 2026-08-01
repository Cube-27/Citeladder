# Brand-suggestions router: stateless AI competitor / owned-domain / prompt
# suggestions for the setup form (F6) and onboarding auto-discovery.
#
# No project id in the path — the setup form may be for a brand-new, unsaved
# project, so brand context arrives in the request body and nothing is
# persisted here; the existing project save flow persists whatever the user
# keeps after review. Still workspace-authenticated (never anonymous): the
# endpoints spend agent quota and forward brand data to the provider.
from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import WorkspaceContext, get_db, require_active_workspace
from app.api.usage_limits import enforce_workspace_request
from app.connectors.agent.client import AgentNotConfiguredError, DefaultAgentClient
from app.connectors.answer_engines.errors import ProviderError
from app.core.config.abuse import abuse_settings
from app.domain.projects.schemas import (
    CompetitorInput,
    CompetitorSuggestRequest,
    CompetitorSuggestResponse,
    OwnedDomainSuggestRequest,
    OwnedDomainSuggestResponse,
    PromptSuggestionItem,
    PromptSuggestRequest,
    PromptSuggestResponse,
    SuggestedTopicGroup,
)
from app.domain.projects.suggestions import (
    BrandEvidenceRequiredError,
    SuggestionOutputError,
    SuggestionValidationError,
    suggest_competitors,
    suggest_owned_domains,
    suggest_prompts,
    validate_prompt_suggestion_payload,
    validate_suggestion_payload,
)
from app.domain.prompts.receipts import issue_prompt_receipt

router = APIRouter(prefix="/brand-suggestions", tags=["brand-suggestions"])

_WorkspaceDep = Annotated[WorkspaceContext, Depends(require_active_workspace)]
_SessionDep = Annotated[AsyncSession, Depends(get_db)]


def _resolve_agent() -> DefaultAgentClient:
    """Instantiate the default agent, mapping missing config to 503.

    Kept at the API layer (mirrors ``generate_prompts_endpoint``) so tests can
    monkeypatch ``brand_suggestions.DefaultAgentClient`` and configuration
    errors surface before any provider work.
    """
    try:
        return DefaultAgentClient()
    except AgentNotConfiguredError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "agent_not_configured",
                "message": (
                    "No default agent is configured. Set DEFAULT_AGENT_API_KEY "
                    "(or MISTRALAI_API_KEY) in the backend environment."
                ),
            },
        ) from exc


def _raise_invalid(exc: SuggestionValidationError) -> None:
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail={"code": "suggestion_invalid", "message": str(exc)},
    ) from exc


def _raise_unparseable(exc: SuggestionOutputError) -> None:
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail={"code": "suggestion_unparseable", "message": str(exc)},
    ) from exc


def _raise_agent_failed(exc: ProviderError) -> None:
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail={"code": "agent_call_failed", "message": str(exc)},
    ) from exc


def _raise_no_evidence(exc: BrandEvidenceRequiredError) -> None:
    """422: nothing to ground on — the website is unreadable and no
    description was supplied. Actionable by the user, not a server fault."""
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail={
            "code": "brand_evidence_required",
            "message": str(exc),
            "reason": exc.reason,
        },
    ) from exc


@router.post(
    "/competitors",
    response_model=CompetitorSuggestResponse,
    status_code=status.HTTP_201_CREATED,
)
async def suggest_competitors_endpoint(
    payload: CompetitorSuggestRequest, ctx: _WorkspaceDep, session: _SessionDep
) -> CompetitorSuggestResponse:
    """AI competitor suggestions via the app-level default agent.

    Guard order mirrors ``generate_prompts_endpoint`` (minus the 404 scope
    check — there is no persisted resource): confirmation/bounds (422) before
    agent configuration (503), then provider/output failures (502). The
    backend enforces ``confirm_send_evidence``, never just the UI.
    """
    try:
        # 422 before 503: an invalid payload must be rejected as invalid even
        # when no agent is configured (mirrors generate_prompts_endpoint).
        validate_suggestion_payload(payload)
    except SuggestionValidationError as exc:
        _raise_invalid(exc)
    agent = _resolve_agent()
    await enforce_workspace_request(
        session,
        workspace_id=ctx.workspace_id,
        operation="agent.provider_call",
        limit=abuse_settings.agent_call_limit,
        window_seconds=abuse_settings.agent_call_window_seconds,
    )
    try:
        competitors, dropped = await suggest_competitors(payload=payload, agent=agent)
    except BrandEvidenceRequiredError as exc:
        _raise_no_evidence(exc)
    except SuggestionValidationError as exc:
        _raise_invalid(exc)
    except SuggestionOutputError as exc:
        _raise_unparseable(exc)
    except ProviderError as exc:
        _raise_agent_failed(exc)
    return CompetitorSuggestResponse(
        competitors=[
            CompetitorInput(name=c.name, aliases=c.aliases, domains=c.domains)
            for c in competitors
        ],
        dropped_duplicates=dropped,
    )


@router.post(
    "/owned-domains",
    response_model=OwnedDomainSuggestResponse,
    status_code=status.HTTP_201_CREATED,
)
async def suggest_owned_domains_endpoint(
    payload: OwnedDomainSuggestRequest, ctx: _WorkspaceDep, session: _SessionDep
) -> OwnedDomainSuggestResponse:
    """AI owned-domain suggestions via the app-level default agent.

    Same guard order as ``suggest_competitors_endpoint``. Only first-party
    owned domains — never competitor or unintended domains (system prompt +
    server-side normalization).
    """
    try:
        # 422 before 503: an invalid payload must be rejected as invalid even
        # when no agent is configured (mirrors generate_prompts_endpoint).
        validate_suggestion_payload(payload)
    except SuggestionValidationError as exc:
        _raise_invalid(exc)
    agent = _resolve_agent()
    await enforce_workspace_request(
        session,
        workspace_id=ctx.workspace_id,
        operation="agent.provider_call",
        limit=abuse_settings.agent_call_limit,
        window_seconds=abuse_settings.agent_call_window_seconds,
    )
    try:
        domains, dropped = await suggest_owned_domains(payload=payload, agent=agent)
    except BrandEvidenceRequiredError as exc:
        _raise_no_evidence(exc)
    except SuggestionValidationError as exc:
        _raise_invalid(exc)
    except SuggestionOutputError as exc:
        _raise_unparseable(exc)
    except ProviderError as exc:
        _raise_agent_failed(exc)
    return OwnedDomainSuggestResponse(domains=domains, dropped_duplicates=dropped)


@router.post(
    "/prompts",
    response_model=PromptSuggestResponse,
    status_code=status.HTTP_201_CREATED,
)
async def suggest_prompts_endpoint(
    payload: PromptSuggestRequest, ctx: _WorkspaceDep, session: _SessionDep
) -> PromptSuggestResponse:
    """AI prompt suggestions via the app-level default agent.

    Stateless sibling of ``POST /prompt-sets/{id}/generate`` for the pre-save
    onboarding flow: the same agent prompt construction (reused from
    ``domain/prompts/generation.py``), but nothing is persisted — the caller
    reviews the rows and saves what it keeps. Same guard order as the other
    suggestion endpoints: confirmation/bounds (422) before agent
    configuration (503), then provider/output failures (502).

    The response carries the prompts twice: ``prompts`` flat, and ``topics``
    grouped as the agent proposed them. A caller that persists (onboarding)
    uses the grouped form to create the same ``Topic`` rows ``/generate``
    creates, so a project set up through onboarding is not left untopiced.
    """
    try:
        # 422 before 503: an invalid payload must be rejected as invalid even
        # when no agent is configured (mirrors generate_prompts_endpoint).
        validate_prompt_suggestion_payload(payload)
    except SuggestionValidationError as exc:
        _raise_invalid(exc)
    agent = _resolve_agent()
    await enforce_workspace_request(
        session,
        workspace_id=ctx.workspace_id,
        operation="agent.provider_call",
        limit=abuse_settings.agent_call_limit,
        window_seconds=abuse_settings.agent_call_window_seconds,
    )
    try:
        prompts, topics, dropped = await suggest_prompts(payload=payload, agent=agent)
    except BrandEvidenceRequiredError as exc:
        _raise_no_evidence(exc)
    except SuggestionValidationError as exc:
        _raise_invalid(exc)
    except SuggestionOutputError as exc:
        _raise_unparseable(exc)
    except ProviderError as exc:
        _raise_agent_failed(exc)

    # Each suggestion carries a receipt proving the backend generated it, so the
    # caller can persist it as ``generated`` (skipping topical binding, which
    # cannot judge a deliberately brand-neutral prompt) without the endpoint
    # having to trust a client-supplied origin claim.
    def _item(row: Any) -> PromptSuggestionItem:
        return PromptSuggestionItem(
            text=row.text,
            theme=row.theme,
            intent=row.intent,
            generation_receipt=issue_prompt_receipt(row.text),
        )

    return PromptSuggestResponse(
        prompts=[_item(p) for p in prompts],
        topics=[
            SuggestedTopicGroup(name=t.name, prompts=[_item(p) for p in t.prompts])
            for t in topics
        ],
        dropped_duplicates=dropped,
    )
