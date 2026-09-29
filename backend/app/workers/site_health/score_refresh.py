"""Cadence gate for the live score-summary rebuild.

The rebuild reloads a crawl's whole measurement projection while holding the
crawl row and the profile row ``FOR UPDATE``. Running it once per analyzed page
therefore costs O(pages^2) and holds exactly the locks cancellation competes
for -- the contention recorded on ``_finalize_reconcile_outcome``, which is why
the user's Stop button once returned a 500.

This gate lives beside the caller rather than inside the refresh on purpose:
the refresh takes its lock before it can read anything, so a check in there
would already have paid the contention it exists to avoid. This one costs a
dict lookup -- no query, no lock.

It is deliberately in-process state. The mark is a display cadence, not a
fact: terminalization rebuilds the summary from persisted evidence regardless,
so a lost or duplicated mark can only refresh more often than configured,
never less.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from math import ceil

from app.core.config.site_health_runtime import site_health_settings


@dataclass
class _RefreshMark:
    refreshed_at: float
    observed: int = 1
    pending: int = 0


class ScoreRefreshCadence:
    """Refresh after a growing batch of analyses or the elapsed-time bound."""

    def __init__(self) -> None:
        self._marks: dict[uuid.UUID, _RefreshMark] = {}

    def admits(self, crawl_id: uuid.UUID) -> bool:
        """Whether this analysis should trigger a live summary rebuild."""
        page_interval = site_health_settings.live_score_refresh_page_interval
        min_interval = site_health_settings.live_score_refresh_min_interval_seconds
        if page_interval <= 0 and min_interval <= 0:
            return True
        now = time.monotonic()
        mark = self._marks.get(crawl_id)
        if mark is None:
            # A crawl's first analysis always refreshes, so the first score
            # card appears as promptly as it ever did. Stated as its own case
            # rather than leaning on a zero timestamp, which only read as due
            # while the elapsed trigger was enabled -- with it off, the first
            # card waited for a whole page interval.
            self._marks[crawl_id] = _RefreshMark(refreshed_at=now)
            self._prune()
            return True
        mark.observed += 1
        mark.pending += 1
        growing_interval = max(
            page_interval,
            ceil(
                (mark.observed - mark.pending)
                * site_health_settings.live_score_refresh_page_fraction
            ),
        )
        due = (page_interval > 0 and mark.pending >= growing_interval) or (
            min_interval > 0 and now - mark.refreshed_at >= min_interval
        )
        if due:
            mark.refreshed_at = now
            mark.pending = 0
        self._prune()
        return due

    def _prune(self) -> None:
        """Bound the table so a long-lived worker cannot accumulate crawls.

        Evicting the least recently refreshed crawl is safe on its own terms: a
        forgotten crawl simply refreshes once more than it strictly owed.
        """
        cap = site_health_settings.live_score_refresh_max_tracked_crawls
        if cap <= 0 or len(self._marks) <= cap:
            return
        stale = sorted(self._marks.items(), key=lambda item: item[1].refreshed_at)
        for crawl_id, _mark in stale[: len(self._marks) - cap]:
            self._marks.pop(crawl_id, None)
