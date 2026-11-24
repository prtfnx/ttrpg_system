"""Retain pending movement and its server-owned reaction windows."""
import sqlalchemy as sa
from alembic import op

revision = "0017_pending_combat_movement"
down_revision = "0016_chat_system_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("combat_encounters", sa.Column("pending_movement_json", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("combat_encounters", "pending_movement_json")
