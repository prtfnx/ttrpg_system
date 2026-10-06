"""Run paint acceptance against fresh local PostgreSQL databases and the built UI.

Invoke from apps/server with the repository venv:
    python -m scripts.verify_paint_release --postgres-url <local test URL>
Each run creates its own databases and retains synthetic evidence in a temp folder.
It never reads the configured application DATABASE_URL or mutates production.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import uuid
import zipfile
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import jwt
from alembic import command
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

ROOT = Path(__file__).resolve().parents[3]
SERVER = ROOT / "apps" / "server"
SECRET = "isolated-paint-release-signing-key-not-for-production"
LEGACY_COMMIT = "a30567fffd92de92329e8ff1067aad5eaad3664b"


def require_local_test_url(raw: str):
    url = make_url(raw)
    if url.get_backend_name() != "postgresql" or url.host not in {"127.0.0.1", "localhost", "::1"}:
        raise ValueError("Release verification requires loopback PostgreSQL, never a remote database")
    if not url.database or "test" not in url.database.lower():
        raise ValueError("The database name must contain 'test'")
    if url.query:
        raise ValueError("Connection query parameters are not allowed to override the loopback target")
    if url.drivername not in {"postgresql", "postgresql+psycopg"}:
        raise ValueError("Use the repository's PostgreSQL Psycopg driver")
    return url.set(drivername="postgresql+psycopg")


def unused_port() -> int:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def seed(engine, table_id: str, busy_table_id: str) -> dict:
    from database import models
    from database.writer import migration_writer_transaction

    with engine.connect() as connection, migration_writer_transaction(connection), Session(bind=connection) as db:
        users = []
        for index in range(10):
            user = models.User(username=f"paint-release-{index}", hashed_password="not-a-login", is_verified=True)
            db.add(user)
            db.flush()
            users.append(user)
        game = models.GameSession(name="Isolated paint release", session_code="PAINTRELEASE", owner_id=users[0].id)
        db.add(game)
        db.flush()
        roles = ["owner", "player", "spectator", "co_dm", "trusted_player", *(["player"] * 5)]
        for user, role in zip(users, roles, strict=True):
            db.add(models.GamePlayer(session_id=game.id, user_id=user.id, role=role, active_table_id=table_id))
        for identifier, name in [(table_id, "Acceptance"), (busy_table_id, "Busy paint")]:
            db.add(
                models.VirtualTable(
                    table_id=identifier, name=name, width=2000, height=1200, session_id=game.id, grid_enabled=False
                )
            )
        db.flush()
        db.add_all(
            [
                models.PaintState(table_id=table_id, revision=0, next_z_order=1),
                models.PaintState(table_id=busy_table_id, revision=0, next_z_order=1001),
            ]
        )
        now = datetime.now(UTC).replace(tzinfo=None)
        for index in range(1000):
            db.add(
                models.PaintObject(
                    id=str(uuid.uuid4()),
                    table_id=busy_table_id,
                    kind="freehand",
                    geometry={
                        "kind": "freehand",
                        "points": [{"x": point / 2, "y": (point % 2) * 3, "pressure": 1} for point in range(100)],
                    },
                    transform={"x": 10 + (index % 40) * 48, "y": 10 + (index // 40) * 40, "scale_x": 1, "scale_y": 1},
                    style={"stroke_rgba": [1, 0, 0, 1], "width": 2, "fill_rgba": None},
                    created_by=users[[0, 1, 3, 4, 5, 6, 7, 8, 9][index % 9]].id,
                    version=1,
                    z_order=index + 1,
                    created_at=now,
                    updated_at=now,
                )
            )
        db.flush()
        return {
            "sessionCode": game.session_code,
            "tableId": table_id,
            "busyTableId": busy_table_id,
            "actors": [
                {
                    "id": user.id,
                    "role": role,
                    "token": jwt.encode(
                        {
                            "sub": user.username,
                            "sv": 0,
                            "exp": datetime.now(UTC) + timedelta(hours=2),
                        },
                        SECRET,
                        algorithm="HS256",
                    ),
                }
                for user, role in zip(users, roles, strict=True)
            ],
        }


def start_server(url, port: int, directory: Path):
    environment = {
        **os.environ,
        "DATABASE_URL": url.render_as_string(hide_password=False),
        "DATABASE_MIGRATION_URL": "",
        "ENVIRONMENT": "development",
        "R2_ENABLED": "false",
        "BASE_URL": f"http://127.0.0.1:{port}",
        "CORS_ORIGINS": f"http://127.0.0.1:{port}",
        "SECRET_KEY": SECRET,
        "SESSION_SECRET": SECRET,
        "GOOGLE_CLIENT_ID": "",
        "GOOGLE_CLIENT_SECRET": "",
        "PAINT_OBJECT_WRITES_ENABLED": "true",
        "LOG_LEVEL": "WARNING",
        "METRICS_ENABLED": "true",
        "METRICS_TOKEN": SECRET,
        "PYTHONPATH": os.pathsep.join([str(SERVER), str(ROOT / "packages" / "core-table")]),
    }
    with (directory / "server.log").open("a", encoding="utf-8") as output:
        process = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "scripts.paint_release_app:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(port),
            ],
            cwd=SERVER,
            env=environment,
            stdout=output,
            stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"Test server exited; see {directory / 'server.log'}")
        try:
            if httpx.get(f"http://127.0.0.1:{port}/health/ready", timeout=1, trust_env=False).status_code == 200:
                return process
        except httpx.TransportError:
            pass
        time.sleep(0.1)
    stop_server(process)
    raise TimeoutError("Test server did not become ready")


def stop_server(process) -> None:
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def rehearse_cutover(url, directory: Path) -> dict:
    """Use generated legacy data, never a claim about a deployed database."""
    from database import models
    from database.schema import alembic_config
    from database.writer import migration_writer_transaction
    from service.paint_legacy_cutover import (
        apply_legacy_paint_cutover,
        prepare_legacy_paint_cutover,
        write_json_artifact,
    )
    from service.paint_legacy_migration import LegacyPaintStrokeRecord, convert_legacy_paint_strokes
    from service.paint_template_export import build_paint_template_export

    engine = create_engine(url, poolclass=NullPool)
    config = alembic_config(url)
    command.upgrade(config, "0009_table_previews")
    table_ids = [str(uuid.uuid4()) for _ in range(3)]
    with engine.connect() as connection, migration_writer_transaction(connection), Session(bind=connection) as db:
        user = models.User(username="legacy-fixture", hashed_password="not-a-login")
        db.add(user)
        db.flush()
        game = models.GameSession(name="Synthetic legacy fixture", session_code="LEGACYTEST", owner_id=user.id)
        db.add(game)
        db.flush()
        for identifier in table_ids:
            db.add(models.VirtualTable(table_id=identifier, name="Legacy", width=2000, height=1200, session_id=game.id))
        db.flush()
        for index in range(90):
            points = [[point / 2, index * 3 + point % 5, 0.2 + (point % 8) / 10] for point in range(100)]
            db.add(
                models.PaintStroke(
                    stroke_id=f"legacy-{index}",
                    table_id=table_ids[index % 3],
                    created_by=user.id,
                    created_at=datetime(2026, 9, 1),
                    stroke_data=json.dumps({"points": points, "color": [0.2, 0.4, 0.8, 1], "width": 3}),
                )
            )
        for index in range(3):
            db.add(
                models.PaintStroke(
                    stroke_id=f"quarantine-{index}",
                    table_id=table_ids[index],
                    created_by=user.id,
                    created_at=datetime(2026, 9, 1),
                    stroke_data=json.dumps({"points": [], "color": [1, 0, 0, 1], "width": 3}),
                )
            )
            db.add(
                models.PaintTemplate(
                    template_id=f"template-{index}",
                    session_id=game.id,
                    created_by=user.id,
                    name=f"Synthetic template {index}",
                    strokes_json='[{"opaque":"retained exactly"}]',
                    created_at=datetime(2026, 9, 1),
                    updated_at=datetime(2026, 9, 1),
                )
            )
        db.flush()
        templates = build_paint_template_export(db)
        write_json_artifact(directory / "templates-backup.json", templates)
    command.upgrade(config, "head")
    with engine.connect() as connection, migration_writer_transaction(connection), Session(bind=connection) as db:
        plan = prepare_legacy_paint_cutover(db)
        write_json_artifact(directory / "legacy-backup.json", plan.backup())
        write_json_artifact(directory / "legacy-report.json", plan.report())
        assert plan.conversion.converted_count == 90 and len(plan.conversion.quarantined) == 3
        apply_legacy_paint_cutover(
            db, plan, expected_source_sha256=plan.conversion.source_sha256, allow_quarantine=True
        )
        repeated = apply_legacy_paint_cutover(
            db,
            prepare_legacy_paint_cutover(db),
            expected_source_sha256=plan.conversion.source_sha256,
            allow_quarantine=True,
        )
        assert repeated.inserted_count == 0
    command.downgrade(config, "0009_table_previews")
    # Execute the archived pre-cutover server's read path in a separate process,
    # with its own original protocol package, against the downgraded test DB.
    archive = directory / "old-server.zip"
    subprocess.run(
        ["git", "archive", "--format=zip", f"--output={archive}", LEGACY_COMMIT, "apps/server", "packages/core-table"],
        cwd=ROOT,
        check=True,
    )
    old_root = directory / "old-server"
    with zipfile.ZipFile(archive) as bundle:
        bundle.extractall(old_root)
    old_environment = {
        **os.environ,
        "DATABASE_URL": url.render_as_string(hide_password=False),
        "DATABASE_MIGRATION_URL": "",
        "ENVIRONMENT": "development",
        "PYTHONPATH": os.pathsep.join([str(old_root / "apps/server"), str(old_root / "packages/core-table")]),
    }
    legacy_reader = (
        "import json, sys; from database.database import SessionLocal; from database import models; "
        "from service.canvas_persistence_service import load_table_hydration; "
        "db=SessionLocal(); assert db.query(models.PaintStroke).count()==93; "
        "assert db.query(models.PaintTemplate).count()==3; "
        "assert sum(len(load_table_hydration(t).paint_strokes) for t in sys.argv[1:])==93; "
        "db.close(); print('Archived legacy server restored: all 93 source rows readable')"
    )
    subprocess.run(
        [sys.executable, "-c", legacy_reader, *table_ids],
        cwd=old_root / "apps/server",
        env=old_environment,
        check=True,
        timeout=30,
    )
    with Session(engine) as db:
        before = convert_legacy_paint_strokes(
            [
                LegacyPaintStrokeRecord(
                    source_id=row.id,
                    stroke_id=row.stroke_id,
                    table_id=row.table_id,
                    created_by=row.created_by,
                    stroke_data=row.stroke_data,
                    created_at=row.created_at,
                )
                for row in db.query(models.PaintStroke).all()
            ]
        )
        assert before.source_sha256 == plan.conversion.source_sha256
        assert build_paint_template_export(db) == templates
    command.upgrade(config, "head")
    with engine.connect() as connection, migration_writer_transaction(connection), Session(bind=connection) as db:
        current = prepare_legacy_paint_cutover(db)
        apply_legacy_paint_cutover(
            db, current, expected_source_sha256=current.conversion.source_sha256, allow_quarantine=True
        )
        assert build_paint_template_export(db) == templates
    with Session(engine) as db:
        actor_id = db.query(models.User.id).scalar()
        session_id = db.query(models.GameSession.id).scalar()
    from database.writer import ApplicationWriter
    from service.paint_object_service import PaintObjectService, PaintSnapshot
    from sqlalchemy.orm import sessionmaker

    control = create_engine(url, poolclass=NullPool)
    writer = ApplicationWriter(engine, control)
    writer.claim()
    try:
        service = PaintObjectService(sessionmaker(bind=engine), writes_enabled=True)
        result = service.create(
            session_id=session_id,
            actor_id=actor_id,
            table_id=table_ids[0],
            operation_id=str(uuid.uuid4()),
            editable={
                "id": str(uuid.uuid4()),
                "kind": "circle",
                "geometry": {"kind": "circle", "diameter": 25},
                "transform": {"x": 1, "y": 2, "scale_x": 2, "scale_y": 2},
                "style": {"stroke_rgba": [1, 0, 0, 1], "width": 2, "fill_rgba": [0, 1, 0, 0.5]},
            },
        )
        assert result.error is None
        snapshot = service.snapshot(session_id=session_id, actor_id=actor_id, table_id=table_ids[0])
        assert isinstance(snapshot, PaintSnapshot)
    finally:
        writer.close()
        control.dispose()
        engine.dispose()
    # Forward fix: restart with a fresh engine/writer, preserve all new-format state.
    fresh_engine = create_engine(url, poolclass=NullPool)
    fresh_control = create_engine(url, poolclass=NullPool)
    successor = ApplicationWriter(fresh_engine, fresh_control)
    successor.claim()
    try:
        fresh = PaintObjectService(sessionmaker(bind=fresh_engine), writes_enabled=False).snapshot(
            session_id=session_id, actor_id=actor_id, table_id=table_ids[0]
        )
        assert isinstance(fresh, PaintSnapshot)
        assert fresh.objects == snapshot.objects and fresh.revision == snapshot.revision
    finally:
        successor.close()
        fresh_control.dispose()
        fresh_engine.dispose()
    return {
        "fixture": "synthetic: three tables, 90 valid paths / 9,000 points, three quarantined rows, three templates",
        "sourceSha256": plan.conversion.source_sha256,
        "templateSha256": templates["source_sha256"],
        "legacyServerCommit": LEGACY_COMMIT,
        "beforeNewWrite": "archived old-server hydration reads all source rows after downgrade; re-upgrade retains checksums",
        "afterNewWrite": "forward-fix writer restart retains exact objects/revision",
        "sampleEditable": {
            key: plan.conversion.objects[0][key] for key in ("id", "kind", "geometry", "transform", "style")
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--postgres-url", required=True)
    args = parser.parse_args()
    base = require_local_test_url(args.postgres_url)
    # Do not import application settings/engines until ambient database settings
    # have been replaced. The runner's only PostgreSQL target is the explicit URL.
    os.environ.update(DATABASE_URL="sqlite:///:memory:", DATABASE_MIGRATION_URL="", ENVIRONMENT="development")
    from database.schema import alembic_config
    from service.paint_legacy_cutover import write_json_artifact

    directory = Path(tempfile.mkdtemp(prefix="ttrpg-paint-evidence-"))
    print(f"Evidence: {directory}", flush=True)
    admin = create_engine(base, isolation_level="AUTOCOMMIT", poolclass=NullPool)
    names = [f"paint_{purpose}_test_{uuid.uuid4().hex}" for purpose in ("browser", "cutover")]
    server = None
    node = None
    watchdog = None
    created = []
    try:
        with admin.connect() as connection:
            for name in names:
                connection.execute(text(f'CREATE DATABASE "{name}"'))
                created.append(name)
        browser_url, cutover_url = [base.set(database=name) for name in names]
        cutover = rehearse_cutover(cutover_url, directory)
        legacy_sample = cutover.pop("sampleEditable")
        command.upgrade(alembic_config(browser_url), "head")
        engine = create_engine(browser_url, poolclass=NullPool)
        try:
            fixture = seed(engine, str(uuid.uuid4()), str(uuid.uuid4()))
        finally:
            engine.dispose()
        port = unused_port()
        fixture.update(
            {
                "baseUrl": f"http://127.0.0.1:{port}",
                "evidenceDir": str(directory),
                "cutover": cutover,
                "metricsToken": SECRET,
                "legacySample": legacy_sample,
            }
        )
        fixture_path = directory / "fixture.json"
        write_json_artifact(fixture_path, fixture)
        server = start_server(browser_url, port, directory)
        node = subprocess.Popen(
            [shutil.which("node") or "node", "scripts/verify-paint-release.mjs", str(fixture_path)],
            cwd=ROOT / "apps" / "web-ui",
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            stdin=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        assert node.stdout and node.stdin
        watchdog = threading.Timer(600, stop_server, args=(node,))
        watchdog.daemon = True
        watchdog.start()
        for line in node.stdout:
            print(line.rstrip(), flush=True)
            if line.strip() == "PAINT_RELEASE_RESTART":
                stop_server(server)
                server = start_server(browser_url, port, directory)
                node.stdin.write("ready\n")
                node.stdin.flush()
        return node.wait(timeout=10)
    finally:
        if watchdog:
            watchdog.cancel()
        if node and node.poll() is None:
            node.kill()
            node.wait(timeout=10)
        if server and server.poll() is None:
            stop_server(server)
        with admin.connect() as connection:
            for name in created:
                # Only exact randomly named databases created by this invocation.
                connection.execute(
                    text("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = :name"), {"name": name}
                )
                connection.execute(text(f'DROP DATABASE "{name}"'))
        admin.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
