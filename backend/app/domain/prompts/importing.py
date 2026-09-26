# CSV bulk import: persist already-parsed prompt rows as ``imported``.
#
# Split from ``service.py`` (which owns the shared insert/capacity gate) so the
# import's topic-name resolution and all-or-nothing binding live together.
from __future__ import annotations

import uuid
from collections.abc import Sequence
from typing import Any

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.projects import PROMPT_ORIGIN_IMPORTED
from app.domain.projects.normalization import normalize_intent
from app.domain.prompts.locks import acquire_project_lock
from app.domain.prompts.normalization import prompt_text_hash
from app.domain.prompts.schemas import PromptImportRow
from app.domain.prompts.service import (
    get_prompt_set,
    prepare_prompt_inserts,
    prompt_set_project_id,
)
from app.domain.prompts.topical_binding import (
    BINDING_FAILURE_MESSAGES,
    TopicalBindingError,
    load_project_vocabulary,
    validate_prompt_binding,
)
from app.domain.prompts.topics import resolve_topics_by_name
from app.models.prompt import Prompt, PromptSet


async def _enforce_import_binding(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    texts: Sequence[str],
) -> None:
    """Per-row binding gate for CSV import (atomic: all rows or none).

    Every non-empty row must bind to the project vocabulary. Failures are
    collected per row and raised together BEFORE any insert or occupancy
    charge, so an invalid import inserts NO rows and the caller gets the
    row-specific reasons.
    """
    vocabulary = await load_project_vocabulary(
        session, workspace_id=workspace_id, project_id=project_id
    )
    # Mixed value types (``row`` is an int), so the entry type is spelled out —
    # otherwise the inferred value type is the common supertype and ``code``
    # comes back too wide to pass on as the error's code.
    failures: list[dict[str, Any]] = []
    for index, text in enumerate(texts):
        if not text:
            continue
        result = validate_prompt_binding(text, vocabulary)
        if not result.accepted:
            failures.append(
                {
                    "row": index,
                    "code": result.code,
                    "message": BINDING_FAILURE_MESSAGES[result.code],
                }
            )
    if failures:
        raise TopicalBindingError(
            f"{len(failures)} imported prompt row(s) fail topical binding; "
            "no rows were imported",
            code=failures[0]["code"],
            details={"rows": failures},
        )


def _import_texts(rows: Sequence[PromptImportRow]) -> list[str]:
    """Strip every row's text (empty strings are filtered downstream)."""
    return [str(row.text or "").strip() for row in rows]


async def _insert_imported_row(
    session: AsyncSession,
    *,
    prompt_set_id: uuid.UUID,
    row: PromptImportRow,
    text: str,
    topic_id: uuid.UUID | None,
) -> None:
    """Persist one capacity-approved import row as ``imported``.

    ``ON CONFLICT DO NOTHING`` on the per-set hash constraint stays the
    final race guard — a duplicate is dropped by the DB, never a failure.
    """
    stmt = (
        pg_insert(Prompt)
        .values(
            id=uuid.uuid4(),
            prompt_set_id=prompt_set_id,
            topic_id=topic_id,
            text=text,
            normalized_text_hash=prompt_text_hash(text),
            theme=str(row.theme or "").strip(),
            intent=normalize_intent(row.intent),
            branded=row.cohort == "comparison",
            enabled=bool(row.enabled),
            origin=PROMPT_ORIGIN_IMPORTED,
        )
        .on_conflict_do_nothing(constraint="uq_prompt_set_normalized_text")
    )
    await session.execute(stmt)


def _first_row_per_approved_text(
    rows: Sequence[PromptImportRow],
    texts: Sequence[str],
    approved: frozenset[str],
) -> list[tuple[PromptImportRow, str]]:
    """The rows that will insert: approved, first occurrence of each text.

    A repeat within the upload would be dropped by the per-set constraint, so
    it must not create its topic either.
    """
    inserts: dict[str, tuple[PromptImportRow, str]] = {}
    for row, text in zip(rows, texts, strict=True):
        text_hash = prompt_text_hash(text) if text else ""
        if text_hash in approved:
            inserts.setdefault(text_hash, (row, text))
    return list(inserts.values())


async def import_prompts(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    prompt_set_id: uuid.UUID,
    rows: Sequence[PromptImportRow],
) -> PromptSet:
    """CSV bulk-create: persist already-parsed prompt rows as ``imported``.

    Rows with empty text are skipped; intents are casefolded + validated.
    Each inserted row's topic NAME resolves to an existing topic or a new
    manual one under the project lock; a blank name imports unassigned, and
    topics are created only for rows that actually insert.
    Duplicates (same normalized text as an existing prompt in the set, or a
    repeat within the upload) are dropped — never a request failure — and
    are filtered BEFORE occupancy is charged, so a duplicate never consumes
    a ``prompt_slots`` slot. Every non-empty row must pass topical binding:
    row-specific failures are raised together and, since the import is
    atomic, an invalid upload inserts NO rows. The insert runs under the
    account-capacity lock; the whole import is atomic, so an over-allowance
    upload inserts nothing either. Returns the refreshed prompt set (with
    all prompts) so the caller can project the whole set back — matching
    the frontend import contract.
    """
    # NOTE: the scope check's result is deliberately DISCARDED (never held in
    # a local): keeping the instance alive would pin it in the identity map
    # with its already-loaded (empty) prompts collection, and the refresh at
    # the end of the import would serve that stale collection. The binding
    # gate reads the project id through a scalar column select instead, which
    # materializes no ORM instance.
    await get_prompt_set(
        session, workspace_id=workspace_id, prompt_set_id=prompt_set_id
    )
    project_id = await prompt_set_project_id(session, prompt_set_id)
    texts = _import_texts(rows)
    await _enforce_import_binding(
        session,
        workspace_id=workspace_id,
        project_id=project_id,
        texts=texts,
    )
    # Project lock before the capacity lock: the order generation uses.
    await acquire_project_lock(session, project_id)
    approved = await prepare_prompt_inserts(
        session,
        workspace_id=workspace_id,
        prompt_set_id=prompt_set_id,
        texts=texts,
    )
    inserts = _first_row_per_approved_text(rows, texts, approved)
    topic_ids = await resolve_topics_by_name(
        session, project_id=project_id, names=(row.topic for row, _ in inserts)
    )
    for row, text in inserts:
        await _insert_imported_row(
            session,
            prompt_set_id=prompt_set_id,
            row=row,
            text=text,
            topic_id=topic_ids.get(row.topic.strip().lower()),
        )
    await session.commit()
    return await get_prompt_set(
        session, workspace_id=workspace_id, prompt_set_id=prompt_set_id
    )
