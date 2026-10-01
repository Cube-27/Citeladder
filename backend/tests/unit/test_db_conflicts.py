"""A lock conflict is not a failure of the work that lost it.

Postgres breaks a lock race by rolling one transaction back (deadlock,
serialization failure or lock timeout). Callers retry those; every other error
says something real and stays terminal.
"""

from __future__ import annotations

from sqlalchemy.exc import DBAPIError

from app.core.db_conflicts import is_transient_db_conflict


class _PgError(Exception):
    def __init__(self, sqlstate: str) -> None:
        super().__init__("deadlock detected")
        self.sqlstate = sqlstate


def _dbapi_error(sqlstate: str) -> DBAPIError:
    return DBAPIError("SELECT 1", {}, _PgError(sqlstate))


def test_deadlock_and_serialization_failures_are_transient() -> None:
    assert is_transient_db_conflict(_dbapi_error("40P01"))  # deadlock_detected
    assert is_transient_db_conflict(_dbapi_error("40001"))  # serialization_failure
    # `lock_timeout` raises this, and it was missing from the set: a sibling
    # holding a contended row just past the timeout killed the waiter outright,
    # with attempt_count AND conflict_count still 0 because the crash never
    # reached the retry path. Three tasks died that way in one measured crawl
    # and finalized it `partially_completed` -- a lock a second try would have
    # taken, reported to the user as pages that could not be analyzed.
    assert is_transient_db_conflict(_dbapi_error("55P03"))  # lock_not_available


def test_every_other_failure_stays_terminal() -> None:
    # A constraint violation, a bug, or a fetch error says something REAL about
    # the task; retrying it just burns the attempt budget.
    assert not is_transient_db_conflict(_dbapi_error("23505"))  # unique_violation
    assert not is_transient_db_conflict(ValueError("bad page"))
