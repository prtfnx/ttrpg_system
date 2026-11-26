"""Receipt probes expose only the bound sender's durable operation status."""

import json
from unittest.mock import MagicMock, patch

import pytest
from core_table.protocol import Message, MessageType
from database.models import CombatActionJournal, CombatEncounter, GamePlayer
from service.combat_persistence_service import CombatPersistenceService
from sqlalchemy.orm import sessionmaker
from tests.unit.test_combat_protocol import _ProtoStub


@pytest.fixture
def receipt_service(test_db, test_game_session):
    game = test_game_session
    if not test_db.query(GamePlayer).filter_by(session_id=game.id, user_id=game.owner_id).first():
        test_db.add(GamePlayer(session_id=game.id, user_id=game.owner_id, role="owner"))
    test_db.add(CombatEncounter(encounter_id="receipt-combat", session_id=game.id, table_id="table", phase="ended"))
    test_db.flush()
    test_db.add(
        CombatActionJournal(
            encounter_id="receipt-combat",
            requester_key=f"user:{game.owner_id}",
            sequence_id=123,
            actor_id="actor",
            command_type="attack",
            command_payload_json="{}",
            result_payload_json=json.dumps({"accepted": True, "private": "not for projection"}),
            state_before_json="{}",
            state_after_hash="hash",
            state_version=4,
            created_by=game.owner_id,
        )
    )
    test_db.commit()
    return CombatPersistenceService(sessionmaker(bind=test_db.get_bind())), game


def test_receipt_probe_reports_accepted_without_private_payload(receipt_service):
    service, game = receipt_service
    assert service.probe_receipt(game.session_code, game.owner_id, "receipt-combat", 123) == {
        "combat_id": "receipt-combat",
        "sequence_id": 123,
        "status": "accepted",
        "state_version": 4,
    }
    assert service.probe_receipt(game.session_code, game.owner_id, "receipt-combat", 124)["status"] == "absent"


def test_receipts_are_scoped_to_session_and_member(receipt_service):
    service, game = receipt_service
    assert service.probe_receipt("other", game.owner_id, "receipt-combat", 123)["status"] == "unavailable"
    assert service.probe_receipt(game.session_code, 999999, "receipt-combat", 123)["status"] == "unavailable"
    assert service.probe_receipt(game.session_code, game.owner_id, "foreign", 123)["status"] == "unavailable"


def test_pending_uncertain_commit_never_becomes_absence(receipt_service, monkeypatch):
    service, game = receipt_service
    monkeypatch.setattr(service, "has_pending", lambda _code: True)
    assert service.probe_receipt(game.session_code, game.owner_id, "receipt-combat", 124)["status"] == "unavailable"


@pytest.mark.parametrize(
    "value",
    [
        {"combat_id": "c", "sequence_id": True},
        {"combat_id": "c", "sequence_id": -1},
        {"combat_id": "c", "sequence_id": 2**53},
        {"combat_id": "c", "sequence_id": 1, "user_id": 1},
    ],
)
async def test_protocol_rejects_invalid_or_client_selected_requester(value):
    proto = _ProtoStub()
    response = await proto.handle_combat_state_request(
        Message(MessageType.COMBAT_STATE_REQUEST, {"receipt_probe": value}), "c1"
    )
    assert response.type == MessageType.ERROR


async def test_spectators_cannot_probe_receipts():
    proto = _ProtoStub(role="spectator")
    response = await proto.handle_combat_state_request(
        Message(MessageType.COMBAT_STATE_REQUEST, {"receipt_probe": {"combat_id": "c", "sequence_id": 123}}), "c1"
    )
    assert response.type == MessageType.ERROR


async def test_receipt_is_returned_when_no_encounter_is_active():
    proto = _ProtoStub()

    persistence = MagicMock(spec=CombatPersistenceService)
    persistence.probe_receipt.return_value = {"combat_id": "ended", "sequence_id": 123, "status": "accepted", "state_version": 4}
    proto.combat_persistence_service = persistence
    with (
        patch("service.combat_engine.CombatEngine.get_state", return_value=None),
        patch("service.combat_engine.CombatEngine.restore", return_value=None),
    ):
        response = await proto.handle_combat_state_request(
            Message(MessageType.COMBAT_STATE_REQUEST, {"receipt_probe": {"combat_id": "ended", "sequence_id": 123}}),
            "c1",
        )
    assert response.data["combat"] is None and response.data["receipt"]["status"] == "accepted"


