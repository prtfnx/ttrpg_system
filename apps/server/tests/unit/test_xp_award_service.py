import json
from contextlib import contextmanager
from types import SimpleNamespace

import pytest
from database import models
from service import xp_award_service
from service.session_operation_receipts import OperationOutcomeUnknown, OperationRejected
from service.xp_award_service import XPAwardIntent, XPAwardService
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker


@pytest.fixture
def awards(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'xp.db'}", connect_args={'check_same_thread': False})
    models.Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    with factory() as db:
        db.add_all([models.User(id=i, username=f'xp-{i}', email=f'xp-{i}@example.com', hashed_password='unused')
                    for i in (1, 2, 3)])
        db.flush()
        db.add_all([models.GameSession(id=i, name='XP', session_code=f'XP{i}', owner_id=1, is_active=True)
                    for i in (1, 2)])
        db.flush()
        db.add_all([models.GamePlayer(session_id=1, user_id=2, role='co_dm'),
                    models.GamePlayer(session_id=1, user_id=3, role='player'),
                    models.SessionCharacter(character_id='hero', session_id=1, owner_user_id=3,
                        character_name='Hero', character_data=json.dumps({'character_id': 'hero', 'name': 'Hero',
                            'data': {'experience': 250, 'level': 1, 'stats': {'hp': 7, 'ac': 12},
                                     'notes': 'Preserve', 'classes': [{'name': 'wizard', 'level': 1}]}}))])
        db.commit()

    def intent(request='award-one', amount=100, actor=1, session=1, **overrides):
        return XPAwardIntent.create(session, actor, request,
            dict(character_id='hero', amount=amount, source='quest', **overrides))

    yield SimpleNamespace(factory=factory, engine=engine, intent=intent, service=XPAwardService(factory))
    engine.dispose()


def test_effect_audit_version_and_receipt_survive_service_restart_once(awards):
    result = awards.service.execute(awards.intent())
    assert result['new_xp'] == 350 and result['leveled_up'] and result['new_level'] == 2
    assert result['character_data']['data']['stats'] == {'hp': 7, 'ac': 12}
    assert result['character_data']['data']['notes'] == 'Preserve'
    assert result['character_data']['data']['pending_level_up']
    replay = XPAwardService(awards.factory).execute(awards.intent())
    assert replay['replayed'] and replay['resync_required'] and 'character_data' not in replay
    assert replay['new_xp'] == 350 and replay['version'] == result['version'] == 2
    second = awards.service.execute(awards.intent('award-two'))
    assert second['new_xp'] == 450 and second['version'] == 3
    with awards.factory() as db:
        assert db.query(models.CharacterLog).count() == db.query(models.SessionOperationReceipt).count() == 2
        audit = db.query(models.CharacterLog).order_by(models.CharacterLog.id).first()
        assert audit is not None and audit.action_type == 'xp_award'
        assert audit.user_id == audit.session_id == 1 and audit.description == '+100 XP from quest'
        source = db.query(models.SessionCharacter).one()
        assert source.version == 3 and json.loads(source.character_data)['data']['experience'] == 450


def test_payload_mismatch_and_cross_session_target_reject_without_effect(awards):
    awards.service.execute(awards.intent())
    with pytest.raises(OperationRejected, match='different input'):
        awards.service.execute(awards.intent(amount=200))
    with pytest.raises(OperationRejected, match='not found'):
        awards.service.execute(awards.intent(session=2))
    with awards.factory() as db:
        assert db.query(models.CharacterLog).count() == db.query(models.SessionOperationReceipt).count() == 1


def test_current_dm_authority_is_rechecked_before_replay(awards):
    awards.service.execute(awards.intent(actor=2))
    with awards.factory() as db:
        db.query(models.GamePlayer).filter_by(user_id=2).one().role = 'player'
        db.commit()
    with pytest.raises(OperationRejected, match='DM authority'):
        awards.service.execute(awards.intent(actor=2))
    with pytest.raises(OperationRejected, match='DM authority'):
        awards.service.execute(awards.intent(actor=3))


