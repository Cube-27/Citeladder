"""The Site Health page rerun route.

Workspace-authorized like every Site Health route: a foreign or missing crawl
or URL is a 404, so a rerun can never target another workspace's evidence.
"""

from __future__ import annotations

import uuid

from fastapi import status

from app.core.errors import ApiException
from app.domain.site_health import service
from app.domain.site_health.api_schemas import RerunPageResponse
from app.domain.site_health.fetch_budget import SiteHealthFetchesExhaustedError
from app.domain.site_health.rerun import (
    RerunNotAllowedError,
    rerun_page,
)
from app.domain.site_health.selection import (
    MonitoringNotAllowedError,
    SelectionValidationError,
)
from app.domain.site_health.service import SiteHealthNotFoundError

from .common import _not_found, _RunDep, _SessionDep, router


@router.post(
    "/site-crawls/{crawl_id}/pages/{site_url_id}/rerun",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=RerunPageResponse,
)
async def rerun_page_endpoint(
    crawl_id: uuid.UUID,
    site_url_id: uuid.UUID,
    ctx: _RunDep,
    session: _SessionDep,
) -> RerunPageResponse:
    """Enqueue an explicit rerun of one page's analysis (202).

    Workspace-authorized via the page-detail lookup (a
    foreign/missing crawl or URL is a 404, never a coded selection error), so
    the rerun can never target another workspace's evidence.

    "Re-audit this page" is normally invoked from a COMPLETED (terminal) crawl.
    Because enqueuing into a terminal crawl would be cancelled by the worker,
    the domain layer mints a fresh single-page rerun crawl in that case. The
    202 body therefore carries the (possibly new) crawl identity + analysis
    status so the client polls the fresh run rather than the terminal source
    crawl: ``{crawl_id, site_url_id, task_id, created_new_crawl,
    analysis_status}``.
    """
    try:
        await service.get_page_detail(
            session,
            workspace_id=ctx.workspace_id,
            crawl_id=crawl_id,
            site_url_id=site_url_id,
        )
        crawl_summary = await service.get_crawl_summary(
            session, workspace_id=ctx.workspace_id, crawl_id=crawl_id
        )
    except SiteHealthNotFoundError as exc:
        raise _not_found(str(exc)) from exc

    try:
        result = await rerun_page(
            session,
            workspace_id=ctx.workspace_id,
            project_id=crawl_summary["project_id"],
            site_url_id=site_url_id,
        )
        await session.commit()
    except MonitoringNotAllowedError as exc:
        await session.rollback()
        raise ApiException.coded(status.HTTP_403_FORBIDDEN, exc.code, str(exc)) from exc
    except SiteHealthFetchesExhaustedError as exc:
        await session.rollback()
        raise ApiException.coded(status.HTTP_409_CONFLICT, exc.code, str(exc)) from exc
    except RerunNotAllowedError as exc:
        await session.rollback()
        raise ApiException.coded(status.HTTP_409_CONFLICT, exc.code, str(exc)) from exc
    except SelectionValidationError as exc:
        await session.rollback()
        raise ApiException.coded(
            status.HTTP_422_UNPROCESSABLE_CONTENT, exc.code, str(exc)
        ) from exc

    return RerunPageResponse(
        crawl_id=result.crawl_id,
        site_url_id=result.site_url_id,
        task_id=result.task_id,
        created_new_crawl=result.created_new_crawl,
        analysis_status=result.analysis_status,
    )
