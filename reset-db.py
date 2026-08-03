#!/usr/bin/env python3
"""Reset the Searchify database: drop, recreate, and run migrations."""

import asyncio
import asyncpg
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).parent / "backend"
DATABASE_URL = "postgresql://postgres:searchify_dev_password@127.0.0.1:55432/postgres"
TARGET_DB = "searchify"


async def reset_database() -> None:
    """Drop and recreate the searchify database."""
    print(f"Connecting to {DATABASE_URL}...")
    conn = await asyncpg.connect(DATABASE_URL)
    print(f"Dropping database '{TARGET_DB}' if exists...")
    await conn.execute(f'DROP DATABASE IF EXISTS "{TARGET_DB}" WITH (FORCE)')
    print(f"Creating database '{TARGET_DB}'...")
    await conn.execute(f'CREATE DATABASE "{TARGET_DB}"')
    await conn.close()
    print("Database reset complete.")


def run_migrations() -> None:
    """Run alembic migrations from the backend directory."""
    print("Running alembic migrations...")
    result = subprocess.run(
        ["uv", "run", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"Migration failed:\n{result.stderr}")
        sys.exit(1)
    print(result.stdout)
    print("Migrations complete.")


def main() -> None:
    print("=" * 50)
    print("Searchify Database Reset")
    print("=" * 50)

    asyncio.run(reset_database())
    run_migrations()

    print("=" * 50)
    print("Database reset and migrations completed successfully!")
    print("=" * 50)


if __name__ == "__main__":
    main()
