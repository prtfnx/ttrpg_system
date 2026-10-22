import pytest
from core_table.protocol import Message


@pytest.mark.parametrize("kind,fields", [("drag", {"x": 1, "y": 2}),
    ("resize", {"width": 50, "height": 50}), ("rotate", {"rotation": 45})])
def test_preview_contract_accepts_bounded_metadata_and_rejects_invalid_samples(kind, fields):
    data = {"id": "sprite", "table_id": "table", "sequence": 2, "expires_at": 1000,
        "source_client_id": "peer", **fields}
    envelope = {"type": f"sprite_{kind}_preview", "data": data}
    assert Message.from_dict(envelope).data == data
    for patch in [{"sequence": -1}, {"sequence": True}, {"expires_at": "bad"},
                  {"authority": "owner"}, {next(iter(fields)): "bad"}]:
        with pytest.raises(ValueError):
            Message.from_dict({**envelope, "data": {**data, **patch}})


@pytest.mark.parametrize("offset", [-100_000, 0, 100_000])
def test_relative_preview_lifetime_does_not_depend_on_sender_clock(monkeypatch, offset):
    from service.protocol import sprites
    monkeypatch.setattr(sprites.time, "time", lambda: 1000)
    incoming = {"preview_id": "gesture", "sequence": 1, "ttl_ms": 1500, "expires_at": 1000000 + offset}
    fields = sprites._preview_fields(incoming, "trusted-client")
    assert fields == {"preview_id": "gesture", "sequence": 1, "ttl_ms": 1500,
        "expires_at": 1001500, "source_client_id": "trusted-client"}
    assert sprites._preview_fields({**incoming, "ttl_ms": 2001}, "trusted-client") is None
    assert Message.from_dict({"type": "sprite_drag_preview", "data": {
        "id": "sprite", "table_id": "table", "x": 1, "y": 2, **fields}})
