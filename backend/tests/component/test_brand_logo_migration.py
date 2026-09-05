from __future__ import annotations

import os
import subprocess
import sys


def test_migration_applies_without_orm_drift(test_database_url: str) -> None:
    """Run the frozen baseline on the throwaway test DB, then check for drift.

    ``conftest`` builds the schema with ``Base.metadata.create_all``, so this is
    the suite's only check that ``0001_initial`` actually produces the schema
    the ORM expects.

    Run in a subprocess on purpose: Alembic's ``fileConfig`` reconfigures the
    root logger to WARNING for the whole process, which silently breaks log
    assertions in tests that run afterwards.
    """
    for argument in ("upgrade", "check"):
        completed = subprocess.run(  # noqa: S603 - fixed argv, no shell
            [sys.executable, "-m", "alembic", argument]
            + (["head"] if argument == "upgrade" else []),
            capture_output=True,
            text=True,
            env={**os.environ, "DATABASE_URL": test_database_url},
        )
        assert completed.returncode == 0, (
            f"alembic {argument} failed:\n{completed.stdout}\n{completed.stderr}"
        )
