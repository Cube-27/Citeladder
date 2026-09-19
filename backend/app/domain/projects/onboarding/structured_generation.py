"""Validate bounded onboarding model responses without prompt repair."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable

from pydantic import BaseModel, ValidationError

from app.connectors.agent.gateway import ModelGateway
from app.connectors.answer_engines.errors import ProviderError
from app.core.config.provider_catalog import ERROR_AUTH, ERROR_RATE_LIMIT

logger = logging.getLogger(__name__)


async def complete_validated_envelope[EnvelopeT: BaseModel](
    client: ModelGateway,
    *,
    system: str,
    user: str,
    schema_name: str,
    envelope_type: type[EnvelopeT],
    validate: Callable[[EnvelopeT], None],
    maximum_attempts: int = 1,
    timeout_seconds: float | None = None,
) -> EnvelopeT:
    """Make at most ``maximum_attempts`` independent, validated model calls."""
    for attempt in range(1, maximum_attempts + 1):
        try:
            async with asyncio.timeout(timeout_seconds):
                raw = await client.complete_structured_json(
                    system=system,
                    user=user,
                    schema_name=schema_name,
                    schema=envelope_type.model_json_schema(),
                )
            envelope = envelope_type.model_validate_json(raw)
            validate(envelope)
            return envelope
        except ProviderError as exc:
            if (
                not exc.retryable
                or exc.error_code in {ERROR_AUTH, ERROR_RATE_LIMIT}
                or attempt == maximum_attempts
            ):
                raise
        except (TimeoutError, ValueError) as exc:
            logger.warning(
                "onboarding model response rejected",
                extra={
                    "schema_name": schema_name,
                    "attempt": attempt,
                    "error_type": type(exc).__name__,
                    "validation_paths": (
                        [".".join(map(str, item["loc"])) for item in exc.errors()[:10]]
                        if isinstance(exc, ValidationError)
                        else []
                    ),
                },
            )
            if attempt == maximum_attempts:
                raise
    raise RuntimeError("onboarding model attempts exhausted")
