"""Export all retired paint templates before disabling their protocol."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from config import Settings
from database.database import create_migration_engine
from database.writer import migration_writer_transaction
from service.paint_legacy_cutover import PaintLegacyCutoverError, write_json_artifact
from service.paint_template_export import build_paint_template_export
from sqlalchemy.orm import Session


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create a private, lossless export of all paint templates",
    )
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    arguments = _arguments()
    engine = create_migration_engine(Settings())
    try:
        with engine.connect() as connection:
            with migration_writer_transaction(connection):
                with Session(bind=connection, autoflush=False) as db:
                    document = build_paint_template_export(db)
                    write_json_artifact(arguments.output, document)
                    print(json.dumps({
                        "output": str(arguments.output.resolve()),
                        "source_count": document["source_count"],
                        "source_sha256": document["source_sha256"],
                    }, indent=2, sort_keys=True))
    except PaintLegacyCutoverError as exc:
        raise SystemExit(str(exc)) from exc
    finally:
        engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