@pytest.mark.parametrize("asynchronous", [False, True])
async def test_saved_envelope_cannot_apply_to_a_different_encounter(asynchronous):
    from service.combat_command_service import CombatCommandService
    from service.combat_engine import CombatEngine
    from tests.unit.test_combat_command_service import _context, _state

    state, actor, _ = _state()
    before = state.to_dict()
    service = CombatCommandService()
    envelope = service.parse_envelope(
        {
            "combat_id": "old-encounter",
            "sequence_id": 123,
            "commands": [{"type": "end_turn", "actor_id": actor.combatant_id}],
        }
    )
    result = await service.apply_async(envelope, _context()) if asynchronous else service.apply(envelope, _context())
    assert not result.accepted and "encounter changed" in result.reason
    current = CombatEngine.get_state("cmd")
    assert current is not None
    assert current.to_dict() == before


@pytest.mark.parametrize("asynchronous", [False, True])
async def test_unsent_stale_plan_version_is_rejected_before_mutation(asynchronous):
    from service.combat_command_service import CombatCommandService
    from service.combat_engine import CombatEngine
    from tests.unit.test_combat_command_service import _context, _state

    state, actor, _ = _state()
    before = state.to_dict()
    service = CombatCommandService()
    envelope = service.parse_envelope(
        {
            "combat_id": state.combat_id,
            "expected_state_version": state.state_version + 1,
            "commands": [{"type": "end_turn", "actor_id": actor.combatant_id}],
        }
    )
    result = await service.apply_async(envelope, _context()) if asynchronous else service.apply(envelope, _context())
    assert not result.accepted and "state changed" in result.reason
    current = CombatEngine.get_state("cmd")
    assert current is not None
    assert current.to_dict() == before


def test_disabled_account_cannot_probe_receipts(receipt_service, test_db):
    from database.models import User

    service, game = receipt_service
    test_db.get(User, game.owner_id).disabled = True
    test_db.commit()
    assert service.probe_receipt(game.session_code, game.owner_id, "receipt-combat", 123)["status"] == "unavailable"


def test_accepted_duplicate_is_recovered_before_stale_version_guard(receipt_service):
    from dataclasses import replace

    from service.combat_command_service import CombatCommandService
    from service.combat_engine import CombatEngine
    from tests.unit.test_combat_command_service import _context, _state

    persistence, game = receipt_service
    state, actor, _ = _state()
    CombatEngine._active[game.session_code] = state
    context = replace(_context(), session_code=game.session_code, user_id=game.owner_id)
    service = CombatCommandService(persistence=persistence)
    envelope = service.parse_envelope(
        {
            "combat_id": state.combat_id,
            "sequence_id": 77,
            "expected_state_version": 0,
            "commands": [{"type": "dodge", "actor_id": actor.combatant_id}],
        }
    )
    try:
        first = service.apply(envelope, context)
        assert first.accepted and state.state_version == 1
        before = state.to_dict()
        repeated = service.apply(envelope, context)
        assert repeated.accepted and repeated.duplicate
        assert state.to_dict() == before
    finally:
        CombatEngine._active.pop(game.session_code, None)
        CombatEngine._active.pop("cmd", None)


async def test_conflicting_plan_receives_current_role_filtered_state():
    from service.combat_engine import CombatEngine
    from tests.unit.test_combat_command_service import _state

    state, actor, _ = _state()
    CombatEngine._active["TST"] = state
    proto = _ProtoStub(role="player")
    try:
        result = await proto.handle_combat_command(
            Message(
                MessageType.COMBAT_COMMAND,
                {
                    "combat_id": state.combat_id,
                    "expected_state_version": state.state_version + 1,
                    "sequence_id": 123,
                    "commands": [{"type": "end_turn", "actor_id": actor.combatant_id}],
                },
            ),
            "c1",
        )
        assert result.type == MessageType.ACTION_REJECTED
        assert result.data["details"]["code"] == "combat_state_conflict"
        assert result.data["combat"]["state_version"] == state.state_version
        assert "actor_actions" not in result.data["combat"]["combatants"][1]
    finally:
        CombatEngine._active.pop("TST", None)
        CombatEngine._active.pop("cmd", None)


