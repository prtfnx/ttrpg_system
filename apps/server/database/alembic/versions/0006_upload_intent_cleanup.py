"""Add durable cleanup state for abandoned upload intents.

Revision ID: 0006_upload_intent_cleanup
Revises: 0005_asset_quota_primitives
Create Date: 2026-08-20
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006_upload_intent_cleanup"
down_revision: Union[str, Sequence[str], None] = "0005_asset_quota_primitives"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "asset_upload_intents",
        sa.Column(
            "cleanup_attempts",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "asset_upload_intents",
        sa.Column("cleanup_next_attempt_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        op.f("ix_asset_upload_intents_cleanup_next_attempt_at"),
        "asset_upload_intents",
        ["cleanup_next_attempt_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_asset_upload_intents_cleanup_next_attempt_at"),
        table_name="asset_upload_intents",
    )
    op.drop_column("asset_upload_intents", "cleanup_next_attempt_at")
    op.drop_column("asset_upload_intents", "cleanup_attempts")
