import json

import pytest
from database import crud, models


def test_shared_measurement_upsert_and_creator_scoped_delete(
    test_db, test_game_session, test_user, player_user
):
    table = models.VirtualTable(
        table_id="table-shared",
        name="Shared",
        width=800,
        height=600,
        session_id=test_game_session.id,
    )
    test_db.add(table)
    test_db.commit()

    created = crud.upsert_shared_measurement(
        test_db,
        table_id=table.table_id,
        measurement_id="measurement-1",
        created_by=test_user.id,
        kind="line",
        measurement_data=json.dumps({"id": "measurement-1", "distance": 5}),
    )
    updated = crud.upsert_shared_measurement(
        test_db,
        table_id=table.table_id,
        measurement_id="measurement-1",
        created_by=test_user.id,
        kind="line",
        measurement_data=json.dumps({"id": "measurement-1", "distance": 10}),
    )

    assert updated.id == created.id
    assert updated.to_dict()["measurement"]["distance"] == 10
    assert not crud.delete_shared_measurement(
        test_db,
        table.table_id,
        created.measurement_id,
        created_by=player_user.id,
    )
    assert crud.delete_shared_measurement(
        test_db,
        table.table_id,
        created.measurement_id,
        created_by=test_user.id,
    )


def test_paint_templates_are_session_scoped_and_creator_owned(
    test_db, test_game_session, test_user, player_user
):
    created = crud.create_paint_template(
        test_db,
        session_id=test_game_session.id,
        template_id="template-1",
        created_by=test_user.id,
        name="Fire",
        description="A fire marker",
        strokes_json=json.dumps([{"id": "stroke-1"}]),
        thumbnail=None,
    )

    assert crud.get_paint_templates(test_db, test_game_session.id) == [created]
    assert created.to_dict()["strokeCount"] == 1
    assert not crud.delete_paint_template(
        test_db,
        test_game_session.id,
        created.template_id,
        created_by=player_user.id,
    )
    assert crud.delete_paint_template(
        test_db,
        test_game_session.id,
        created.template_id,
        created_by=test_user.id,
    )


def test_paint_template_upsert_preserves_creator_ownership(
    test_db, test_game_session, test_user, player_user
):
    created = crud.upsert_paint_template(
        test_db,
        session_id=test_game_session.id,
        template_id="template-upsert",
        created_by=test_user.id,
        name="Original",
        description=None,
        strokes_json=json.dumps([{"id": "stroke-1"}]),
        thumbnail=None,
    )
    updated = crud.upsert_paint_template(
        test_db,
        session_id=test_game_session.id,
        template_id=created.template_id,
        created_by=test_user.id,
        name="Updated",
        description="Changed",
        strokes_json=json.dumps([{"id": "stroke-2"}]),
        thumbnail=None,
    )

    assert updated.id == created.id
    assert updated.name == "Updated"
    with pytest.raises(PermissionError):
        crud.upsert_paint_template(
            test_db,
            session_id=test_game_session.id,
            template_id=created.template_id,
            created_by=player_user.id,
            name="Hijacked",
            description=None,
            strokes_json="[]",
            thumbnail=None,
        )
