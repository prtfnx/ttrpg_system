"""Receipt metadata survives history trimming without storing scene payloads."""
import pytest
from database import models
from service.canvas_write_recovery import (
    CanvasWriteIntent,
    CanvasWriteUnknown,
    PendingCanvasWrite,
    resolve_canvas_write,
)

from .test_canvas_command_service import PAINT, TABLE
from .test_canvas_command_service import scene as scene


def pending(scene, command):
    return PendingCanvasWrite(CanvasWriteIntent.create(scene['session'], scene['actor'], command, scene['service']),
        'original-envelope', scene['factory'])


def undo_attempt(scene):
    scene['execute']()
    command = scene['command']('undo')
    attempt = pending(scene, command)
    scene['execute'](command, attempt=attempt)
    return attempt


def test_current_undo_projection_is_recoverable_after_undo_bodies_expire(scene):
    attempt = undo_attempt(scene)
    assert attempt.targets == ('sprite',)
    attempt.targets = None
    attempt.accepted = True
    with scene['factory']() as db:
        for row in db.query(models.CanvasCommandJournal).all():
            row.changes, row.changes_bytes, row.state = None, 0, 'expired'
        db.commit()
    outcome = resolve_canvas_write(attempt)
    assert outcome.committed and outcome.authorized
    sprite = outcome.sprites[TABLE]['sprite']
    assert sprite is not None and sprite.position == (10, 20)
    assert outcome.receipt is not None and not outcome.receipt['can_undo'] and not outcome.receipt['can_redo']


@pytest.mark.parametrize('replayed', [False, True])
def test_legacy_receipt_only_replay_is_not_a_new_cache_mutation(scene, replayed):
    attempt = undo_attempt(scene)
    attempt.targets, attempt.replayed = None, replayed
    with scene['factory']() as db:
        row = db.query(models.CanvasCommandJournal).filter_by(operation_id=attempt.intent.operation_id).one()
        row.result_json = {'receipt': row.result_json['receipt']}
        db.commit()
    if replayed:
        outcome = resolve_canvas_write(attempt)
        assert outcome.committed and outcome.sprites == {}
    else:
        with pytest.raises(CanvasWriteUnknown, match='identities'):
            resolve_canvas_write(attempt)


def test_payload_hash_mismatch_cannot_settle_an_admitted_command(scene):
    command = scene['command']()
    attempt = pending(scene, command)
    scene['execute'](command, attempt=attempt)
    with scene['factory']() as db:
        db.query(models.CanvasCommandJournal).one().request_hash = 'different'
        db.commit()
    with pytest.raises(CanvasWriteUnknown, match='identity'):
        resolve_canvas_write(attempt)


def test_recovered_selection_does_not_expose_a_current_private_sprite(scene, player_user):
    command = scene['command']('copy')
    attempt = pending(scene, command)
    scene['execute'](command, attempt=attempt)
    with scene['factory']() as db:
        db.get(models.GameSession, scene['session']).owner_id = player_user.id
        db.query(models.GamePlayer).filter_by(session_id=scene['session'], user_id=scene['actor']).one().role = 'player'
        db.query(models.Entity).filter_by(sprite_id='sprite').one().layer = 'dungeon_master'
        db.commit()
    outcome = resolve_canvas_write(attempt)
    assert outcome.authorized and outcome.receipt is not None
    assert outcome.receipt['selection'] == [{'kind': 'paint', 'id': PAINT}]
    assert 'events' not in outcome.receipt and 'sprite_data' not in outcome.receipt
