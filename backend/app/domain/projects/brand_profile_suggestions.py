"""Review-first AI drafting and acceptance for the curated BrandProfile."""

from __future__ import annotations

import json
import uuid
from typing import Any

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.agent.client import DefaultAgentClient
from app.core.config.brand_evidence import BRAND_EVIDENCE_FAILURE_MESSAGES
from app.core.config.brand_profile import (
    BRAND_PROFILE_FIELDS,
    BRAND_PROFILE_SOURCE_AI_SUGGESTED,
    BRAND_PROFILE_SOURCE_MANUAL,
    BRAND_PROFILE_SUGGESTER_VERSION,
    BRAND_PROFILE_SUGGESTION_SYSTEM_PROMPT,
)
from app.domain.projects.brand_evidence import BrandEvidence, collect_brand_evidence
from app.domain.projects.brand_profile import (
    BrandProfileNotFoundError,
    brand_profile_to_response,
    clean_profile_products,
)
from app.domain.projects.knowledge_base import (
    build_brand_knowledge_data,
    serialize_brand_knowledge_context,
)
from app.domain.projects.schemas import (
    BrandProfileAcceptResponse,
    BrandProfileDraft,
    BrandProfileSuggestionResponse,
)
from app.domain.projects.service import get_project
from app.models.brand import BrandProfile, BrandProfileSuggestion


class BrandProfileSuggestionValidationError(ValueError):
    """The draft or acceptance request violates the review contract."""


class BrandProfileSuggestionOutputError(RuntimeError):
    """The agent returned an unusable profile draft."""


class BrandEvidenceUnavailableError(RuntimeError):
    """The brand's own website yielded too little content to draft from.

    Raised BEFORE the agent is called. Drafting a profile from the brand name
    alone is what produced fabricated positioning, competitors, and prompts for
    brands with no training-data footprint; refusing to draft is the correct
    outcome, and the human fills the profile in by hand instead.
    """

    def __init__(self, message: str, *, reason: str) -> None:
        super().__init__(message)
        self.reason = reason


class BrandProfileSuggestionNotFoundError(LookupError):
    """The immutable suggestion is absent or outside the caller's scope."""


def validate_brand_profile_suggest_request(payload: Any) -> None:
    if not payload.confirm_send_evidence:
        raise BrandProfileSuggestionValidationError(
            "confirm_send_evidence must be true to send brand evidence to the "
            "default agent"
        )


def parse_brand_profile_draft(raw: str) -> BrandProfileDraft:
    """Parse and normalize the agent's strict JSON draft."""
    try:
        parsed = BrandProfileDraft.model_validate(json.loads(raw))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise BrandProfileSuggestionOutputError(
            f"Unparseable agent output: {exc}"
        ) from exc

    try:
        draft = BrandProfileDraft(
            description=parsed.description.strip(),
            positioning=parsed.positioning.strip(),
            products_services=clean_profile_products(parsed.products_services),
            target_audience=parsed.target_audience.strip(),
        )
    except ValidationError as exc:
        raise BrandProfileSuggestionOutputError(
            f"Unparseable normalized agent output: {exc}"
        ) from exc
    if not any(draft.model_dump().values()):
        # The system prompt REQUIRES an unsupported field to come back empty,
        # so an all-empty draft is the model correctly reporting that the
        # evidence did not support any field. That is a grounding outcome the
        # user can act on (fill the profile in), not malformed output — a 502
        # here would blame the provider for obeying its instructions.
        raise BrandEvidenceUnavailableError(
            BRAND_EVIDENCE_FAILURE_MESSAGES["insufficient_website_content"],
            reason="insufficient_website_content",
        )
    return draft


def build_brand_profile_suggestion_message(
    knowledge: dict[str, object], evidence: BrandEvidence
) -> str:
    """Assemble the drafter's user message: identity + real page evidence.

    The evidence block carries what the brand's own site says; the knowledge
    block carries the curated identity rows. The instruction names the evidence
    as the only admissible source so the two blocks can't be conflated.

    ``evidence`` is REQUIRED and must carry pages. The instruction below tells
    the model that the evidence block is its only admissible source, so
    emitting that instruction without the block would direct the model at
    content that is not there — leaving it to fall back on the brand name,
    which is the exact failure this whole path exists to prevent.

    Takes the already-projected knowledge DATA (not the ORM ``Project``): the
    caller snapshots it before ending its transaction, and this runs after the
    evidence crawl, when touching an expired ORM attribute would attempt lazy
    I/O outside the async greenlet context.
    """
    if not evidence.pages:
        raise BrandEvidenceUnavailableError(
            BRAND_EVIDENCE_FAILURE_MESSAGES.get(
                evidence.failure_reason,
                BRAND_EVIDENCE_FAILURE_MESSAGES["website_unreachable"],
            ),
            reason=evidence.failure_reason or "website_unreachable",
        )
    sections = [serialize_brand_knowledge_context(knowledge)]
    sections.append(evidence.serialize())
    sections.append(
        "Draft the four requested profile fields for human review, using ONLY "
        "the <brand_website_evidence> page content above. Leave any field "
        "empty that the evidence does not support."
    )
    return "\n".join(sections)


def brand_profile_suggestion_to_response(
    suggestion: BrandProfileSuggestion,
) -> BrandProfileSuggestionResponse:
    return BrandProfileSuggestionResponse(
        id=suggestion.id,
        workspace_id=suggestion.workspace_id,
        project_id=suggestion.project_id,
        brand_id=suggestion.brand_id,
        draft=BrandProfileDraft.model_validate(suggestion.output),
        model_identity=dict(suggestion.model_identity),
        prompt_template_version=suggestion.prompt_template_version,
        created_at=suggestion.created_at,
    )


