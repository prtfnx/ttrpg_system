"""Store durable editor command receipts and actor-scoped undo deltas."""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0012_canvas_command_journal"
down_revision = "0011_selection_preferences"
branch_labels = None
depends_on = None


def upgrade() -> None:
    document = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")
    op.create_table(
        "canvas_command_journal",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("table_id", sa.String(36), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=False),
        sa.Column("operation_id", sa.String(36), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("state", sa.String(16), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("result_json", document, nullable=False),
        sa.Column("changes", document, nullable=True),
        sa.Column("changes_bytes", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["table_id"], ["virtual_tables.table_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("table_id", "actor_id", "operation_id", name="uq_canvas_command_operation"),
    )
    op.create_index("ix_canvas_command_scope", "canvas_command_journal", ["table_id", "actor_id", "id"])
    op.create_index("ix_canvas_command_created_at", "canvas_command_journal", ["created_at"])
    if op.get_context().dialect.name == "postgresql":
        op.execute(sa.text(
            "CREATE TRIGGER application_writer_guard BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE "
            'ON "canvas_command_journal" FOR EACH STATEMENT EXECUTE FUNCTION enforce_application_writer()'
        ))


def downgrade() -> None:
    if op.get_context().dialect.name == "postgresql":
        op.execute(sa.text('DROP TRIGGER application_writer_guard ON "canvas_command_journal"'))
    op.drop_index("ix_canvas_command_created_at", table_name="canvas_command_journal")
    op.drop_index("ix_canvas_command_scope", table_name="canvas_command_journal")
    op.drop_table("canvas_command_journal")
