import json
import math
from datetime import datetime

from core_table.paint import validate_paint_object
from service.paint_legacy_migration import (
    LegacyPaintStrokeRecord,
    convert_legacy_paint_strokes,
)


def legacy_record(
    source_id: int,
    *,
    table_id: str = "9e8ed60d-f18c-4f47-a5ce-fc04db50506a",
    stroke_id: str | None = None,
    stroke_data: dict | str | None = None,
    created_by: int | None = 7,
    created_at: datetime | None = datetime(2026, 9, 28, 10, 0),
) -> LegacyPaintStrokeRecord:
    resolved_stroke_id = stroke_id or f"legacy-{source_id}"
    payload = stroke_data or {
        "id": resolved_stroke_id,
        "points": [{"x": 1, "y": 2, "pressure": 0.25}],
        "color": [0.1, 0.2, 0.3, 1],
        "width": 3,
        "blend_mode": "Alpha",
    }
    return LegacyPaintStrokeRecord(
        source_id=source_id,
        stroke_id=resolved_stroke_id,
        table_id=table_id,
        created_by=created_by,
        stroke_data=payload if isinstance(payload, str) else json.dumps(payload),
        created_at=created_at,
    )


def test_conversion_is_deterministic_and_assigns_table_local_order():
    first = legacy_record(1, created_at=datetime(2026, 9, 28, 11, 0))
    second = legacy_record(2, created_at=datetime(2026, 9, 28, 10, 0))
    other = legacy_record(
        3,
        table_id="d57d06dc-85d1-42a7-a928-2d1fa10848f9",
    )

    conversion = convert_legacy_paint_strokes([first, other, second])
    repeated = convert_legacy_paint_strokes([second, first, other])

    assert conversion.source_sha256 == repeated.source_sha256
    assert conversion.objects == repeated.objects
    assert conversion.id_mapping == repeated.id_mapping
    assert [item["z_order"] for item in conversion.objects] == [1, 2, 1]
    assert conversion.converted_count == 3
    assert not conversion.quarantined
    for paint_object in conversion.objects:
        validate_paint_object(paint_object)


def test_conversion_accepts_tuple_points_and_documented_defaults():
    conversion = convert_legacy_paint_strokes([
        legacy_record(1, stroke_data={"points": [[0, 1], [2, 3, 0.75]]})
    ])

    paint_object = conversion.objects[0]
    assert paint_object["geometry"]["points"] == [
        {"x": 0.0, "y": 1.0, "pressure": 0.5},
        {"x": 2.0, "y": 3.0, "pressure": 0.75},
    ]
    assert paint_object["style"] == {
        "stroke_rgba": [1.0, 1.0, 1.0, 1.0],
        "width": 2.0,
        "fill_rgba": None,
    }


def test_conversion_quarantines_every_invalid_row_without_consuming_z_order():
    records = [
        legacy_record(1, stroke_data="not json"),
        legacy_record(2, created_by=None),
        legacy_record(3, stroke_data={"points": []}),
        legacy_record(4, stroke_data={"points": [{"x": math.inf, "y": 0}]}),
        legacy_record(5, stroke_data={"points": [[0, 0]], "blend_mode": "Additive"}),
        legacy_record(6),
    ]

    conversion = convert_legacy_paint_strokes(records)

    assert conversion.source_count == 6
    assert conversion.converted_count == 1
    assert conversion.objects[0]["z_order"] == 1
    assert len(conversion.quarantined) == 5
    assert len(conversion.id_mapping) == 6
    assert all(len(row.payload_sha256) == 64 for row in conversion.quarantined)
    assert conversion.report()["quarantined_count"] == 5


def test_conversion_quarantines_mismatched_embedded_id_and_oversized_path():
    oversized = [{"x": index, "y": 0, "pressure": 0.5} for index in range(3000)]
    conversion = convert_legacy_paint_strokes([
        legacy_record(1, stroke_data={"id": "different", "points": [[0, 0]]}),
        legacy_record(2, stroke_data={"points": oversized}),
    ])

    assert not conversion.objects
    assert "does not match" in conversion.quarantined[0].reason
    assert "serialized limit" in conversion.quarantined[1].reason


def test_report_contains_source_checksum_mapping_and_no_raw_payloads():
    conversion = convert_legacy_paint_strokes([legacy_record(1, stroke_data="invalid")])

    report = conversion.report()
    assert len(report["source_sha256"]) == 64
    assert report["id_mapping"]
    assert set(report["quarantined"][0]) == {
        "source_id",
        "stroke_id",
        "table_id",
        "reason",
        "payload_sha256",
    }
    assert '"invalid"' not in json.dumps(report)
