"""Migrate the configured database, verify head, then exec Uvicorn."""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

logger = logging.getLogger("database.startup")


def migrate() -> tuple[str, ...]:
    """Apply and verify migrations without logging connection details."""
    from database.database import engine
    from database.schema import migrate_database_for_start

    logger.info("database.migration.started")
    revisions = migrate_database_for_start(engine)
    logger.info(
        "database.migration.completed",
        extra={"revision": ",".join(revisions)},
    )
    return revisions


def main() -> None:
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper())
    migration_failed = False
    try:
        migrate()
    except Exception:
        migration_failed = True

    if migration_failed:
        logger.error("database.migration.failed")
        raise SystemExit(1)

    port = os.getenv("PORT", "8000")
    os.execvp(
        sys.executable,
        [
            sys.executable,
            "-m",
            "uvicorn",
            "main:app",
            "--host",
            "0.0.0.0",
            "--port",
            port,
        ],
    )


if __name__ == "__main__":
    main()
