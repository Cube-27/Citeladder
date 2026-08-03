"""Grounded visibility greenfield replacement.

Revision ID: 0002_grounded_visibility
Revises: 0001_initial
Create Date: 2026-08-03
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import Text
from sqlalchemy.dialects import postgresql

revision = "0002_grounded_visibility"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "brand_discoveries",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("workspace_id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("stage", sa.String(length=32), nullable=False),
        sa.Column("input_data", postgresql.JSONB(astext_type=Text()), nullable=False),
        sa.Column("profile", postgresql.JSONB(astext_type=Text()), nullable=False),
        sa.Column("domains", postgresql.JSONB(astext_type=Text()), nullable=False),
        sa.Column("competitors", postgresql.JSONB(astext_type=Text()), nullable=False),
        sa.Column("topics", postgresql.JSONB(astext_type=Text()), nullable=False),
        sa.Column("evidence", postgresql.JSONB(astext_type=Text()), nullable=False),
        sa.Column("gaps", postgresql.JSONB(astext_type=Text()), nullable=False),
        sa.Column("error_detail", sa.Text(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("available_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("lease_owner", sa.String(length=64), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["workspace_id"], ["workspaces.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "workspace_id", "idempotency_key", name="uq_brand_discovery_idempotency"
        ),
    )
    op.create_index(
        op.f("ix_brand_discoveries_workspace_id"),
        "brand_discoveries",
        ["workspace_id"],
    )
    op.create_index(
        op.f("ix_brand_discoveries_status"), "brand_discoveries", ["status"]
    )
    op.create_index(
        op.f("ix_brand_discoveries_available_at"),
        "brand_discoveries",
        ["available_at"],
    )

    op.add_column(
        "prompts",
        sa.Column(
            "cohort", sa.String(length=16), server_default="core", nullable=False
        ),
    )
    op.create_index(op.f("ix_prompts_cohort"), "prompts", ["cohort"])
    op.add_column(
        "audit_prompt_snapshots",
        sa.Column(
            "cohort", sa.String(length=16), server_default="core", nullable=False
        ),
    )
    op.create_index(
        op.f("ix_audit_prompt_snapshots_cohort"),
        "audit_prompt_snapshots",
        ["cohort"],
    )
    op.add_column(
        "response_analyses",
        sa.Column(
            "cohort", sa.String(length=16), server_default="core", nullable=False
        ),
    )
    op.create_index(
        op.f("ix_response_analyses_cohort"), "response_analyses", ["cohort"]
    )

    op.execute(
        "UPDATE prompts SET cohort = CASE WHEN branded "
        "THEN 'comparison' ELSE 'core' END"
    )
    op.execute("UPDATE audits SET measurement_mode = 'pulse' WHERE status = 'draft'")
    op.alter_column("audits", "measurement_mode", server_default="pulse")

    # Development-only destructive replacement: incompatible derived rows are
    # rebuilt from immutable raw artifacts under scoring-v2.
    op.execute("DELETE FROM citations")
    op.execute("DELETE FROM competitor_mentions")
    op.execute("DELETE FROM brand_mentions")
    op.execute("DELETE FROM response_analyses")
    op.execute("DELETE FROM metric_snapshots")

    # Stored connection rows identify credentials/transports only. Their model
    # field is normalized to the Pulse route and is no longer used for planning.
    op.execute(
        """
        UPDATE provider_routes
        SET transport_model = CASE logical_engine
          WHEN 'chatgpt' THEN 'gpt-5.4-nano-2026-03-17'
          WHEN 'claude' THEN 'claude-haiku-4-5-20251001'
          WHEN 'gemini' THEN 'gemini-3.5-flash-lite'
          ELSE transport_model
        END
        """
    )


def downgrade() -> None:
    op.alter_column("audits", "measurement_mode", server_default="benchmark")
    op.drop_index(op.f("ix_response_analyses_cohort"), table_name="response_analyses")
    op.drop_column("response_analyses", "cohort")
    op.drop_index(
        op.f("ix_audit_prompt_snapshots_cohort"),
        table_name="audit_prompt_snapshots",
    )
    op.drop_column("audit_prompt_snapshots", "cohort")
    op.drop_index(op.f("ix_prompts_cohort"), table_name="prompts")
    op.drop_column("prompts", "cohort")
    op.drop_index(
        op.f("ix_brand_discoveries_available_at"), table_name="brand_discoveries"
    )
    op.drop_index(op.f("ix_brand_discoveries_status"), table_name="brand_discoveries")
    op.drop_index(
        op.f("ix_brand_discoveries_workspace_id"), table_name="brand_discoveries"
    )
    op.drop_table("brand_discoveries")
