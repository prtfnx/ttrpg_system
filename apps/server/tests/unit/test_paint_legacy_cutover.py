import json
from datetime import datetime

import pytest
from database import models
from service.paint_legacy_cutover import (
    PaintLegacyCutoverError,
    apply_legacy_paint_cutover,
    prepare_legacy_paint_cutover,
    write_json_artifact,
)

TABLE_ID = "9e8ed60d-f18c-4f47-a5ce-fc04db50506a"


def seed_legacy_strokes(test_db):
    owner = models.User(username="paint-owner", hashed_password="x")
    test_db.add(owner)
    test_db.flush()
    session = models.GameSession(name="Paint", session_code="PAINT", owner_id=owner.id)
    test_db.add(session)
    test_db.flush()
    test_db.add(
        models.VirtualTable(
            table_id=TABLE_ID,
            name="Paint",
            width=1000,
            height=1000,
            session_id=session.id,
        )
    )
    test_db.flush()
    for source_id in (1, 2):
        test_db.add(
            models.PaintStroke(
                id=source_id,
                stroke_id=f"legacy-{source_id}",
                table_id=TABLE_ID,
                created_by=owner.id,
                stroke_data=json.dumps(
                    {
                        "id": f"legacy-{source_id}",
                        "points": [[source_id, 2, 0.5]],
                        "color": [0.1, 0.2, 0.3, 1],
                        "width": 3,
                    }
                ),
                created_at=datetime(2026, 9, 28, 10, source_id),
            )
        )
    test_db.commit()
    return owner


def test_cutover_writes_verified_objects_and_is_idempotent(test_db):
    seed_legacy_strokes(test_db)
    plan = prepare_legacy_paint_cutover(test_db)

    first = apply_legacy_paint_cutover(
        test_db,
        plan,
        expected_source_sha256=plan.conversion.source_sha256,
    )
    test_db.commit()

    assert first.inserted_count == 2
    assert first.existing_count == 0
    assert test_db.query(models.PaintStroke).count() == 2
    assert test_db.query(models.PaintObject).count() == 2
    state = test_db.get(models.PaintState, TABLE_ID)
    assert state.revision == 0
    assert state.next_z_order == 3

    repeated_plan = prepare_legacy_paint_cutover(test_db)
    repeated = apply_legacy_paint_cutover(
        test_db,
        repeated_plan,
        expected_source_sha256=repeated_plan.conversion.source_sha256,
    )
    assert repeated.inserted_count == 0
    assert repeated.existing_count == 2


def test_cutover_requires_reviewed_checksum_and_explicit_quarantine(test_db):
    seed_legacy_strokes(test_db)
    plan = prepare_legacy_paint_cutover(test_db)

    with pytest.raises(PaintLegacyCutoverError, match="checksum"):
        apply_legacy_paint_cutover(
            test_db,
            plan,
            expected_source_sha256="0" * 64,
        )

    test_db.query(models.PaintStroke).filter(models.PaintStroke.id == 1).update(
        {
            "stroke_data": "invalid",
        }
    )
    test_db.commit()
    quarantined = prepare_legacy_paint_cutover(test_db)
    with pytest.raises(PaintLegacyCutoverError, match="quarantined"):
        apply_legacy_paint_cutover(
            test_db,
            quarantined,
            expected_source_sha256=quarantined.conversion.source_sha256,
        )


def test_cutover_refuses_changed_source_and_divergent_object_state(test_db):
    seed_legacy_strokes(test_db)
    plan = prepare_legacy_paint_cutover(test_db)
    test_db.query(models.PaintStroke).filter(models.PaintStroke.id == 1).update(
        {
            "stroke_data": json.dumps({"id": "legacy-1", "points": [[99, 2]]}),
        }
    )
    test_db.flush()
    with pytest.raises(PaintLegacyCutoverError, match="source changed"):
        apply_legacy_paint_cutover(
            test_db,
            plan,
            expected_source_sha256=plan.conversion.source_sha256,
        )
    test_db.rollback()

    fresh = prepare_legacy_paint_cutover(test_db)
    first = fresh.conversion.objects[0]
    test_db.add(
        models.PaintObject(
            id=first["id"],
            table_id=first["table_id"],
            kind=first["kind"],
            geometry=first["geometry"],
            transform=first["transform"],
            style={**first["style"], "width": 9},
            created_by=first["created_by"],
            version=1,
            z_order=first["z_order"],
            created_at=datetime(2026, 9, 28, 10, 1),
            updated_at=datetime(2026, 9, 28, 10, 1),
        )
    )
    test_db.flush()
    with pytest.raises(PaintLegacyCutoverError, match="diverged"):
        apply_legacy_paint_cutover(
            test_db,
            fresh,
            expected_source_sha256=fresh.conversion.source_sha256,
        )


def test_artifacts_are_lossless_private_and_never_overwritten(test_db, tmp_path):
    seed_legacy_strokes(test_db)
    plan = prepare_legacy_paint_cutover(test_db)
    backup_path = tmp_path / "backup.json"
    report_path = tmp_path / "report.json"

    write_json_artifact(backup_path, plan.backup())
    write_json_artifact(report_path, plan.report())

    backup = json.loads(backup_path.read_text(encoding="utf-8"))
    report = json.loads(report_path.read_text(encoding="utf-8"))
    assert backup["source_sha256"] == report["source_sha256"]
    assert backup["rows"][0]["stroke_data"]
    assert "stroke_data" not in json.dumps(report)
    with pytest.raises(PaintLegacyCutoverError, match="replace existing"):
        write_json_artifact(backup_path, plan.backup())
