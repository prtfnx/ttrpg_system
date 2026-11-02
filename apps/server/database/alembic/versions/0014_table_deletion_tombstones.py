"""Retire deleted table identities independently of actor receipt retention."""
import sqlalchemy as sa
from alembic import op

revision = "0014_table_deletion_tombstones"
down_revision = "0013_session_operation_receipts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "table_deletion_tombstones",
        sa.Column("table_id", sa.String(36), primary_key=True),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("deleted_by", sa.Integer(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["game_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["deleted_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_table_deletion_tombstones_session_id", "table_deletion_tombstones", ["session_id"])
    if op.get_context().dialect.name == "postgresql":
        op.execute(sa.text(
            'CREATE TRIGGER application_writer_guard BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE '
            'ON "table_deletion_tombstones" FOR EACH STATEMENT EXECUTE FUNCTION enforce_application_writer()'
        ))


def downgrade() -> None:
    if op.get_context().dialect.name == "postgresql":
        op.execute(sa.text('DROP TRIGGER application_writer_guard ON "table_deletion_tombstones"'))
    op.drop_index("ix_table_deletion_tombstones_session_id", table_name="table_deletion_tombstones")
    op.drop_table("table_deletion_tombstones")
