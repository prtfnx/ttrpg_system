from database import crud, models, schemas


def test_virtual_table_creation_seeds_the_paint_lock_row(test_db, test_game_session):
    table = crud.create_virtual_table(
        test_db,
        schemas.VirtualTableCreate(
            table_id="paint-state-table",
            name="Paint state",
            width=800,
            height=600,
            session_id=test_game_session.id,
        ),
    )

    state = test_db.get(models.PaintState, table.table_id)
    assert state is not None
    assert state.revision == 0
    assert state.next_z_order == 1
