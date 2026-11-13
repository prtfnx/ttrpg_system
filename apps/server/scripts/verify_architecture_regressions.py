"""Run maintained regressions for the original architecture audit findings.

Uses synthetic SQLite fixtures and injected failures, not application databases.
Run with the repository Python environment from any working directory.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

REGRESSION_TESTS = (
    "tests/unit/test_combat_lifecycle_persistence.py::test_rejected_start_cannot_be_restored_from_database",
    "tests/unit/test_combat_cancellation.py::test_cancelled_dispatch_holds_session_lock_through_publication",
    "tests/unit/test_sprite_event_visibility.py::test_character_stat_sync_respects_recipient_visibility",
    "tests/unit/test_character_protocol.py::test_character_token_sync_updates_memory_without_blocking",
    "tests/unit/test_choice_worker_ownership.py::test_repeated_cancellation_keeps_mutation_until_worker_and_publication",
    "tests/unit/test_choice_worker_ownership.py::test_join_ban_and_rules_are_read_on_worker",
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--collect-only", action="store_true", help="List the selected regression cases without running them")
    args = parser.parse_args()
    command = [sys.executable, "-m", "pytest", *REGRESSION_TESTS, "--no-cov", "-q", "--tb=short"]
    if args.collect_only:
        command.append("--collect-only")
    environment = {
        **os.environ,
        "DATABASE_URL": "sqlite:///:memory:",
        "DATABASE_MIGRATION_URL": "",
        "ENVIRONMENT": "development",
        "R2_ENABLED": "false",
        "PYTEST_ADDOPTS": "",
    }
    return subprocess.run(
        command,
        cwd=Path(__file__).resolve().parents[1],
        env=environment,
        check=False,
        stdout=sys.stdout,
        stderr=sys.stderr,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    ).returncode


if __name__ == "__main__":
    raise SystemExit(main())
