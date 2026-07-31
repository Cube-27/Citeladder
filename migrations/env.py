# Alembic async environment, bound to app.models Base.metadata.
from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from app.core.config import settings

# Importing the models package populates Base.metadata as B2+ add model
# modules; autogenerate targets this single metadata object.
from app.models import Base
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    # ``disable_existing_loggers=False`` is REQUIRED, not cosmetic. The
    # fileConfig default (True) sets ``disabled = True`` on every logger that
    # already exists but is not named in alembic.ini — which, whenever
    # migrations run in-process after the app is imported, silently mutes the
    # application's own loggers (``app.core.errors`` among them) for the rest
    # of the process. That is how a run of the test suite lost the
    # unhandled-exception log line the 500 handler is required to emit, and it
    # would do the same to any host that runs `alembic upgrade` in-process
    # before serving.
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
