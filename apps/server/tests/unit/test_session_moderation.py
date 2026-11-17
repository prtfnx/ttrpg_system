"""Real SQL authority and atomic acceptance for WebSocket moderation."""
import json
from types import SimpleNamespace

import pytest
from database.models import AuditLog, Base, GamePlayer, GameSession, User
from service.session_moderation import ModerationOutcomeUnknown, ModerationRejected, SessionModerationService
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker


@pytest.fixture
def moderation(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'moderation.db'}")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    with factory() as db:
        db.add_all([User(id=i, username=f'user-{i}', hashed_password='unused') for i in range(1, 6)])
        db.flush()
        db.add(GameSession(id=1, session_code='ROOM', name='Moderation', owner_id=1))
        db.flush()
        db.add_all([GamePlayer(session_id=1, user_id=i, role=role)
                    for i, role in ((1, 'owner'), (2, 'co_dm'), (3, 'player'), (4, 'spectator'), (5, 'co_dm'))])
        db.commit()
    yield SimpleNamespace(factory=factory, engine=engine, service=SessionModerationService(factory))
    engine.dispose()


@pytest.mark.parametrize('ban', [False, True])
@pytest.mark.parametrize('actor,target', [(1, 3), (1, 2), (2, 3)])
def test_moderation_removes_membership_and_commits_matching_audit(moderation, actor, target, ban):
    result = moderation.service.execute('ROOM', actor, str(target), None, 'Reason', ban=ban)
    assert result.user_id == target and result.username == f'user-{target}' and result.banned is ban
    with moderation.factory() as db:
        assert db.query(GamePlayer).filter_by(session_id=1, user_id=target).one_or_none() is None
        audit = db.query(AuditLog).one()
        assert audit.event_type == ('PLAYER_BANNED' if ban else 'PLAYER_KICKED')
        assert audit.user_id == actor and audit.target_id == str(target)
        bans = json.loads(db.get(GameSession, 1).ban_list)
        assert len(bans) == (1 if ban else 0)
        if ban:
            assert bans[0]['player_id'] == str(target) and bans[0]['username'] == result.username


@pytest.mark.parametrize('actor,target', [(1, 1), (2, 1), (2, 5), (2, 2), (3, 2), (4, 3), (99, 3)])
def test_current_authority_and_hierarchy_deny_without_effects(moderation, actor, target):
    with pytest.raises(ModerationRejected):
        moderation.service.execute('ROOM', actor, target, None, 'Denied', ban=True)
    with moderation.factory() as db:
        assert db.query(GamePlayer).count() == 5 and db.query(AuditLog).count() == 0
        assert json.loads(db.get(GameSession, 1).ban_list) == []


@pytest.mark.parametrize('target,username', [(True, None), ('invalid', 'user-3'), ('3', 'user-4'), (None, None)])
def test_ambiguous_or_invalid_target_is_not_replaced_by_another_identity(moderation, target, username):
    with pytest.raises(ModerationRejected):
        moderation.service.execute('ROOM', 1, target, username, 'Reason')


def test_username_only_target_uses_canonical_persisted_identity(moderation):
    result = moderation.service.execute('ROOM', 1, None, 'user-3', 'Reason', ban=True)
    assert result.user_id == 3


@pytest.mark.parametrize('change', ['demoted', 'removed', 'disabled', 'inactive'])
def test_stale_connection_authority_cannot_grant_moderation(moderation, change):
    with moderation.factory() as db:
        member = db.query(GamePlayer).filter_by(user_id=2).one()
        if change == 'demoted':
            member.role = 'player'
        elif change == 'removed':
            db.delete(member)
        elif change == 'disabled':
            db.get(User, 2).disabled = True
        else:
            db.get(GameSession, 1).is_active = False
        db.commit()
    with pytest.raises(ModerationRejected):
        moderation.service.execute('ROOM', 2, 3, None, 'Reason')


def test_ban_preserves_other_entries_and_normalizes_target_id(moderation):
    with moderation.factory() as db:
        db.get(GameSession, 1).ban_list = json.dumps([{'player_id': '4', 'reason': 'Earlier'}, {'player_id': 3}])
        db.commit()
    moderation.service.execute('ROOM', 1, 3, None, 'New', ban=True)
    with moderation.factory() as db:
        bans = json.loads(db.get(GameSession, 1).ban_list)
        assert bans[0] == {'player_id': '4', 'reason': 'Earlier'}
        assert len(bans) == 2 and bans[1]['player_id'] == '3'


@pytest.mark.parametrize('duration', ['1d', '15', '', None, True])
def test_unsupported_timed_bans_are_rejected_instead_of_becoming_permanent(moderation, duration):
    with pytest.raises(ModerationRejected, match='permanent'):
        moderation.service.execute('ROOM', 1, 3, None, 'Reason', ban=True, duration=duration)


def test_audit_failure_rolls_back_membership_and_ban_together(moderation):
    class FailedAudit(Session):
        def flush(self, *args, **kwargs):
            if any(isinstance(row, AuditLog) for row in self.new):
                raise OSError('Audit unavailable')
            return super().flush(*args, **kwargs)

    service = SessionModerationService(sessionmaker(bind=moderation.engine, class_=FailedAudit))
    with pytest.raises(OSError):
        service.execute('ROOM', 1, 3, None, 'Reason', ban=True)
    with moderation.factory() as db:
        assert db.query(GamePlayer).filter_by(user_id=3).one()
        assert json.loads(db.get(GameSession, 1).ban_list) == [] and db.query(AuditLog).count() == 0


@pytest.mark.parametrize('committed', [False, True])
def test_lost_commit_response_carries_detached_target_without_claiming_rejection(moderation, committed):
    class LostResponse(Session):
        def commit(self):
            if committed:
                super().commit()
            raise OSError('Response lost')

    service = SessionModerationService(sessionmaker(bind=moderation.engine, class_=LostResponse))
    with pytest.raises(ModerationOutcomeUnknown) as unknown:
        service.execute('ROOM', 1, 3, None, 'Reason', ban=True)
    assert unknown.value.result.user_id == 3 and unknown.value.result.banned
    with moderation.factory() as db:
        assert (db.query(GamePlayer).filter_by(user_id=3).one_or_none() is None) is committed
        assert db.query(AuditLog).count() == int(committed)
