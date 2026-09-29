"""Provisional-score cadence grows with progress without losing time freshness."""

import uuid

import pytest

from app.core.config.site_health_runtime import site_health_settings
from app.workers.site_health import score_refresh


def test_growth_target_is_fixed_between_refreshes(monkeypatch):
    monkeypatch.setattr(site_health_settings, "live_score_refresh_page_interval", 1)
    monkeypatch.setattr(site_health_settings, "live_score_refresh_page_fraction", 1)
    monkeypatch.setattr(
        site_health_settings, "live_score_refresh_min_interval_seconds", 0
    )
    cadence = score_refresh.ScoreRefreshCadence()
    crawl_id = uuid.uuid4()
    assert [cadence.admits(crawl_id) for _ in range(4)] == [True, True, False, True]


def test_large_fast_crawl_uses_fewer_rebuilds_and_slow_progress_still_refreshes(
    monkeypatch,
):
    now = [0.0]
    monkeypatch.setattr(score_refresh.time, "monotonic", lambda: now[0])
    monkeypatch.setattr(site_health_settings, "live_score_refresh_page_interval", 10)
    monkeypatch.setattr(site_health_settings, "live_score_refresh_page_fraction", 0.1)
    monkeypatch.setattr(
        site_health_settings, "live_score_refresh_min_interval_seconds", 5
    )
    cadence = score_refresh.ScoreRefreshCadence()
    crawl_id = uuid.uuid4()
    refreshed = [page for page in range(1, 501) if cadence.admits(crawl_id)]
    assert refreshed[:3] == [1, 11, 21]
    assert len(refreshed) < 35
    assert refreshed[-1] - refreshed[-2] > 40
    now[0] = 5.0
    assert cadence.admits(crawl_id)
    assert not cadence.admits(crawl_id)
    assert cadence.admits(uuid.uuid4())


@pytest.mark.parametrize("page_interval,time_interval", [(0, 5), (10, 0), (0, 0)])
def test_disabled_refresh_triggers_remain_disabled(
    monkeypatch, page_interval, time_interval
):
    now = [0.0]
    monkeypatch.setattr(score_refresh.time, "monotonic", lambda: now[0])
    monkeypatch.setattr(
        site_health_settings, "live_score_refresh_page_interval", page_interval
    )
    monkeypatch.setattr(site_health_settings, "live_score_refresh_page_fraction", 0)
    monkeypatch.setattr(
        site_health_settings, "live_score_refresh_min_interval_seconds", time_interval
    )
    cadence = score_refresh.ScoreRefreshCadence()
    crawl_id = uuid.uuid4()
    assert cadence.admits(crawl_id)
    for _ in range(10):
        due = cadence.admits(crawl_id)
    assert due is (page_interval > 0 or time_interval == 0)
    now[0] = 10.0
    assert cadence.admits(crawl_id) is (page_interval == 0)
