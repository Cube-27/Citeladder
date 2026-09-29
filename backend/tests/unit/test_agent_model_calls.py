"""Provider execution consumes only the time left after dispatch persistence."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.domain.agent import model_calls


@pytest.mark.parametrize("elapsed", [4, 12])
async def test_dispatch_persistence_consumes_the_frozen_deadline(
    monkeypatch: pytest.MonkeyPatch, elapsed: int
) -> None:
    dispatched = datetime(2026, 1, 1, tzinfo=UTC)
    attempt = SimpleNamespace(
        id=uuid4(),
        dispatched_at=dispatched,
        deadline_at=dispatched + timedelta(seconds=10),
    )
    monkeypatch.setattr(
        model_calls, "start_model_attempt", AsyncMock(return_value=attempt)
    )
    monkeypatch.setattr(
        model_calls, "_utcnow", lambda: dispatched + timedelta(seconds=elapsed)
    )
    receipt = AsyncMock()
    failure = AsyncMock()
    monkeypatch.setattr(model_calls, "record_model_receipt", receipt)
    monkeypatch.setattr(model_calls, "record_model_failure", failure)
    gateway = SimpleNamespace(
        complete_structured=AsyncMock(return_value=SimpleNamespace(content="reply"))
    )
    wait_for = AsyncMock(wraps=model_calls.asyncio.wait_for)
    monkeypatch.setattr(model_calls.asyncio, "wait_for", wait_for)
    arguments = dict(
        run_id=uuid4(),
        owner="worker",
        ordinal=1,
        gateway=gateway,
        app_route=None,
        system="system",
        user="request",
        schema_name="step",
        schema={},
    )
    if elapsed < 10:
        result = await model_calls.call_model(AsyncMock(), **arguments)
        assert result.content == "reply"
        assert wait_for.call_args.kwargs["timeout"] == 6
        receipt.assert_awaited_once()
    else:
        with pytest.raises(model_calls.ModelUnavailableError):
            await model_calls.call_model(AsyncMock(), **arguments)
        gateway.complete_structured.assert_not_called()
        assert isinstance(failure.call_args.kwargs["exc"], TimeoutError)
