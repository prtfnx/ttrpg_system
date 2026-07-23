"""Add durable chat moderation tombstones.

Revision ID: 0002_chat_moderation
Revises: 0001_postgresql_baseline
Create Date: 2026-07-23
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_chat_moderation"
down_revision: Union[str, Sequence[str], None] = "0001_postgresql_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("chat_messages") as batch_op:
        batch_op.add_column(sa.Column("redacted_at", sa.DateTime(), nullable=True))
        batch_op.add_column(
            sa.Column("redacted_by_user_id", sa.Integer(), nullable=True)
        )
        batch_op.add_column(sa.Column("deleted_at", sa.DateTime(), nullable=True))
        batch_op.add_column(
            sa.Column("deleted_by_user_id", sa.Integer(), nullable=True)
        )
        batch_op.add_column(
            sa.Column("moderation_reason", sa.String(length=500), nullable=True)
        )
        batch_op.create_foreign_key(
            op.f("fk_chat_messages_redacted_by_user_id_users"),
            "users",
            ["redacted_by_user_id"],
            ["id"],
        )
        batch_op.create_foreign_key(
            op.f("fk_chat_messages_deleted_by_user_id_users"),
            "users",
            ["deleted_by_user_id"],
            ["id"],
        )


def downgrade() -> None:
    with op.batch_alter_table("chat_messages") as batch_op:
        batch_op.drop_constraint(
            op.f("fk_chat_messages_deleted_by_user_id_users"),
            type_="foreignkey",
        )
        batch_op.drop_constraint(
            op.f("fk_chat_messages_redacted_by_user_id_users"),
            type_="foreignkey",
        )
        batch_op.drop_column("moderation_reason")
        batch_op.drop_column("deleted_by_user_id")
        batch_op.drop_column("deleted_at")
        batch_op.drop_column("redacted_by_user_id")
        batch_op.drop_column("redacted_at")
