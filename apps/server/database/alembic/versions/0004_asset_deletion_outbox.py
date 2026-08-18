"""Add durable asset deletion outbox.

Revision ID: 0004_asset_deletion_outbox
Revises: 0003_shared_canvas_state
Create Date: 2026-08-17
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_asset_deletion_outbox"
down_revision: Union[str, Sequence[str], None] = "0003_shared_canvas_state"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "asset_deletion_jobs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("asset_id", sa.Integer(), nullable=False),
        sa.Column("r2_asset_id", sa.String(length=100), nullable=False),
        sa.Column("r2_key", sa.String(length=500), nullable=False),
        sa.Column("session_code", sa.String(length=20), nullable=True),
        sa.Column("requested_by", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("next_attempt_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["asset_id"],
            ["assets.id"],
            name=op.f("fk_asset_deletion_jobs_asset_id_assets"),
        ),
        sa.ForeignKeyConstraint(
            ["requested_by"],
            ["users.id"],
            name=op.f("fk_asset_deletion_jobs_requested_by_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_asset_deletion_jobs")),
    )
    op.create_index(
        op.f("ix_asset_deletion_jobs_id"),
        "asset_deletion_jobs",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_asset_deletion_jobs_asset_id"),
        "asset_deletion_jobs",
        ["asset_id"],
        unique=True,
    )
    op.create_index(
        op.f("ix_asset_deletion_jobs_status"),
        "asset_deletion_jobs",
        ["status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_asset_deletion_jobs_next_attempt_at"),
        "asset_deletion_jobs",
        ["next_attempt_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_asset_deletion_jobs_next_attempt_at"),
        table_name="asset_deletion_jobs",
    )
    op.drop_index(
        op.f("ix_asset_deletion_jobs_status"),
        table_name="asset_deletion_jobs",
    )
    op.drop_index(
        op.f("ix_asset_deletion_jobs_asset_id"),
        table_name="asset_deletion_jobs",
    )
    op.drop_index(
        op.f("ix_asset_deletion_jobs_id"),
        table_name="asset_deletion_jobs",
    )
    op.drop_table("asset_deletion_jobs")
