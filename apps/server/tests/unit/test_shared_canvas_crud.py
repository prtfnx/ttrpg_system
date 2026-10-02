import json

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

