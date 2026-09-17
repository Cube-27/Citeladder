"""Recording what one inspection found, or why it found nothing.

Every outcome writes a snapshot, including the ones that failed. A blocked or
oversized page is evidence about that page and belongs in the record; dropping
it would leave the page indistinguishable from one nobody has reached yet, and
it would be silently retried against the same wall until the budget ran out.

Presence rows are written only when there is content to judge. That asymmetry
is the point: a snapshot says what happened, a presence row says what is on the
page, and a fetch that returned nothing supports the first claim but not the
second.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.source_pages import ExtractedPage, PageAssessment
from app.core.config.source_pages import (
    INSPECTION_BLOCKED,
    INSPECTION_FAILED,
    INSPECTION_INSPECTED,
    PAGE_FORMAT_METHOD_NONE,
    PAGE_FORMAT_METHOD_STRENGTH,
    PAGE_FORMAT_UNRESOLVED,
    SOURCE_PAGE_EXTRACTOR_VERSION,
    SOURCE_PAGE_FORMAT_VERSION,
    SOURCE_PAGE_INSPECTOR_VERSION,
    SOURCE_PAGE_PRESENCE_VERSION,
)
from app.models.source_pages import (
    SourcePage,
    SourcePageEntityPresence,
    SourcePageSnapshot,
)

OUTCOME_INSPECTED = "inspected"
OUTCOME_BLOCKED = "blocked"
OUTCOME_FAILED = "failed"

# Which page state each outcome leaves behind. ``blocked`` is terminal for
# admission because retrying a robots-disallowed page spends budget to be told
# the same thing; ``failed`` stays claimable because transient faults recover.
_STATE_BY_OUTCOME = {
    OUTCOME_INSPECTED: INSPECTION_INSPECTED,
    OUTCOME_BLOCKED: INSPECTION_BLOCKED,
    OUTCOME_FAILED: INSPECTION_FAILED,
}


@dataclass(frozen=True, slots=True)
class FetchOutcome:
    """The transport half of one inspection, independent of what was read."""

    outcome: str
    requested_url: str
    final_url: str = ""
    status_code: int | None = None
    content_type: str | None = None
    charset: str | None = None
    body_bytes: int = 0
    redirect_chain: tuple[str, ...] = ()
    redacted_headers: dict[str, str] | None = None
    robots_state: str | None = None
    reason: str | None = None


def _snapshot(
    *,
    page: SourcePage,
    fetch: FetchOutcome,
    extracted: ExtractedPage | None,
    assessment: PageAssessment | None,
    audit_id: uuid.UUID | None,
    moment: datetime,
) -> SourcePageSnapshot:
    return SourcePageSnapshot(
        workspace_id=page.workspace_id,
        project_id=page.project_id,
        source_page_id=page.id,
        audit_id=audit_id,
        requested_url=fetch.requested_url,
        final_url=fetch.final_url,
        redirect_chain=list(fetch.redirect_chain) or None,
        status_code=fetch.status_code,
        content_type=fetch.content_type,
        charset=fetch.charset,
        body_bytes=fetch.body_bytes,
        content_hash=extracted.content_hash if extracted else None,
        redacted_headers=fetch.redacted_headers,
        page_facts=extracted.as_page_facts() if extracted else None,
        evidence_passages=(
            [passage.as_row() for passage in assessment.passages]
            if assessment
            else None
        ),
        extracted_chars=extracted.extracted_chars if extracted else 0,
        robots_state=fetch.robots_state,
        outcome=fetch.outcome,
        outcome_reason=fetch.reason,
        extractor_version=SOURCE_PAGE_EXTRACTOR_VERSION,
        inspector_version=SOURCE_PAGE_INSPECTOR_VERSION,
        fetched_at=moment,
    )


def _presence_rows(
    *,
    page: SourcePage,
    snapshot: SourcePageSnapshot,
    assessment: PageAssessment,
    roster_version: str,
) -> list[SourcePageEntityPresence]:
    return [
        SourcePageEntityPresence(
            workspace_id=page.workspace_id,
            project_id=page.project_id,
            source_page_id=page.id,
            snapshot_id=snapshot.id,
            entity_kind=presence.entity_kind,
            entity_name=presence.entity_name,
            presence=presence.presence,
            match_method=presence.match_method,
            match_count=presence.match_count,
            first_offset=presence.first_offset,
            passage_refs=list(presence.passage_refs) or None,
            roster_version=roster_version,
            detector_version=SOURCE_PAGE_PRESENCE_VERSION,
        )
        for presence in assessment.presences
    ]


def _apply_page_format(page: SourcePage, assessment: PageAssessment | None) -> None:
    """Only ever the format of THIS page; the publisher's class is untouched.

    An inspection only ever REPLACES a weaker verdict. The page may already
    carry a format derived from its URL alone, and an inspection that read the
    page without recognising its kind -- or that never got to read it at all --
    has learned nothing that contradicts the address. Overwriting on the way
    past would turn a usable answer into ``unresolved`` every time a blocked
    or unrecognisable page was retried.
    """
    incoming = (
        (assessment.page_format, assessment.page_format_method)
        if assessment is not None
        else (PAGE_FORMAT_UNRESOLVED, PAGE_FORMAT_METHOD_NONE)
    )
    if not _is_stronger(incoming[1], page.page_format_method):
        return
    page.page_format, page.page_format_method = incoming
    page.page_format_version = SOURCE_PAGE_FORMAT_VERSION


def _is_stronger(incoming: str | None, existing: str | None) -> bool:
    """Whether ``incoming`` evidence outranks what the page already carries.

    Equal strength counts as stronger: re-reading a page with the same method
    is a refresh, and its newer answer is the one to keep.
    """
    order = PAGE_FORMAT_METHOD_STRENGTH
    rank = {method: index for index, method in enumerate(order)}
    floor = len(order)
    return rank.get(incoming or "", floor) <= rank.get(existing or "", floor)


async def record_inspection(
    session: AsyncSession,
    *,
    page: SourcePage,
    fetch: FetchOutcome,
    extracted: ExtractedPage | None = None,
    assessment: PageAssessment | None = None,
    roster_version: str = "",
    audit_id: uuid.UUID | None = None,
    now: datetime | None = None,
) -> SourcePageSnapshot:
    """Append one inspection's evidence and move the page to its new state."""
    moment = now or datetime.now(UTC)
    snapshot = _snapshot(
        page=page,
        fetch=fetch,
        extracted=extracted,
        assessment=assessment,
        audit_id=audit_id,
        moment=moment,
    )
    session.add(snapshot)
    await session.flush()

    if assessment is not None:
        session.add_all(
            _presence_rows(
                page=page,
                snapshot=snapshot,
                assessment=assessment,
                roster_version=roster_version,
            )
        )

    page.inspection_state = _STATE_BY_OUTCOME.get(fetch.outcome, INSPECTION_FAILED)
    page.inspection_reason = fetch.reason
    page.latest_snapshot_id = snapshot.id
    page.claim_expires_at = None
    page.updated_at = moment
    if fetch.outcome == OUTCOME_INSPECTED:
        page.last_inspected_at = moment
        page.content_hash = extracted.content_hash if extracted else None
    # Every outcome, not just a successful read: a page that is now blocked
    # would otherwise keep advertising the format an earlier inspection found,
    # beside a state saying nothing was read.
    _apply_page_format(page, assessment)
    return snapshot
