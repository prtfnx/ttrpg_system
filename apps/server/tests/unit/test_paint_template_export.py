import json

import pytest
from database import models
from service.paint_legacy_cutover import PaintLegacyCutoverError, write_json_artifact
from service.paint_template_export import build_paint_template_export


def test_template_export_is_lossless_stable_and_non_overwriting(
    test_db,
    test_game_session,
    test_user,
    tmp_path,
):
    test_db.add(models.PaintTemplate(
        template_id="template-1",
        session_id=test_game_session.id,
        created_by=test_user.id,
        name="Fire",
        description="Legacy marker",
        strokes_json='[{"unrecognized":"preserved verbatim"}]',
        thumbnail="data:image/png;base64,AA==",
    ))
    test_db.commit()

    first = build_paint_template_export(test_db)
    repeated = build_paint_template_export(test_db)

    assert repeated == first
    assert first["source_count"] == 1
    assert len(first["source_sha256"]) == 64
    assert first["templates"][0]["strokes_json"] == (
        '[{"unrecognized":"preserved verbatim"}]'
    )

    output = tmp_path / "paint-templates.json"
    write_json_artifact(output, first)
    assert json.loads(output.read_text(encoding="utf-8")) == first
    with pytest.raises(PaintLegacyCutoverError, match="Refusing to replace"):
        write_json_artifact(output, first)
