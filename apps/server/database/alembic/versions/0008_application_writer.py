"""Fence application writes across overlapping server processes."""
import sqlalchemy as sa
from alembic import op

revision = "0008_application_writer"
down_revision = "0007_demo_guest_expiry"
branch_labels = None
depends_on = None

# Freeze this revision's table inventory; future tables need the same trigger.
GUARDED_TABLES = (
    "users",
    "game_sessions",
    "game_players",
    "virtual_tables",
    "entities",
    "assets",
    "session_assets",
    "asset_rate_limit_buckets",
    "asset_quota_state",
    "asset_deletion_jobs",
    "asset_upload_intents",
    "session_characters",
    "character_permissions",
    "character_drafts",
    "session_invitations",
    "email_verification_tokens",
    "password_reset_tokens",
    "pending_email_changes",
    "combat_encounters",
    "combat_actions",
    "choice_encounters",
    "choice_encounter_events",
    "walls",
    "audit_logs",
    "character_logs",
    "chat_messages",
    "paint_strokes",
    "shared_measurements",
    "paint_templates",
)


def upgrade() -> None:
    op.create_table(
        "application_writer_state",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner_token", sa.String(36), nullable=True),
        sa.Column("generation", sa.BigInteger(), nullable=False, server_default="0"),
        sa.CheckConstraint("id = 1", name=op.f("ck_application_writer_state_singleton")),
        sa.PrimaryKeyConstraint("id", name="pk_application_writer_state"),
    )
    op.execute(sa.text("INSERT INTO application_writer_state (id, generation) VALUES (1, 0)"))
    if op.get_context().dialect.name != "postgresql":
        return
    op.execute(sa.text("""
        CREATE FUNCTION enforce_application_writer() RETURNS trigger
        LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
        DECLARE expected_owner text;
        BEGIN
            SELECT owner_token INTO expected_owner
            FROM application_writer_state WHERE id = 1 FOR SHARE;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Application writer state is missing' USING ERRCODE = '55000';
            END IF;
            IF expected_owner IS NOT NULL
               AND current_setting('ttrpg.writer_token', true) IS DISTINCT FROM expected_owner THEN
                RAISE EXCEPTION 'Application writer has been superseded' USING ERRCODE = '55000';
            END IF;
            RETURN NULL;
        END;
        $$
    """))
    for table in GUARDED_TABLES:
        op.execute(sa.text(
            f'CREATE TRIGGER application_writer_guard BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE '
            f'ON "{table}" FOR EACH STATEMENT EXECUTE FUNCTION enforce_application_writer()'
        ))


def downgrade() -> None:
    if op.get_context().dialect.name == "postgresql":
        for table in GUARDED_TABLES:
            op.execute(sa.text(f'DROP TRIGGER application_writer_guard ON "{table}"'))
        op.execute(sa.text("DROP FUNCTION enforce_application_writer()"))
    op.drop_table("application_writer_state")
