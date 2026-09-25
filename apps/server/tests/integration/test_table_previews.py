from io import BytesIO

from database import models
from PIL import Image


def _webp(size=(640, 360)) -> bytes:
    output = BytesIO()
    Image.new("RGB", size, (18, 32, 48)).save(output, format="WEBP", quality=80)
    return output.getvalue()


def _table(test_db, test_game_session):
    table = models.VirtualTable(
        table_id="550e8400-e29b-41d4-a716-446655440000",
        name="Cavern",
        width=2000,
        height=1200,
        session_id=test_game_session.id,
    )
    test_db.add(table)
    test_db.commit()
    return table


def test_dm_can_replace_and_conditionally_read_preview(
    auth_client, test_db, test_game_session
):
    table = _table(test_db, test_game_session)
    upload = auth_client.post(
        f"/game/api/sessions/TEST01/tables/{table.table_id}/preview",
        files={"preview": ("preview.webp", _webp(), "image/webp")},
    )
    assert upload.status_code == 200
    assert len(upload.json()["etag"]) == 64

    read = auth_client.get(
        f"/game/api/sessions/TEST01/tables/{table.table_id}/preview"
    )
    assert read.status_code == 200
    assert read.headers["content-type"] == "image/webp"
    assert read.headers["cache-control"] == "private, no-cache"

    unchanged = auth_client.get(
        f"/game/api/sessions/TEST01/tables/{table.table_id}/preview",
        headers={"If-None-Match": read.headers["etag"]},
    )
    assert unchanged.status_code == 304


def test_preview_rejects_wrong_dimensions(auth_client, test_db, test_game_session):
    table = _table(test_db, test_game_session)
    response = auth_client.post(
        f"/game/api/sessions/TEST01/tables/{table.table_id}/preview",
        files={"preview": ("preview.webp", _webp((320, 180)), "image/webp")},
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "Preview must be a 640x360 WebP image"


def test_player_cannot_access_dm_preview(
    test_db, game_session_with_players, player_user
):
    import pytest
    from fastapi import HTTPException
    from routers.game import _dm_table

    table = _table(test_db, game_session_with_players)
    with pytest.raises(HTTPException) as denied:
        _dm_table(test_db, "TEST01", table.table_id, player_user.id)
    assert denied.value.status_code == 403
