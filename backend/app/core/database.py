"""Schema metadata only; importing models never configures a connection."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """The single metadata registry consumed by Alembic and schema tests."""
