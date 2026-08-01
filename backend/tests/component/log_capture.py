"""Shared log-capture helper for component/unit tests asserting telemetry.

Bind a capture handler DIRECTLY to each emitting logger (never caplog's
root): any earlier test that calls ``configure_logging()`` reconfigures the
root logger, after which root-level capture sees nothing in full-suite runs
(see test_error_envelope.py).

Each logger's LEVEL is also pinned for the capture window:
``configure_logging`` sets the root level to INFO, but any earlier test that
runs an alembic command (e.g. test_brand_logo_migration.py) re-reads
``alembic.ini`` via ``fileConfig`` and permanently resets the root level to
WARN. With the effective level above INFO the logger never even creates the
record, so binding a handler is not enough — the level must be forced down
(and restored afterwards).
"""

from __future__ import annotations

import logging
from collections.abc import Iterator
from contextlib import contextmanager


@contextmanager
def capture_log_messages(*logger_names: str) -> Iterator[list[str]]:
    """Capture the rendered messages emitted on the named loggers."""
    messages: list[str] = []

    class _Capture(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            messages.append(record.getMessage())

    bound: list[tuple[logging.Logger, logging.Handler, int]] = []
    for name in logger_names:
        target = logging.getLogger(name)
        handler = _Capture()
        previous = target.level
        target.addHandler(handler)
        target.setLevel(logging.INFO)
        bound.append((target, handler, previous))
    try:
        yield messages
    finally:
        for target, handler, previous in bound:
            target.removeHandler(handler)
            target.setLevel(previous)
