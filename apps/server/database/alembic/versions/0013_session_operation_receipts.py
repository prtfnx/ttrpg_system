"""Retain actor/session/domain-scoped durable operation outcomes."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0013_session_operation_receipts"
down_revision = "0012_canvas_command_journal"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "session_operation_receipts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=False),
        sa.Column("domain", sa.String(32), nullable=False),
        sa.Column("operation_id", sa.String(128), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("result_json", sa.JSON().with_variant(postgresql.JSONB(), "postgresql"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["game_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("session_id", "actor_id", "domain", "operation_id", name="uq_session_operation"),
    )
    op.create_index("ix_session_operation_created", "session_operation_receipts", ["session_id", "created_at"])
    if op.get_context().dialect.name == "postgresql":
        op.execute(sa.text(
            'CREATE TRIGGER application_writer_guard BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE '
            'ON "session_operation_receipts" FOR EACH STATEMENT EXECUTE FUNCTION enforce_application_writer()'
        ))


def downgrade() -> None:
    if op.get_context().dialect.name == "postgresql":
        op.execute(sa.text('DROP TRIGGER application_writer_guard ON "session_operation_receipts"'))
    op.drop_index("ix_session_operation_created", table_name="session_operation_receipts")
    op.drop_table("session_operation_receipts")
