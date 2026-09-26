"""Bounded recovery by exact committed tag and product, never context guesses."""
# mypy: disable-error-code=attr-defined

from datetime import datetime

from app.connectors.answer_engines.errors import ProviderError
from app.connectors.search_surfaces.contracts import (
    ERROR_SUBMISSION_UNRECONCILED,
    OUTCOME_EXECUTION_FAILURE,
    SearchSurfaceResult,
    provider_cost_microusd,
)
from app.core.config import dataforseo as dataforseo_config
from app.core.config.dataforseo import RECONCILE_PAGE_SIZE, STATUS_OK
from app.core.config.llm_scraper import PRODUCTS, RECONCILE_MAX_PAGES
from app.core.config.provider_catalog import ERROR_PARSE
from app.workers.audit.search_surface_support import _listed_rows


def reconcile_page(listing, context, state):
    _validate_listing(listing)
    rows = _listed_rows(listing)
    matches = dict(state.get("matches") or {})
    for row in rows:
        if _matches(row, context):
            matches[row["id"]] = provider_cost_microusd(row)
    if len(matches) > 1:
        return {"ambiguous": True}, None
    offset = int(state.get("offset", 0)) + RECONCILE_PAGE_SIZE
    if len(rows) < RECONCILE_PAGE_SIZE:
        if len(matches) == 1:
            task_id, cost = next(iter(matches.items()))
            return {}, {"id": task_id, "cost": cost}
        return {"offset": 0, "matches": {}}, None
    if offset >= RECONCILE_MAX_PAGES * RECONCILE_PAGE_SIZE:
        return {"offset": 0, "matches": {}}, None
    return {"offset": offset, "matches": matches, "upper": state.get("upper")}, None


def _validate_listing(listing):
    if listing.get("status_code") != STATUS_OK:
        raise ProviderError(
            "Reconciliation unavailable", error_code=ERROR_PARSE, retryable=True
        )
    tasks = listing.get("tasks")
    if (
        not isinstance(tasks, list)
        or not tasks
        or any(
            not isinstance(task, dict) or task.get("status_code") != STATUS_OK
            for task in tasks
        )
    ):
        raise ProviderError(
            "Reconciliation unavailable", error_code=ERROR_PARSE, retryable=True
        )


def _matches(row, context):
    metadata = row.get("metadata")
    return (
        isinstance(metadata, dict)
        and isinstance(row.get("id"), str)
        and metadata.get("tag") == context.submission_ref
        and metadata.get("api") == "ai_optimization"
        and metadata.get("se") == PRODUCTS[context.logical_engine]
        and metadata.get("function") == "llm_scraper"
    )


class AuditScraperReconciliationMixin:
    async def _reconcile_scraper_page(self, context, adapter, lower, upper) -> bool:
        state = dict(context.reconciliation or {})
        if state.get("upper"):
            upper = datetime.fromisoformat(state["upper"])
        else:
            state["upper"] = upper.isoformat()
        try:
            listing = await adapter.list_task_ids(
                datetime_from=lower,
                datetime_to=upper,
                offset=int(state.get("offset", 0)),
            )
            next_state, match = reconcile_page(listing, context, state)
        except ProviderError as exc:
            await self._record_provider_exchange(context, error_code=exc.error_code)
            await self._park_submission_uncertain(
                context.task_id, context.audit_id, spend_poll=True
            )
            return True
        await self._record_provider_exchange(context)
        if next_state.get("ambiguous"):
            await self._finalize_scraper(
                context.task_id,
                context.audit_id,
                SearchSurfaceResult(
                    outcome=OUTCOME_EXECUTION_FAILURE,
                    error_code=ERROR_SUBMISSION_UNRECONCILED,
                ),
            )
            return False
        if match is not None:
            await self._park_awaiting_result(
                context.task_id,
                context.audit_id,
                provider_task_id=match["id"],
                cost_microusd=match["cost"],
                delay_seconds=dataforseo_config.FIRST_POLL_DELAY_SECONDS,
                reset_poll_count=True,
            )
            return True
        await self._park_submission_uncertain(
            context.task_id,
            context.audit_id,
            spend_poll=True,
            reconciliation=next_state,
        )
        return True
