from typing import Any

import pytest
from database.models import SessionOperationReceipt
from service.session_operation_receipts import OperationIdentity, OperationRejected, find_receipt, stage_receipt
from sqlalchemy.exc import IntegrityError


@pytest.fixture
def identity(test_game_session, test_user):
    return OperationIdentity.create(test_game_session.id, test_user.id, 'xp_award', 'request-one', {'amount': 10})


def test_receipt_flush_belongs_to_callers_transaction(test_db, identity):
    stage_receipt(test_db, identity, {'success': True, 'new_xp': 10})
    assert test_db.query(SessionOperationReceipt).count() == 1
    test_db.rollback()
    assert find_receipt(test_db, identity) is None


def test_result_is_detached_and_identity_mismatch_rejects(test_db, identity):
    stage_receipt(test_db, identity, {'success': True, 'new_xp': 10})
    test_db.commit()
    result = find_receipt(test_db, identity)
    assert result is not None
    result['new_xp'] = 999
    assert find_receipt(test_db, identity) == {'success': True, 'new_xp': 10}
    changed = OperationIdentity.create(identity.session_id, identity.actor_id, identity.domain,
                                       identity.operation_id, {'amount': 20})
    with pytest.raises(OperationRejected, match='different input'):
        find_receipt(test_db, changed)


def test_scope_and_database_uniqueness(test_db, identity, co_dm_user):
    stage_receipt(test_db, identity, {'success': True})
    test_db.commit()
    for actor, domain in ((co_dm_user.id, 'xp_award'), (identity.actor_id, 'other')):
        scoped = OperationIdentity.create(identity.session_id, actor, domain, identity.operation_id, {'amount': 10})
        assert find_receipt(test_db, scoped) is None
        stage_receipt(test_db, scoped, {'success': True})
    test_db.commit()
    with pytest.raises(IntegrityError):
        stage_receipt(test_db, identity, {'success': True})
    test_db.rollback()
    assert test_db.query(SessionOperationReceipt).count() == 3


@pytest.mark.parametrize('field,value', [('session_id', True), ('actor_id', 0), ('domain', ''),
    ('operation_id', ''), ('operation_id', 'x' * 129), ('payload', {'data': 'x' * 8192})])
def test_identity_is_bounded(field, value):
    fields: dict[str, Any] = dict(session_id=1, actor_id=1, domain='xp_award', operation_id='request', payload={})
    fields[field] = value
    with pytest.raises(OperationRejected):
        OperationIdentity.create(**fields)