@pytest.mark.parametrize("asynchronous", [False, True])
async def test_accepted_identity_cannot_acknowledge_a_different_command(receipt_service, asynchronous):
    from dataclasses import replace

    from service.combat_command_service import CombatCommandService
    from service.combat_engine import CombatEngine
    from tests.unit.test_combat_command_service import _context, _state

    persistence, game = receipt_service
    state, actor, _ = _state()
    CombatEngine._active[game.session_code] = state
    context = replace(_context(), session_code=game.session_code, user_id=game.owner_id)
    service = CombatCommandService(persistence=persistence)
    first = service.parse_envelope({"sequence_id": 78, "commands": [{"type": "dodge", "actor_id": actor.combatant_id}]})
    different = service.parse_envelope(
        {"sequence_id": 78, "commands": [{"type": "end_turn", "actor_id": actor.combatant_id}]}
    )
    try:
        accepted = await service.apply_async(first, context) if asynchronous else service.apply(first, context)
        assert accepted.accepted
        before = state.to_dict()
        result = await service.apply_async(different, context) if asynchronous else service.apply(different, context)
        assert not result.accepted
        assert result.details == {"code": "combat_identity_conflict"}
        current = CombatEngine.get_state(game.session_code)
        assert current is not None
        assert current.to_dict() == before
        assert persistence.probe_receipt(game.session_code, game.owner_id, state.combat_id, 78)["status"] == "accepted"
    finally:
        CombatEngine._active.pop(game.session_code, None)
        CombatEngine._active.pop("cmd", None)


@pytest.mark.parametrize("sequence_id", [True, -1, 1.0, 1.5, "123", 2**53])
def test_combat_sequence_identity_requires_a_javascript_safe_integer(sequence_id):
    from pydantic import ValidationError
    from service.combat_command_service import CombatCommandService

    with pytest.raises(ValidationError):
        CombatCommandService().parse_envelope(
            {
                "sequence_id": sequence_id,
                "commands": [{"type": "dodge", "actor_id": "actor"}],
            }
        )


@pytest.mark.parametrize("sequence_id", [0, 2**53 - 1])
def test_combat_sequence_identity_accepts_safe_integer_boundaries(sequence_id):
    from service.combat_command_service import CombatCommandService

    envelope = CombatCommandService().parse_envelope(
        {
            "sequence_id": sequence_id,
            "commands": [{"type": "dodge", "actor_id": "actor"}],
        }
    )
    assert envelope.sequence_id == sequence_id


def test_legacy_envelope_without_null_preconditions_can_still_recover(receipt_service):
    from dataclasses import replace

    from service.combat_command_service import CombatCommandService
    from service.combat_engine import CombatEngine
    from tests.unit.test_combat_command_service import _context, _state

    persistence, game = receipt_service
    state, actor, _ = _state()
    CombatEngine._active[game.session_code] = state
    context = replace(_context(), session_code=game.session_code, user_id=game.owner_id)
    service = CombatCommandService(persistence=persistence)
    envelope = service.parse_envelope(
        {"sequence_id": 79, "commands": [{"type": "dodge", "actor_id": actor.combatant_id}]}
    )
    try:
        assert service.apply(envelope, context).accepted
        with persistence._session_factory() as db:
            row = db.query(CombatActionJournal).filter_by(encounter_id=state.combat_id, sequence_id=79).one()
            payload = json.loads(row.command_payload_json)
            payload.pop("combat_id")
            payload.pop("expected_state_version")
            row.command_payload_json = json.dumps(payload)
            db.commit()
        before = state.to_dict()
        result = service.apply(envelope, context)
        assert result.accepted and result.duplicate
        current = CombatEngine.get_state(game.session_code)
        assert current is not None
        assert current.to_dict() == before
    finally:
        CombatEngine._active.pop(game.session_code, None)
        CombatEngine._active.pop("cmd", None)
