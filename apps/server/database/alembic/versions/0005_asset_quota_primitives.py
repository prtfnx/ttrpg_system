"""Add shared asset throttling and quota serialization primitives.

Revision ID: 0005_asset_quota_primitives
Revises: 0004_asset_deletion_outbox
Create Date: 2026-08-19
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005_asset_quota_primitives"
down_revision: Union[str, Sequence[str], None] = "0004_asset_deletion_outbox"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "asset_quota_state",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_asset_quota_state")),
    )
    op.execute(
        "INSERT INTO asset_quota_state (id, updated_at) "
        "VALUES (1, CURRENT_TIMESTAMP)"
    )

    op.create_table(
        "asset_rate_limit_buckets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("operation", sa.String(length=20), nullable=False),
        sa.Column("window_seconds", sa.Integer(), nullable=False),
        sa.Column("tokens", sa.Float(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_asset_rate_limit_buckets_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_asset_rate_limit_buckets")),
        sa.UniqueConstraint(
            "user_id",
            "operation",
            "window_seconds",
            name="uq_asset_rate_limit_bucket",
        ),
    )
    op.create_index(
        op.f("ix_asset_rate_limit_buckets_id"),
        "asset_rate_limit_buckets",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_asset_rate_limit_buckets_user_id"),
        "asset_rate_limit_buckets",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_asset_rate_limit_buckets_expires_at"),
        "asset_rate_limit_buckets",
        ["expires_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_asset_rate_limit_buckets_expires_at"),
        table_name="asset_rate_limit_buckets",
    )
    op.drop_index(
        op.f("ix_asset_rate_limit_buckets_user_id"),
        table_name="asset_rate_limit_buckets",
    )
    op.drop_index(
        op.f("ix_asset_rate_limit_buckets_id"),
        table_name="asset_rate_limit_buckets",
    )
    op.drop_table("asset_rate_limit_buckets")
    op.drop_table("asset_quota_state")
