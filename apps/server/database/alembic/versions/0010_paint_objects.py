"""Add authoritative paint object storage and mutation state."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0010_paint_objects"
down_revision = "0009_table_previews"
branch_labels = None
depends_on = None

GUARDED_TABLES = (
    "paint_state",
    "paint_objects",
    "paint_operation_results",
)


def _json_document_type():
    return sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    op.create_table(
        "paint_state",
        sa.Column("table_id", sa.String(36), nullable=False),
        sa.Column("revision", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("next_z_order", sa.BigInteger(), nullable=False, server_default="1"),
        sa.CheckConstraint("revision >= 0", name=op.f("ck_paint_state_revision_nonnegative")),
        sa.CheckConstraint("next_z_order >= 1", name=op.f("ck_paint_state_next_z_order_positive")),
        sa.ForeignKeyConstraint(
            ["table_id"],
            ["virtual_tables.table_id"],
            name=op.f("fk_paint_state_table_id_virtual_tables"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("table_id", name=op.f("pk_paint_state")),
    )
    op.create_table(
        "paint_objects",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("table_id", sa.String(36), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("geometry", _json_document_type(), nullable=False),
        sa.Column("transform", _json_document_type(), nullable=False),
        sa.Column("style", _json_document_type(), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("z_order", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "kind IN ('freehand', 'line', 'rectangle', 'square', 'ellipse', 'circle')",
            name=op.f("ck_paint_objects_kind_supported"),
        ),
        sa.CheckConstraint("version >= 1", name=op.f("ck_paint_objects_version_positive")),
        sa.CheckConstraint("z_order >= 1", name=op.f("ck_paint_objects_z_order_positive")),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name=op.f("fk_paint_objects_created_by_users"),
        ),
        sa.ForeignKeyConstraint(
            ["table_id"],
            ["virtual_tables.table_id"],
            name=op.f("fk_paint_objects_table_id_virtual_tables"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_paint_objects")),
        sa.UniqueConstraint(
            "table_id",
            "z_order",
            name="uq_paint_object_table_z_order",
        ),
    )
    op.create_index(
        "ix_paint_objects_table_z_order_id",
        "paint_objects",
        ["table_id", "z_order", "id"],
        unique=False,
    )
    op.create_index(
        "ix_paint_objects_table_id_id",
        "paint_objects",
        ["table_id", "id"],
        unique=False,
    )
    op.create_table(
        "paint_operation_results",
        sa.Column("table_id", sa.String(36), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=False),
        sa.Column("operation_id", sa.String(36), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("result_json", _json_document_type(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["actor_id"],
            ["users.id"],
            name=op.f("fk_paint_operation_results_actor_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["table_id"],
            ["virtual_tables.table_id"],
            name=op.f("fk_paint_operation_results_table_id_virtual_tables"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "table_id",
            "actor_id",
            "operation_id",
            name=op.f("pk_paint_operation_results"),
        ),
    )
    op.create_index(
        "ix_paint_operation_results_created_at",
        "paint_operation_results",
        ["created_at"],
        unique=False,
    )

    op.execute(sa.text(
        "INSERT INTO paint_state (table_id, revision, next_z_order) "
        "SELECT table_id, 0, 1 FROM virtual_tables"
    ))

    if op.get_context().dialect.name == "postgresql":
        for table in GUARDED_TABLES:
            op.execute(sa.text(
                "CREATE TRIGGER application_writer_guard "
                "BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE "
                f'ON "{table}" FOR EACH STATEMENT '
                "EXECUTE FUNCTION enforce_application_writer()"
            ))


def downgrade() -> None:
    if op.get_context().dialect.name == "postgresql":
        for table in reversed(GUARDED_TABLES):
            op.execute(sa.text(f'DROP TRIGGER application_writer_guard ON "{table}"'))

    op.drop_index(
        "ix_paint_operation_results_created_at",
        table_name="paint_operation_results",
    )
    op.drop_table("paint_operation_results")
    op.drop_index("ix_paint_objects_table_id_id", table_name="paint_objects")
    op.drop_index("ix_paint_objects_table_z_order_id", table_name="paint_objects")
    op.drop_table("paint_objects")
    op.drop_table("paint_state")
