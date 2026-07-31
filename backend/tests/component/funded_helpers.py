"""Shared helpers for funded-admission / ledger component tests (real Postgres).

Telemetry assertions bind a capture handler DIRECTLY to the emitting
``app.billing`` logger (never caplog's root): any earlier test that calls
``configure_logging()`` reconfigures the root logger, after which root-level
capture sees nothing in full-suite runs (see test_error_envelope.py).

The logger's LEVEL is also pinned for the capture window: ``configure_logging``
sets the root level to INFO, but any earlier test that runs an alembic command
(e.g. test_brand_logo_migration.py) re-reads ``alembic.ini`` via ``fileConfig``
and permanently resets the root level to WARN. With the effective level above
INFO the billing logger never even creates the record, so binding a handler is
not enough — the level must be forced down (and restored afterwards).
"""

from __future__ import annotations

import logging
from collections.abc import Iterator
from contextlib import contextmanager


@contextmanager
def capture_billing_events() -> Iterator[list[str]]:
    """Capture the rendered messages emitted on the ``app.billing`` logger."""
    messages: list[str] = []

    class _Capture(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            messages.append(record.getMessage())

    logger = logging.getLogger("app.billing")
    handler = _Capture()
    previous_level = logger.level
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    try:
        yield messages
    finally:
        logger.removeHandler(handler)
        logger.setLevel(previous_level)
