"""Separate trusted roll events from legacy client-controlled chat JSON."""
import sqlalchemy as sa
from alembic import op

revision = "0016_chat_system_events"
down_revision = "0015_table_settings_revision"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("chat_messages", sa.Column("system_event_json", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("chat_messages", "system_event_json")