def test_receipt_stays_available_after_target_archive(awards):
    from utils.time import utc_now
    awards.service.execute(awards.intent())
    with awards.factory() as db:
        db.query(models.SessionCharacter).one().archived_at = utc_now()
        db.commit()
    assert awards.service.execute(awards.intent())['replayed']
    with pytest.raises(OperationRejected, match='not found'):
        awards.service.execute(awards.intent('new-after-archive'))


def test_failure_after_receipt_flush_rolls_back_every_effect(awards, monkeypatch):
    stage = xp_award_service.stage_receipt

    def fail(*args):
        stage(*args)
        raise RuntimeError('Failure after all flushes')

    monkeypatch.setattr(xp_award_service, 'stage_receipt', fail)
    with pytest.raises(OperationRejected, match='could not be saved'):
        awards.service.execute(awards.intent())
    with awards.factory() as db:
        assert db.query(models.SessionOperationReceipt).count() == db.query(models.CharacterLog).count() == 0
        assert db.query(models.SessionCharacter).one().version == 1


def test_existing_higher_level_and_equal_legacy_xp_are_preserved_and_normalized(awards):
    with awards.factory() as db:
        source = db.query(models.SessionCharacter).one()
        document = json.loads(source.character_data)
        document['data'].update(level=5, currentXP=250)
        document['experience'] = 250
        source.character_data = json.dumps(document)
        db.commit()
    result = awards.service.execute(awards.intent())
    assert result['new_level'] == 5 and not result['leveled_up']
    document = result['character_data']
    assert document['data']['experience'] == 350 and document['data']['level'] == 5
    assert 'experience' not in document and 'currentXP' not in document['data']


@pytest.mark.parametrize('committed', [False, True])
@pytest.mark.parametrize('lookup_outage', [False, True])
def test_commit_response_loss_resolves_or_retains_original_identity(awards, committed, lookup_outage):
    class LostResponse(Session):
        def commit(self):
            if committed:
                super().commit()
            raise RuntimeError('Lost commit response')

    calls = 0

    @contextmanager
    def failing_factory():
        nonlocal calls
        calls += 1
        if calls == 2 and lookup_outage:
            raise RuntimeError('Receipt lookup unavailable')
        factory = sessionmaker(bind=awards.engine, class_=LostResponse) if calls == 1 else awards.factory
        with factory() as db:
            yield db

    service = XPAwardService(failing_factory)
    if lookup_outage:
        with pytest.raises(OperationOutcomeUnknown):
            service.execute(awards.intent())
    elif committed:
        assert service.execute(awards.intent())['replayed']
    else:
        with pytest.raises(OperationRejected, match='not committed'):
            service.execute(awards.intent())
    # A reconstructed service can safely repeat the exact original intent.
    assert awards.service.execute(awards.intent())['new_xp'] == 350
    with awards.factory() as db:
        assert db.query(models.CharacterLog).count() == db.query(models.SessionOperationReceipt).count() == 1
        assert db.query(models.SessionCharacter).one().version == 2


@pytest.mark.parametrize('data', [dict(amount=True), dict(amount=1.5), dict(amount='100'),
    dict(amount=0), dict(amount=1_000_001), dict(source='x' * 51), dict(description='x' * 301)])
def test_invalid_award_input_cannot_reach_acceptance(data):
    payload = dict(character_id='hero', amount=100, source='quest')
    payload.update(data)
    with pytest.raises(OperationRejected):
        XPAwardIntent.create(1, 1, 'request', payload)


@pytest.mark.parametrize('xp_fields', [dict(experience=250, currentXP=251), dict(experience=-1)])
def test_invalid_stored_xp_rejects_before_audit_or_receipt(awards, xp_fields):
    with awards.factory() as db:
        source = db.query(models.SessionCharacter).one()
        document = json.loads(source.character_data)
        document['data'].update(xp_fields)
        source.character_data = json.dumps(document)
        db.commit()
    with pytest.raises(OperationRejected):
        awards.service.execute(awards.intent())
    with awards.factory() as db:
        assert db.query(models.CharacterLog).count() == db.query(models.SessionOperationReceipt).count() == 0
