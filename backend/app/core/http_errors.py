# Shared HTTP error helpers for the API layer.
#
# One place to raise the repeated 404s so the detail strings stay consistent.
# The produced detail is exactly ``"{resource} not found"`` — callers pass the
# resource label ("Audit", "Workspace", "Project", "Prompt set", "Crawl") and
# get the byte-identical message the API has always returned. Raised as an
# ``ApiException`` (an ``HTTPException`` subclass) so the response carries the
# unified error envelope (WS-A A1) while any ``except HTTPException`` handling
# keeps working unchanged.
from __future__ import annotations

from typing import NoReturn

from fastapi import status

from app.core.config.errors import CODE_NOT_FOUND
from app.core.errors import ApiException


def raise_not_found(resource: str, *, cause: BaseException | None = None) -> NoReturn:
    """Raise a 404 ``ApiException`` whose detail is ``"{resource} not found"``.

    ``cause`` preserves explicit exception chaining (``raise ... from exc``) for
    the handlers that translate a domain "not found" into the HTTP response.
    """
    exc = ApiException(
        status.HTTP_404_NOT_FOUND, CODE_NOT_FOUND, f"{resource} not found"
    )
    if cause is not None:
        raise exc from cause
    raise exc
