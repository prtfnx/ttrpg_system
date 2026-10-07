"""Persist selection mode on the authenticated session membership."""
import sqlalchemy as sa
from alembic import op

revision = "0011_selection_preferences"
down_revision = "0010_paint_objects"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # game_players already has the PostgreSQL application-writer guard.
    op.add_column("game_players", sa.Column("selection_mode", sa.String(16), nullable=False, server_default="separate"))


def downgrade() -> None:
    op.drop_column("game_players", "selection_mode")
