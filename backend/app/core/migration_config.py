"""Connection configuration for Alembic, independent of application startup."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field

from sqlalchemy.engine import URL, make_url
from sqlalchemy.exc import ArgumentError

from app.core.config.dotenv import schema_environment

_LOCAL_ENVIRONMENTS = frozenset({"", "development", "dev", "local", "test", "testing"})


@dataclass(frozen=True)
class MigrationConfig:
    url: URL = field(repr=False)
    ssl: str

    def connect_args(self) -> dict[str, object]:
        return {"ssl": self.ssl, "timeout": 10, "command_timeout": 30}


def migration_config(env: Mapping[str, str] | None = None) -> MigrationConfig:
    values = schema_environment(env)
    url = _database_url(values)
    ssl = _ssl_mode(values, url)
    return MigrationConfig(
        url.set(drivername="postgresql+asyncpg").difference_update_query(
            ["ssl", "sslmode"]
        ),
        ssl,
    )


def _database_url(values: Mapping[str, str]) -> URL:
    try:
        url = make_url(values.get("DATABASE_URL", ""))
        if url.drivername not in {"postgresql", "postgresql+asyncpg"}:
            raise ValueError
        if not url.host or not url.database:
            raise ValueError
        if url.port is not None and not 1 <= url.port <= 65535:
            raise ValueError
    except (ArgumentError, TypeError, ValueError):
        raise ValueError(
            "DATABASE_URL must name a PostgreSQL database and host"
        ) from None
    return url


def _ssl_mode(values: Mapping[str, str], url: URL) -> str:
    ssl = values.get("DB_SSL_MODE", "disable")
    query_ssl = url.query.get("ssl", url.query.get("sslmode"))
    if "ssl" in url.query and "sslmode" in url.query:
        if url.query["ssl"] != url.query["sslmode"]:
            raise ValueError("Conflicting migration URL TLS modes")
    if query_ssl is not None:
        if query_ssl not in {"disable", "require"}:
            raise ValueError("Migration URL TLS mode must be disable or require")
        if "DB_SSL_MODE" in values and ssl != query_ssl:
            raise ValueError("Conflicting migration database TLS modes")
        ssl = str(query_ssl)
    if ssl not in {"disable", "require"}:
        raise ValueError("DB_SSL_MODE must be disable or require")
    if values.get("APP_ENV", "development").strip().lower() not in _LOCAL_ENVIRONMENTS:
        if ssl != "require":
            raise ValueError("DB_SSL_MODE must be require outside development/test")
    return ssl
