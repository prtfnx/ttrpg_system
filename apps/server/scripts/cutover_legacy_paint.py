"""Create verified artifacts and optionally apply the legacy paint cutover."""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from pathlib import Path

from config import Settings
from database.database import create_migration_engine
from database.writer import migration_writer_transaction
from service.paint_legacy_cutover import (
    PaintLegacyCutoverError,
    apply_legacy_paint_cutover,
    prepare_legacy_paint_cutover,
    write_json_artifact,
)
from sqlalchemy.orm import Session


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Back up, report, and migrate legacy paint strokes",
    )
    parser.add_argument("--backup", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--expected-sha256")
    parser.add_argument("--allow-quarantine", action="store_true")
    arguments = parser.parse_args()
    if arguments.backup.resolve() == arguments.report.resolve():
        parser.error("--backup and --report must be different files")
    if arguments.apply and not arguments.expected_sha256:
        parser.error("--apply requires --expected-sha256 from a reviewed dry run")
    if arguments.allow_quarantine and not arguments.apply:
        parser.error("--allow-quarantine is only valid with --apply")
    return arguments


def main() -> int:
    arguments = _arguments()
    engine = create_migration_engine(Settings())
    try:
        with engine.connect() as connection:
            with migration_writer_transaction(connection):
                with Session(bind=connection, autoflush=False) as db:
                    plan = prepare_legacy_paint_cutover(db)
                    write_json_artifact(arguments.backup, plan.backup())
                    write_json_artifact(arguments.report, plan.report())
                    output: dict = {
                        "mode": "dry-run",
                        **plan.conversion.report(),
                    }
                    if arguments.apply:
                        result = apply_legacy_paint_cutover(
                            db,
                            plan,
                            expected_source_sha256=arguments.expected_sha256,
                            allow_quarantine=arguments.allow_quarantine,
                        )
                        output = {"mode": "applied", **asdict(result)}
                    print(json.dumps(output, indent=2, sort_keys=True))
    except PaintLegacyCutoverError as exc:
        raise SystemExit(str(exc)) from exc
    finally:
        engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
