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

from app.core.config.site_health_runtime import site_health_settings


class ScoreRefreshCadence:
    """Admit one live refresh per N analyses or T seconds, whichever is first."""

    def __init__(self) -> None:
        self._marks: dict[uuid.UUID, tuple[float, int]] = {}

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
            self._marks[crawl_id] = (now, 0)
            self._prune()
            return True
        last_at, pending = mark
        pending += 1
        due = (page_interval > 0 and pending >= page_interval) or (
            min_interval > 0 and now - last_at >= min_interval
        )
        self._marks[crawl_id] = (now, 0) if due else (last_at, pending)
        # Pruned on both paths. With the elapsed trigger disabled a crawl's
        # first analysis is not due, so an unseen crawl can enter the table
        # here without ever passing through the admitted branch.
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
        stale = sorted(self._marks.items(), key=lambda item: item[1][0])
        for crawl_id, _mark in stale[: len(self._marks) - cap]:
            self._marks.pop(crawl_id, None)
