"""Observable search-query summaries over persisted complete selections."""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field
from uuid import UUID

from app.core.config.analysis import VISIBILITY_EVIDENCE_DEFAULT_LIMIT
from app.domain.analysis.evidence import (
    _assert_selected_audit,
    _evidence_statement,
    _fanout_state,
    _select_events,
    _validated_evidence_request,
)
from app.domain.analysis.schemas import FanoutAnswer, FanoutQueryRow, FanoutResponse


@dataclass
class _QueryCounts:
    events: int = 0
    prompts: set[str] = field(default_factory=set)
    engines: set[str] = field(default_factory=set)
    responses: set[UUID] = field(default_factory=set)
    brand: set[UUID] = field(default_factory=set)


async def get_visibility_fanout(
    session,
    *,
    workspace_id,
    project_id,
    audit_id=None,
    logical_engine=None,
    cohort="core",
    offset=0,
    limit=VISIBILITY_EVIDENCE_DEFAULT_LIMIT,
    query=None,
    audit_ids=None,
):
    _validated_evidence_request(
        logical_engine=logical_engine,
        from_at=None,
        to_at=None,
        limit=limit,
        cohort=cohort,
    )
    await _assert_selected_audit(
        session, workspace_id=workspace_id, project_id=project_id, audit_id=audit_id
    )
    from app.domain.analysis.selection import authorize_run_set
    from app.models.analysis import ResponseAnalysis

    await authorize_run_set(
        session, workspace_id=workspace_id, project_id=project_id, audit_ids=audit_ids
    )
    statement = _evidence_statement(
        workspace_id=workspace_id,
        project_id=project_id,
        audit_id=audit_id,
        prompt_id=None,
        logical_engine=logical_engine,
        from_at=None,
        to_at=None,
        limit=None,
        cohort=cohort,
    )
    if audit_ids:
        statement = statement.where(ResponseAnalysis.audit_id.in_(audit_ids))
    states: Counter[str] = Counter()
    queries: defaultdict[str, _QueryCounts] = defaultdict(_QueryCounts)
    total_events = 0
    answers = []
    total_answers = 0
    stream = await session.stream(statement)
    async for analysis, task, prompt, _audit, artifact in stream:
        events, _source = _select_events(artifact, task)
        _, state = _fanout_state(
            events=events,
            search_used=bool(analysis.search_used),
            search_query_count=int(analysis.search_query_count or 0),
        )
        states[state] += 1
        total_events += len(events)
        if query is not None and any(event.query.strip() == query for event in events):
            if offset <= total_answers < offset + limit:
                answers.append(
                    FanoutAnswer(
                        audit_id=analysis.audit_id,
                        task_id=analysis.task_id,
                        prompt_text=prompt.text,
                        logical_engine=analysis.logical_engine,
                        brand_mentioned=analysis.brand_mentioned,
                        owned_domain_cited=analysis.owned_domain_cited,
                    )
                )
            total_answers += 1
        _record_queries(queries, events, analysis, prompt)
    ordered = sorted(queries.items(), key=lambda item: (-item[1].events, item[0]))
    # `offset` pages whichever list the caller is reading. Drilling into one
    # query's answers must not also scroll the query table out from under it —
    # past the first page of answers the table came back empty, because the
    # same offset had been applied to a list that had nothing that far down.
    query_rows = ordered[offset : offset + limit] if query is None else ordered[:limit]
    return FanoutResponse(
        event_count=total_events,
        distinct_queries=len(ordered),
        coverage=dict(states),
        next_offset=offset + limit
        if offset + limit < (total_answers if query is not None else len(ordered))
        else None,
        answers=answers,
        total_answers=total_answers,
        items=[
            FanoutQueryRow(
                query=text,
                event_count=item.events,
                prompt_count=len(item.prompts),
                engines=sorted(item.engines),
                response_count=len(item.responses),
                brand_response_count=len(item.brand),
            )
            for text, item in query_rows
        ],
    )


def _record_queries(queries, events, analysis, prompt):
    for event in events:
        text = event.query.strip()
        if not text:
            continue
        item = queries[text]
        item.events += 1
        item.prompts.add(str(prompt.prompt_id) if prompt.prompt_id else prompt.text)
        item.engines.add(analysis.logical_engine)
        item.responses.add(analysis.id)
        if analysis.brand_mentioned:
            item.brand.add(analysis.id)
