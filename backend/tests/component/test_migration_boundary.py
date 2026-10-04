"""Canonical baseline initialization and drift refusal on disposable data."""

import asyncio
import os
import subprocess
import sys
from pathlib import Path

import asyncpg
from sqlalchemy.engine import make_url


def test_baseline_upgrade_is_repeatable_and_check_refuses_stamped_drift(
    test_database_url: str,
) -> None:
    environment = {
        **os.environ,
        "CITELADDER_DISABLE_DOTENV": "1",
        "APP_ENV": "test",
        "DATABASE_URL": test_database_url,
        "DB_SSL_MODE": "disable",
    }

    def alembic(*args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(  # noqa: S603 - fixed interpreter and schema CLI on disposable data
            [sys.executable, "-m", "alembic", *args],
            cwd=Path(__file__).resolve().parents[2],
            env=environment,
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )

    assert alembic("upgrade", "head").returncode == 0
    assert alembic("check").returncode == 0
    assert alembic("upgrade", "head").returncode == 0
    dsn = (
        make_url(test_database_url)
        .set(drivername="postgresql")
        .render_as_string(hide_password=False)
    )

    async def drift() -> None:
        connection = await asyncpg.connect(dsn)
        try:
            await connection.execute(
                "ALTER TABLE users ADD COLUMN unexpected_schema_drift integer"
            )
        finally:
            await connection.close()

    asyncio.run(drift())
    result = alembic("check")
    assert result.returncode != 0
    assert "unexpected_schema_drift" in result.stdout + result.stderr
