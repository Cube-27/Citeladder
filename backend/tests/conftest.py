"""Shared test fixtures for the CiteLadder backend.

Uses an async Postgres database with a fresh, isolated schema per test (no
SQLite: the models use Postgres UUID columns). A throwaway
``citeladder_tests_<runid>`` database is created for the session and dropped on
teardown — nothing persists between runs and the dev database is never touched.

**The suite never reads ``.env``.** A developer ``.env`` carries real provider
keys, OAuth client secrets, and the Fernet encryption key; loading them turns
"is this provider configured?" branches ON inside tests, which is how a
component test once posted evidence to a live provider endpoint. So this module
sets ``CITELADDER_DISABLE_DOTENV`` and its own deterministic values in the
process environment BEFORE anything from ``app`` is imported (see
``app/core/config/dotenv.py``). Test configuration is declared here, in the
repository — identical on a laptop, in CI, and in review.

The one thing the suite cannot invent is a Postgres server. Export
``TEST_DATABASE_URL`` (preferred) or ``DATABASE_URL`` to point at one; without
either, the localhost default is tried and a clear error names both variables.
"""

from __future__ import annotations

import asyncio
import os
import re
import sys
import uuid
import warnings
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import asyncpg
import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

_BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

# --- Test configuration, before the first `app` import ---------------------
# Order matters: pydantic-settings reads env_file and environment at class
# definition time, so every one of these has to be set before `app.core.config`
# is imported below.

# The server the suite may create its throwaway database on. `.env` is NOT a
# source: the runner supplies this explicitly, or accepts the local default.
_DEFAULT_TEST_DATABASE_URL = (
    "postgresql+asyncpg://postgres:postgres@localhost:5432/citeladder"
)
_RESOLVED_DATABASE_URL = (
    os.environ.get("TEST_DATABASE_URL")
    or os.environ.get("DATABASE_URL")
    or _DEFAULT_TEST_DATABASE_URL
)

# Deterministic, non-secret stand-ins. These are published test values, not
# credentials: they exist so crypto-dependent code paths (Fernet encryption,
# JWT signing, referral hashing) run identically everywhere. They must not be
# any of the shipped placeholders, which `encryption_key_configured` treats as
# MISSING so a real deployment fails closed.
_TEST_ENVIRONMENT = {
    "CITELADDER_DISABLE_DOTENV": "1",
    "DATABASE_URL": _RESOLVED_DATABASE_URL,
    "APP_ENV": "development",
    # Keep operator tests independent of inherited production redirect origins.
    "FRONTEND_URL": "http://127.0.0.1:3000",
    "MCP_PUBLIC_BASE_URL": "http://127.0.0.1:3000",
    "JWT_SECRET_KEY": "citeladder-test-jwt-secret-key-not-a-real-secret",
    "ENCRYPTION_KEY": "citeladder-test-encryption-key-not-a-real-secret",
    "REFERRAL_HASH_SALT": "citeladder-test-referral-salt-not-a-real-secret",
    # Registration is off by default; the suite creates its users through it.
    "PUBLIC_SIGNUP_ENABLED": "true",
}
for _name, _value in _TEST_ENVIRONMENT.items():
    os.environ[_name] = _value

# Any provider credential inherited from the shell would defeat the point, so
# they are cleared too: `.env` is disabled, but an exported key is not.
_PROVIDER_CREDENTIAL_SUFFIXES = ("_API_KEY", "_CLIENT_SECRET", "_CLIENT_ID")
# The default agent is "configured" only when base URL, model, AND key are all
# present. The endpoint identity is cleared with the key so no shell value can
# reconstitute the trio and turn the "is this provider configured?" branch on.
_DEFAULT_AGENT_VARIABLES = (
    "DEFAULT_AGENT_BASE_URL",
    "DEFAULT_AGENT_MODEL",
)
for _name in [
    name
    for name in os.environ
    if name.isupper()
    and (
        name.endswith(_PROVIDER_CREDENTIAL_SUFFIXES)
        or name.startswith(("BILLING_", "RAZORPAY_"))
    )
] + list(_DEFAULT_AGENT_VARIABLES):
    os.environ.pop(_name, None)

from app.core.config import settings  # noqa: E402
from app.core.database import Base  # noqa: E402

