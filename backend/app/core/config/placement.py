# Placement verification for actions performed on somebody else's page
# (invariant 1: config lives in core/config).
#
# Its own module rather than more surface on ``core/config/opportunities.py``,
# which owns the whole rule catalog and is at its module ceiling.
#
# The distinction this owner exists to hold: PLACEMENT LIVE and VISIBILITY
# MOVED are two observations. A listing can go up and the score not move; the
# score can move for reasons nothing to do with the listing. Reporting them as
# one outcome is the defect, so a placement check has its own states, its own
# evidence and its own section of the verification result.
from __future__ import annotations

from typing import Final

PLACEMENT_CHECKER_VERSION: Final = "placement-checker-1"

# The expected-check kind a declaration against an earned rule carries. It is
# never evaluated from an audit or a site crawl: a publisher's page is not in
# either of those, and an audit-triggered verification records it as
# unobservable rather than quietly passing it.
PLACEMENT_CHECK_KIND: Final = "placement"

# =========================================================================
# What a declaration says will change
# =========================================================================
# Derived from the RULE, so a correction verifies the discrepancy it named
# rather than merely that the brand now appears somewhere on the page.
PLACEMENT_CHANGE_BRAND_LISTED: Final = "brand_listed"
PLACEMENT_CHANGE_DISCREPANCY_RESOLVED: Final = "discrepancy_resolved"
PLACEMENT_CHANGE_PLACEMENT_RESTORED: Final = "placement_restored"
PLACEMENT_CHANGE_SOURCE_RESOLVED: Final = "source_resolved"

# =========================================================================
# Outcome of one check
# =========================================================================
# ``unavailable`` is a real answer and never decays into ``unmet``. A page we
# could not read, or read against a different roster, tells us nothing about
# whether the placement went live -- and reporting "we could not look" as "it
# did not happen" is the same error as reporting an unread page as an absence.
PLACEMENT_STATE_PENDING: Final = "pending"
PLACEMENT_STATE_SATISFIED: Final = "satisfied"
PLACEMENT_STATE_UNMET: Final = "unmet"
PLACEMENT_STATE_UNAVAILABLE: Final = "unavailable"

PLACEMENT_REASON_NO_BASELINE: Final = "no_frozen_baseline"
PLACEMENT_REASON_ROSTER_CHANGED: Final = "roster_changed"
PLACEMENT_REASON_COVERAGE: Final = "insufficient_coverage"
PLACEMENT_REASON_NO_VERDICT: Final = "no_brand_verdict"
PLACEMENT_REASON_UNKNOWN_CHANGE: Final = "unknown_expected_change"
PLACEMENT_REASON_EXHAUSTED: Final = "recheck_attempts_exhausted"

# Which unavailable answers a LATER reading could turn into a real verdict.
# Too little text and no brand verdict are properties of one reading: read the
# page again and it may settle. A missing baseline, a changed roster and an
# expectation nothing can check are properties of the CHECK, and no amount of
# re-reading changes them -- retrying those would spend the inspection budget
# forever on a question that has no answer.
PLACEMENT_RETRYABLE_REASONS: Final[frozenset[str]] = frozenset(
    {PLACEMENT_REASON_COVERAGE, PLACEMENT_REASON_NO_VERDICT}
)

# =========================================================================
# Recheck scheduling
# =========================================================================
# How long after a declaration the page is worth re-reading. A publisher does
# not publish the moment somebody emails them, and reading the page an hour
# later spends a budget unit to observe the state we already knew.
PLACEMENT_RECHECK_AFTER_HOURS: Final = 72
# And how long between attempts once the first one found nothing.
PLACEMENT_RECHECK_INTERVAL_HOURS: Final = 24 * 7
# After this many readings that did not find the change, the check stops
# asking. An open-ended recheck is an open-ended charge against the project's
# inspection budget for an outcome nobody is still waiting on.
PLACEMENT_RECHECK_MAX_ATTEMPTS: Final = 4
# Bounded read when admission asks which pages have a check due.
PLACEMENT_DUE_PAGES_MAX: Final = 100
