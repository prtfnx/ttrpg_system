"""Retain a monotonic settings revision independent of actor receipt cleanup."""
import sqlalchemy as sa
from alembic import op

revision = '0015_table_settings_revision'
down_revision = '0014_table_deletion_tombstones'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('virtual_tables', sa.Column('settings_revision', sa.BigInteger(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('virtual_tables', 'settings_revision')
