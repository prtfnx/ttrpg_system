"""Add expiry for isolated demo guest identities."""
import sqlalchemy as sa
from alembic import op

revision = "0007_demo_guest_expiry"
down_revision = "0006_upload_intent_cleanup"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("guest_expires_at", sa.DateTime(), nullable=True))
    op.create_index("ix_users_guest_expires_at", "users", ["guest_expires_at"])
    # Revoke the legacy demo host's published password and existing tokens.
    op.execute(sa.text("""
        UPDATE users SET disabled = true, session_version = session_version + 1
        WHERE username = 'demo_host' AND email = 'demo@ttrpg-system.local'
        AND id IN (SELECT owner_id FROM game_sessions WHERE is_demo = true)
    """))


def downgrade() -> None:
    op.drop_index("ix_users_guest_expires_at", table_name="users")
    op.drop_column("users", "guest_expires_at")
    # Deliberately do not re-enable the compromised legacy host.
