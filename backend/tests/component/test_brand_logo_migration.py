from __future__ import annotations

from alembic import command
from alembic.config import Config

from app.core.config import settings


def test_brand_logo_migration_applies_without_orm_drift(
    test_database_url: str, monkeypatch
) -> None:
    """Run the frozen baseline + additive revision on the throwaway test DB."""
    monkeypatch.setattr(settings, "database_url", test_database_url)
    config = Config("alembic.ini")

    command.upgrade(config, "head")
    command.check(config)