async def suggest_brand_profile(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    agent: DefaultAgentClient,
) -> BrandProfileSuggestion:
    """Call the default agent, then persist its immutable review artifact."""
    project = await get_project(
        session, workspace_id=workspace_id, project_id=project_id
    )
    if project.brand is None:
        raise BrandProfileNotFoundError("Project brand not found")
    input_snapshot = build_brand_knowledge_data(project)
    website_url = project.website_url

    # Do not hold a database transaction open during network I/O — this covers
    # the evidence crawl as well as the provider call.
    await session.rollback()

    # Ground the draft in the brand's own site BEFORE calling the agent. With
    # no evidence there is nothing to draft from but the brand name, which is
    # exactly the fabrication path this gate exists to close.
    evidence = await collect_brand_evidence(website_url)
    if not evidence.is_sufficient:
        raise BrandEvidenceUnavailableError(
            BRAND_EVIDENCE_FAILURE_MESSAGES.get(
                evidence.failure_reason,
                "Could not read enough content from this brand's website to "
                "draft a profile. Fill the profile in manually instead.",
            ),
            reason=evidence.failure_reason,
        )
    user_message = build_brand_profile_suggestion_message(input_snapshot, evidence)
    # Record provenance AFTER building the message so the evidence block the
    # agent saw is exactly the curated knowledge, not the provenance stanza.
    input_snapshot["website_evidence"] = evidence.provenance()

    raw = await agent.complete_json(
        system=BRAND_PROFILE_SUGGESTION_SYSTEM_PROMPT,
        user=user_message,
    )
    draft = parse_brand_profile_draft(raw)

    # Re-authorize after the network boundary. The project may have been
    # deleted or moved out of scope while the provider call was in flight.
    project = await get_project(
        session, workspace_id=workspace_id, project_id=project_id
    )
    if project.brand is None:
        raise BrandProfileNotFoundError("Project brand not found")
    suggestion = BrandProfileSuggestion(
        workspace_id=workspace_id,
        project_id=project_id,
        brand_id=project.brand.id,
        model_identity={
            "transport_host": agent.base_url_host,
            "transport_model": agent.model,
        },
        prompt_template_version=BRAND_PROFILE_SUGGESTER_VERSION,
        input_context_snapshot=input_snapshot,
        output=draft.model_dump(),
    )
    session.add(suggestion)
    await session.commit()
    await session.refresh(suggestion)
    return suggestion


async def accept_brand_profile_suggestion(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    suggestion_id: uuid.UUID,
    payload: Any,
) -> BrandProfileAcceptResponse:
    """Accept selected draft fields while preserving all manual authority."""
    project = await get_project(
        session, workspace_id=workspace_id, project_id=project_id
    )
    if project.brand is None:
        raise BrandProfileNotFoundError("Project brand not found")

    suggestion = (
        await session.execute(
            select(BrandProfileSuggestion).where(
                BrandProfileSuggestion.id == suggestion_id,
                BrandProfileSuggestion.workspace_id == workspace_id,
                BrandProfileSuggestion.project_id == project_id,
                BrandProfileSuggestion.brand_id == project.brand.id,
            )
        )
    ).scalar_one_or_none()
    if suggestion is None:
        raise BrandProfileSuggestionNotFoundError("Brand profile suggestion not found")

    profile = (
        await session.execute(
            select(BrandProfile)
            .where(
                BrandProfile.workspace_id == workspace_id,
                BrandProfile.project_id == project_id,
                BrandProfile.brand_id == project.brand.id,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    if profile is None:
        raise BrandProfileNotFoundError("Brand profile not found")

    draft = BrandProfileDraft.model_validate(suggestion.output)
    sources = dict(profile.sources or {})
    artifact_ids = dict(profile.source_artifact_ids or {})
    manual_data = payload.manual_overrides.model_dump(
        exclude_unset=True, exclude_none=True
    )

    # Manual overrides are applied first and always win within this request.
    for field, value in manual_data.items():
        if field == "products_services":
            value = clean_profile_products(value)
        else:
            value = value.strip()
        setattr(profile, field, value)
        sources[field] = BRAND_PROFILE_SOURCE_MANUAL
        artifact_ids.pop(field, None)

    accepted: list[str] = []
    skipped_manual: list[str] = []
    requested_fields = list(dict.fromkeys(payload.accepted_fields))
    for field in requested_fields:
        if field not in BRAND_PROFILE_FIELDS:
            raise BrandProfileSuggestionValidationError(
                f"Unknown brand profile field: {field}"
            )
        if field in manual_data:
            continue
        value = getattr(draft, field)
        if not value:
            raise BrandProfileSuggestionValidationError(
                f"Suggestion has no usable value for accepted field: {field}"
            )
        if sources.get(field) == BRAND_PROFILE_SOURCE_MANUAL:
            skipped_manual.append(field)
            continue
        setattr(profile, field, value)
        sources[field] = BRAND_PROFILE_SOURCE_AI_SUGGESTED
        artifact_ids[field] = str(suggestion.id)
        accepted.append(field)

    profile.sources = sources
    profile.source_artifact_ids = artifact_ids
    await session.commit()
    await session.refresh(profile)
    return BrandProfileAcceptResponse(
        profile=brand_profile_to_response(profile),
        accepted_fields=accepted,
        skipped_manual_fields=skipped_manual,
    )
