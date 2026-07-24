"""Add shared measurements and session paint templates.

Revision ID: 0003_shared_canvas_state
Revises: 0002_chat_moderation
Create Date: 2026-07-23
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_shared_canvas_state"
down_revision: Union[str, Sequence[str], None] = "0002_chat_moderation"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "paint_templates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("template_id", sa.String(length=64), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("strokes_json", sa.Text(), nullable=False),
        sa.Column("thumbnail", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name=op.f("fk_paint_templates_created_by_users"),
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["game_sessions.id"],
            name=op.f("fk_paint_templates_session_id_game_sessions"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_paint_templates")),
        sa.UniqueConstraint(
            "session_id",
            "template_id",
            name="uq_paint_template_session_id",
        ),
    )
    op.create_index(
        op.f("ix_paint_templates_id"),
        "paint_templates",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_paint_templates_session_id"),
        "paint_templates",
        ["session_id"],
        unique=False,
    )
    op.create_table(
        "shared_measurements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("measurement_id", sa.String(length=64), nullable=False),
        sa.Column("table_id", sa.String(length=36), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("measurement_data", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name=op.f("fk_shared_measurements_created_by_users"),
        ),
        sa.ForeignKeyConstraint(
            ["table_id"],
            ["virtual_tables.table_id"],
            name=op.f("fk_shared_measurements_table_id_virtual_tables"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_shared_measurements")),
        sa.UniqueConstraint(
            "table_id",
            "measurement_id",
            name="uq_shared_measurement_table_id",
        ),
    )
    op.create_index(
        op.f("ix_shared_measurements_id"),
        "shared_measurements",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_shared_measurements_table_id"),
        "shared_measurements",
        ["table_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_shared_measurements_table_id"),
        table_name="shared_measurements",
    )
    op.drop_index(
        op.f("ix_shared_measurements_id"),
        table_name="shared_measurements",
    )
    op.drop_table("shared_measurements")
    op.drop_index(
        op.f("ix_paint_templates_session_id"),
        table_name="paint_templates",
    )
    op.drop_index(
        op.f("ix_paint_templates_id"),
        table_name="paint_templates",
    )
    op.drop_table("paint_templates")