_TEST_RUN_ID = uuid.uuid4().hex[:12]
_TEST_SCHEMA = f"test_{re.sub(r'[^a-zA-Z0-9_]', '_', _TEST_RUN_ID)}"


# Between-test cleanup, as one round trip. Raw SQL bypasses the engine's
# ``schema_translate_map`` (which only rewrites SQLAlchemy constructs), so the
# schema is spelled out here.
#
# This deliberately uses DELETE rather than TRUNCATE. TRUNCATE is the faster
# choice for large tables, but it takes an ACCESS EXCLUSIVE lock and rewrites
# (and fsyncs) each table's storage even when the table is already empty —
# across 67 mostly-empty test tables that measured ~1280ms per test, i.e. the
# dominant cost of the whole suite. DELETE on an empty table is a no-op seq
# scan; the same cleanup measured ~8ms, a ~167x improvement.
#
# The statements are wrapped in a DO block because asyncpg sends statements as
# prepared statements and refuses multiple commands in one — the DO block is a
# single command, so all 67 deletes still cost one round trip.
#
# Order matters for DELETE (unlike TRUNCATE ... CASCADE): a parent row cannot go
# while a child still references it. ``sorted_tables`` is dependency order
# (parents first), so it is reversed here to delete children first.
# ``SET CONSTRAINTS ALL DEFERRED`` covers the FK cycles between the audit-task /
# artifact tables that make a total order impossible; it is a no-op for
# non-deferrable constraints rather than an error.
#
# NOTE: do NOT try to narrow this to "only non-empty tables" using
# ``pg_class.reltuples`` / ``relpages`` / ``pg_stat_all_tables.n_live_tup``.
# Those counters are estimates: ``reltuples`` is ``-1`` on a never-analyzed
# table (so it matches every freshly created table, narrowing nothing), while
# ``relpages`` and ``n_live_tup`` still read 0 immediately after an insert, so
# genuinely written tables get skipped and their rows leak into the next test.
def _cleanup_sql() -> str:
    # Resolve after test collection has imported the models, just as create_all
    # does. The retired web router no longer imports every table at bootstrap.
    with warnings.catch_warnings():
        # Deferred constraints above make the artifact/task cycle safe.
        warnings.simplefilter("ignore")
        delete_order = list(reversed(Base.metadata.sorted_tables))
    # Ledger history RESTRICT-references tasks; remove it before deleting a
    # snapshot/audit can cascade into the artifact/task cycle.
    delete_order.sort(key=lambda table: table.name != "consumable_ledger")
    return "DO $$ BEGIN SET CONSTRAINTS ALL DEFERRED; {deletes} END $$;".format(
        deletes="".join(
            f'DELETE FROM "{_TEST_SCHEMA}"."{table.name}";'  # noqa: S608 - names come from SQLAlchemy metadata, never a request
            for table in delete_order
        )
    )


@pytest.fixture(autouse=True)
def _pin_site_health_sample_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    """Isolate the suite from dev ``.env`` sample-policy overrides.

    The neutral Site Health sample policy is settings-driven (the dev ``.env``
    ships a raised ``SITE_HEALTH_SAMPLE_URL_LIMIT`` for full-feature testing).
    Tests assert the SHIPPED defaults, so pin both the analysis budget and the
    decoupled inventory cap back to their constants for every test regardless
    of the developer's local env.
    """
    from app.core.config.site_health_crawl_policy import (
        SAMPLE_DISCOVERY_URL_CAP,
        SAMPLE_URL_LIMIT,
    )
    from app.core.config.site_health_runtime import (
        site_health_settings,
    )

    monkeypatch.setattr(site_health_settings, "sample_url_limit", SAMPLE_URL_LIMIT)
    monkeypatch.setattr(
        site_health_settings, "sample_discovery_url_cap", SAMPLE_DISCOVERY_URL_CAP
    )


