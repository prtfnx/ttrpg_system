import sqlite3

from database.migrations.run_migrations import MigrationRunner, expected_migration_names


def test_fresh_database_is_bootstrapped_and_stamped_at_head(tmp_path):
    db_path = tmp_path / "fresh.db"
    runner = MigrationRunner(str(db_path))

    assert runner.provision() is True
    assert runner.schema_status() == {"current": True, "missing": [], "unexpected": []}

    with sqlite3.connect(db_path) as connection:
        assert connection.execute(
            "SELECT COUNT(*) FROM schema_migrations"
        ).fetchone()[0] == len(expected_migration_names())
        assert connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'"
        ).fetchone() == (1,)


def test_unknown_revision_fails_closed(tmp_path):
    db_path = tmp_path / "ahead.db"
    runner = MigrationRunner(str(db_path))
    assert runner.provision() is True
    runner.mark_migration_applied("999_unknown")

    assert runner.run_migrations() is False
    assert runner.schema_status()["unexpected"] == ["999_unknown"]


def test_online_backup_is_nonempty_and_valid(tmp_path):
    db_path = tmp_path / "source.db"
    runner = MigrationRunner(str(db_path))
    assert runner.provision() is True

    backup = runner.create_verified_backup()

    assert backup.stat().st_size > 0
    with sqlite3.connect(backup) as connection:
        assert connection.execute("PRAGMA integrity_check").fetchone() == ("ok",)
