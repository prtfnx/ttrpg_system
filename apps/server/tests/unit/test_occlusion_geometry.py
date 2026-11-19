import math
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from core_table.protocol import Message, MessageType
from core_table.table import VirtualTable
from service.occlusion_geometry import obstacle_occlusion_snapshot
from service.protocol.helpers import _HelpersMixin
from service.protocol.tables import _TablesMixin


def obstacle(table, **values):
    return table.add_entity({'sprite_id': 'private-obstacle', 'name': 'Secret room',
        'position': [100, 100], 'layer': 'obstacles', 'width': 20, 'height': 10,
        'metadata': 'private notes', 'asset_id': 'private-asset', **values})


def test_scaled_rotated_rectangle_matches_rendered_boundary_without_identity():
    table = VirtualTable('Geometry', 1000, 1000)
    obstacle(table, scale_x=2, scale_y=3, rotation=90)
    snapshot = obstacle_occlusion_snapshot(table)
    assert snapshot['valid']
    assert snapshot['segments'] == pytest.approx([
        135, 95, 135, 135, 135, 135, 105, 135,
        105, 135, 105, 95, 105, 95, 135, 95,
    ])
    assert set(snapshot) == {'schema_version', 'valid', 'segments'}
    assert 'Secret' not in str(snapshot) and 'private' not in str(snapshot)


@pytest.mark.parametrize('kind', ['line', 'polygon'])
def test_world_vertices_are_not_transformed_a_second_time(kind):
    table = VirtualTable('Geometry', 1000, 1000)
    obstacle(table, obstacle_type=kind, obstacle_data={'vertices': [[5, 6], [50, 6], [30, 60]]},
             scale_x=3, rotation=90)
    snapshot = obstacle_occlusion_snapshot(table)
    assert snapshot['valid']
    assert snapshot['segments'][:4] == [5, 6, 50, 6]
    assert len(snapshot['segments']) == (4 if kind == 'line' else 12)


def test_circle_has_a_closed_32_segment_ellipse_boundary():
    table = VirtualTable('Geometry', 1000, 1000)
    obstacle(table, obstacle_type='circle')
    segments = obstacle_occlusion_snapshot(table)['segments']
    assert len(segments) == 128
    assert segments[:2] == pytest.approx(segments[-2:])
    assert all(math.isfinite(value) for value in segments)


def test_invalid_or_oversized_geometry_never_publishes_a_partial_boundary(monkeypatch):
    table = VirtualTable('Geometry', 1000, 1000)
    entity = obstacle(table)
    monkeypatch.setattr('service.occlusion_geometry.MAX_SEGMENTS', 3)
    assert obstacle_occlusion_snapshot(table) == {'schema_version': 1, 'valid': False, 'segments': []}
    monkeypatch.setattr('service.occlusion_geometry.MAX_SEGMENTS', 8192)
    entity.rotation = float('nan')
    assert not obstacle_occlusion_snapshot(table)['valid']


class Harness(_TablesMixin, _HelpersMixin):
    def __init__(self, table):
        self.table_manager = SimpleNamespace(get_table=lambda _: table)
        self.actions = SimpleNamespace(get_table=AsyncMock(return_value=SimpleNamespace(success=True, data={'table': table})))
        self.session_manager = SimpleNamespace(broadcast_filtered=AsyncMock(), broadcast_to_session=AsyncMock())

    def _get_session_id(self, _msg):
        return 1

    def _get_user_id(self, *_args):
        return 7

    def _get_session_code(self, *_args):
        return 'geometry'

    def _get_client_role(self, _client):
        return 'player'

    async def add_asset_hashes_to_table(self, value, **_kwargs):
        return deepcopy(value)


async def test_public_snapshot_has_geometry_without_obstacle_sprites(monkeypatch):
    table = VirtualTable('Geometry', 1000, 1000)
    obstacle(table)
    harness = Harness(table)
    monkeypatch.setattr('service.protocol.tables.load_table_hydration', lambda _: SimpleNamespace(
        walls=[], layer_settings={}, settings_revision=0))
    result = await harness.handle_table_request(Message(MessageType.TABLE_REQUEST, {'table_id': str(table.table_id)}), 'player')
    assert result.type == MessageType.TABLE_RESPONSE
    payload = result.data['table_data']
    assert 'obstacles' not in payload['layers']
    geometry = payload['occlusion_geometry']
    assert all(geometry[key] == value for key, value in obstacle_occlusion_snapshot(table).items())
    assert geometry['revision'] == 1 and geometry['epoch']
    assert 'private' not in str(payload) and 'Secret room' not in str(payload)


async def test_post_commit_publications_replace_geometry_and_clear_last_obstacle():
    table = VirtualTable('Geometry', 1000, 1000)
    entity = obstacle(table)
    harness = Harness(table)
    event = Message(MessageType.SPRITE_UPDATE, {'table_id': str(table.table_id), 'sprite_id': entity.sprite_id})
    await harness.broadcast_filtered(event, 'obstacles', 'dm')
    first = harness.session_manager.broadcast_to_session.call_args.args[0]
    assert first.data['occlusion_geometry']['segments']
    assert harness.session_manager.broadcast_to_session.call_args.kwargs['exclude_client'] is None
    # Identical publications need no extra geometry message.
    await harness.broadcast_filtered(event, 'obstacles', 'dm')
    assert harness.session_manager.broadcast_to_session.call_count == 1
    entity.position = (200, 100)
    await harness.broadcast_filtered(event, 'obstacles', 'dm')
    assert harness.session_manager.broadcast_to_session.call_count == 2
    table.entities.clear()
    await harness.broadcast_filtered(event, 'obstacles', 'dm')
    final = harness.session_manager.broadcast_to_session.call_args.args[0]
    assert final.data['table_id'] == str(table.table_id)
    assert final.data['type'] == 'occlusion_geometry'
    geometry = final.data['occlusion_geometry']
    assert geometry['valid'] and geometry['segments'] == [] and geometry['revision'] == 3
    assert geometry['epoch'] == first.data['occlusion_geometry']['epoch']
    await harness.broadcast_to_session(Message(MessageType.TABLE_UPDATE, {
        'operation': 'delete', 'table_id': str(table.table_id),
    }))
    assert not harness._occlusion_cache and not harness._published_occlusion
