"""Alembic admission depends on the database, never on application secrets."""

import pytest

from app.core.migration_config import migration_config


def test_migration_config_preserves_encoded_credentials_and_tls() -> None:
    config = migration_config(
        {
            "CITELADDER_DISABLE_DOTENV": "1",
            "APP_ENV": "production",
            "DATABASE_URL": "postgresql://fixture:encoded%40%25password@database.test/app?sslmode=require",
            "JWT_SECRET_KEY": "unset",
        }
    )
    assert config.url.drivername == "postgresql+asyncpg"
    assert config.url.password == "encoded@%password"
    assert not config.url.query
    assert config.connect_args()["ssl"] == "require"
    assert "password" not in repr(config)


@pytest.mark.parametrize(
    "updates",
    [
        {"DATABASE_URL": "postgresql://fixture:private@localhost:bad/app"},
        {"DATABASE_URL": "invalid-private-url"},
        {"DATABASE_URL": "sqlite:///private.db"},
        {"DATABASE_URL": "postgresql://fixture:private@localhost/"},
        {"DB_SSL_MODE": "prefer"},
        {"APP_ENV": "production"},
        {
            "DATABASE_URL": "postgresql://fixture:private@localhost/app?ssl=require",
            "DB_SSL_MODE": "disable",
        },
        {
            "DATABASE_URL": "postgresql://fixture:private@localhost/app?ssl=require&sslmode=disable"
        },
    ],
)
def test_migration_refusals_are_redacted(updates: dict[str, str]) -> None:
    with pytest.raises(ValueError) as error:
        migration_config(
            {
                "CITELADDER_DISABLE_DOTENV": "1",
                "DATABASE_URL": "postgresql://fixture:private@localhost/app",
                **updates,
            }
        )
    assert "private" not in str(error.value)


def test_migrations_accept_case_insensitive_explicit_aliases() -> None:
    config = migration_config(
        {
            "CITELADDER_DISABLE_DOTENV": "1",
            "database_url": "postgresql+asyncpg://fixture:private@localhost/app",
            "db_ssl_mode": "disable",
        }
    )
    assert config.url.database == "app"
    assert config.ssl == "disable"
