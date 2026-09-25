"""The Search Console loop leg: synced, due for a sync, or still awaited."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from app.domain.opportunities.measurement_legs import search_console_state

_DECLARED = datetime(2026, 9, 1, 15, 0, tzinfo=UTC)


def test_a_window_still_running_after_the_declaration_is_awaited() -> None:
    state, ready_at = search_console_state(
        declared_at=_DECLARED, window_end=date(2026, 9, 20), now=_DECLARED
    )

    assert state == "waiting"
    assert ready_at > _DECLARED + timedelta(days=28)


def test_a_closed_window_without_synced_data_asks_for_a_sync() -> None:
    _state, ready_at = search_console_state(
        declared_at=_DECLARED, window_end=None, now=_DECLARED
    )

    state, _ = search_console_state(
        declared_at=_DECLARED, window_end=None, now=ready_at
    )

    assert state == "sync_needed"


def test_a_synced_window_covering_the_full_period_is_observed() -> None:
    state, _ = search_console_state(
        declared_at=_DECLARED,
        window_end=date(2026, 9, 29),
        now=_DECLARED + timedelta(days=40),
    )

    assert state == "observed"
