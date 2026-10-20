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
