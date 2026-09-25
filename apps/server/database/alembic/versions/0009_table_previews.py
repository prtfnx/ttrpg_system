"""Add bounded, deferred table preview storage."""
import sqlalchemy as sa
from alembic import op

revision = "0009_table_previews"
down_revision = "0008_application_writer"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("virtual_tables", sa.Column("preview_image", sa.LargeBinary(), nullable=True))
    op.add_column("virtual_tables", sa.Column("preview_etag", sa.String(64), nullable=True))
    op.add_column("virtual_tables", sa.Column("preview_updated_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("virtual_tables", "preview_updated_at")
    op.drop_column("virtual_tables", "preview_etag")
    op.drop_column("virtual_tables", "preview_image")
