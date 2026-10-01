from datetime import UTC, datetime, timedelta

import pytest

from app.domain.providers.app_routes import connection_paused
from app.models.provider import ProviderConnection


@pytest.mark.parametrize(
    ("paused", "until_seconds", "expected"),
    [
        (False, None, False),
        (True, None, True),
        (True, 1, True),
        (True, 0, False),
        (True, -1, False),
    ],
)
def test_connection_pause_deadline(paused, until_seconds, expected) -> None:
    """Retained Agent routes respect indefinite pauses and their exact expiry."""
    at = datetime(2026, 1, 1, tzinfo=UTC)
    connection = ProviderConnection(
        paused_at=at if paused else None,
        pause_until=None
        if until_seconds is None
        else at + timedelta(seconds=until_seconds),
    )
    assert connection_paused(connection, at=at) is expected
