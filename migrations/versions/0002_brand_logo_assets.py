"""Add the shared database-backed brand logo cache.

Revision ID: 0002_brand_logo_assets
Revises: 0001_initial
Create Date: 2026-07-27
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0002_brand_logo_assets"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "brand_logo_assets",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("domain", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("source_url", sa.String(length=2048), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("image_data", sa.LargeBinary(), nullable=True),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("retry_after", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("domain", name="uq_brand_logo_asset_domain"),
    )
    op.add_column("brands", sa.Column("logo_asset_id", sa.UUID(), nullable=True))
    op.create_index(
        "ix_brands_logo_asset_id", "brands", ["logo_asset_id"], unique=False
    )
    op.create_foreign_key(
        "fk_brands_logo_asset_id_brand_logo_assets",
        "brands",
        "brand_logo_assets",
        ["logo_asset_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.add_column(
        "competitors", sa.Column("logo_asset_id", sa.UUID(), nullable=True)
    )
    op.create_index(
        "ix_competitors_logo_asset_id",
        "competitors",
        ["logo_asset_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_competitors_logo_asset_id_brand_logo_assets",
        "competitors",
        "brand_logo_assets",
        ["logo_asset_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_competitors_logo_asset_id_brand_logo_assets",
        "competitors",
        type_="foreignkey",
    )
    op.drop_index("ix_competitors_logo_asset_id", table_name="competitors")
    op.drop_column("competitors", "logo_asset_id")
    op.drop_constraint(
        "fk_brands_logo_asset_id_brand_logo_assets",
        "brands",
        type_="foreignkey",
    )
    op.drop_index("ix_brands_logo_asset_id", table_name="brands")
    op.drop_column("brands", "logo_asset_id")
    op.drop_table("brand_logo_assets")
