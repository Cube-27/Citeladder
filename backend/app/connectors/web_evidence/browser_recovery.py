"""Shared fallback projection for the final browser acquisition rung."""

from __future__ import annotations

from dataclasses import replace

from app.connectors.web_evidence.contracts import (
    AcquisitionProvenance,
    FetchCallTrace,
    FetchError,
    FetchRequest,
    FetchResult,
)


def prior_or_error(
    prior: FetchResult | None,
    fallback_error: FetchError | None,
    attempts: list[FetchCallTrace],
) -> FetchResult:
    """Return earlier evidence, or restore the error when no earlier rung ran."""
    if prior is not None:
        return replace(prior, attempts=tuple(attempts))
    assert fallback_error is not None
    fallback_error.attempts = tuple(attempts)
    raise fallback_error


def browser_result_or_prior(
    result: FetchResult,
    *,
    prior: FetchResult | None,
    fallback_error: FetchError | None,
    request: FetchRequest,
    attempts: list[FetchCallTrace],
    acquisition: AcquisitionProvenance,
    low_content_bytes: int,
) -> FetchResult:
    """Use a substantive render; otherwise retain evidence or the original error."""
    if result.decoded_bytes < low_content_bytes:
        return prior_or_error(prior, fallback_error, attempts)
    return replace(
        result,
        requested_url=request.url,
        attempts=tuple(attempts),
        acquisition=acquisition,
    )