@pytest.fixture(scope="session")
def test_database_url() -> Iterator[str]:
    """Create a throwaway session database on the configured Postgres server.

    Reuses the server (host/port/credentials) resolved at import time from
    ``TEST_DATABASE_URL`` / ``DATABASE_URL`` — never from ``.env`` — but never
    touches that server's own database: a dedicated
    ``citeladder_tests_<runid>`` database is created up front and force-dropped
    on teardown, so test state can never persist between runs.
    """
    base = make_url(settings.database_url)
    db_name = f"citeladder_tests_{_TEST_RUN_ID}"
    admin_dsn = base.set(drivername="postgresql", database="postgres").render_as_string(
        hide_password=False
    )

    async def _admin_execute(statement: str) -> None:
        conn = await asyncpg.connect(dsn=admin_dsn)
        try:
            await conn.execute(statement)
        finally:
            await conn.close()

    try:
        asyncio.run(_admin_execute(f'CREATE DATABASE "{db_name}"'))
    except (OSError, asyncpg.PostgresError) as exc:
        # The suite deliberately does not read `.env`, so a developer whose
        # Postgres is not on the default host/port has to say where it is. Say
        # exactly that, rather than surfacing a bare connection refusal.
        raise pytest.UsageError(
            f"Cannot reach Postgres at {base.host}:{base.port} as "
            f"{base.username!r} ({type(exc).__name__}: {exc}).\n"
            "The test suite never reads .env. Export TEST_DATABASE_URL (or "
            "DATABASE_URL) with the server it should create its throwaway "
            "test database on, for example:\n"
            "  $env:TEST_DATABASE_URL = "
            "'postgresql+asyncpg://postgres:<password>@127.0.0.1:5432/citeladder'"
        ) from exc
    try:
        yield base.set(database=db_name).render_as_string(hide_password=False)
    finally:
        # FORCE (PG13+) disconnects any lingering sessions before the drop.
        asyncio.run(_admin_execute(f'DROP DATABASE IF EXISTS "{db_name}" WITH (FORCE)'))


@pytest_asyncio.fixture(scope="session")
async def _schema_engine(test_database_url: str) -> AsyncIterator[AsyncEngine]:
    """Build the test schema ONCE per session and yield a scoped engine.

    Creating ``Base.metadata`` per test is prohibitively slow: the models carry
    67 tables and 184 indexes, so a per-test ``create_all`` costs ~250 DDL
    round-trips *per test* (~1s of setup each, minutes of CI wall-clock across
    the suite). The schema is immutable during a run, so it is built once and
    every test reuses it; isolation comes from truncating rows between tests
    (see ``session_factory``), which is orders of magnitude cheaper than DDL.

    The engine — and therefore its connection pool — is session-scoped for the
    same reason: a per-test engine reconnects to Postgres on every test.
    """
    quoted = f'"{_TEST_SCHEMA}"'
    engine = create_async_engine(test_database_url, future=True, echo=False)
    scoped_engine = engine.execution_options(schema_translate_map={None: _TEST_SCHEMA})
    async with engine.begin() as conn:
        await conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {quoted}"))
    async with scoped_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    try:
        yield scoped_engine
    finally:
        await engine.dispose()


@pytest_asyncio.fixture
async def session_factory(
    _schema_engine: AsyncEngine,
) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    """Yield a session factory bound to the shared per-session test schema.

    Every table is emptied on teardown so tests never leak state into each
    other — the same isolation the old per-test schema gave, without paying to
    rebuild the schema each time. See ``_CLEANUP_SQL`` for why that is a batched
    DELETE rather than a TRUNCATE.

    The factory stays bound to the shared engine (rather than to a single
    connection inside an outer transaction that gets rolled back) because the
    queue tests exercise ``SELECT ... FOR UPDATE SKIP LOCKED`` from concurrent
    sessions: they need genuinely separate connections, which a rollback-based
    fixture could not give them.

    The keyword arguments MUST mirror ``app.core.database.SessionLocal``.
    ``autoflush`` was the one that did not: production disables it, the fixture
    inherited SQLAlchemy's ``True``, and so every component test ran with
    different write-visibility semantics than the code it was testing. Under
    that gap a ``session.add`` followed by a SELECT read back the pending row
    in tests and silently did not in production — which let the crawl-finalize
    issues ship missing from every snapshot rollup while the test asserting
    ``snapshot.issue_count == len(issues)`` passed.
    """
    factory = async_sessionmaker(
        _schema_engine,
        expire_on_commit=False,
        class_=AsyncSession,
        autoflush=False,
    )
    cleanup_sql = _cleanup_sql()
    try:
        yield factory
    finally:
        async with _schema_engine.begin() as conn:
            await conn.execute(text(cleanup_sql))


@pytest_asyncio.fixture
async def db_session(
    session_factory: async_sessionmaker[AsyncSession],
) -> AsyncIterator[AsyncSession]:
    async with session_factory() as session:
        yield session
