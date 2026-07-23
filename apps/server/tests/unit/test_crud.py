from datetime import datetime, timedelta

import pytest
from database import crud, schemas


@pytest.mark.unit
class TestUserCRUD:
    def test_create_user(self, test_db):
        user_data = schemas.UserCreate(
            username="john",
            email="john@example.com",
            password="secret123"
        )
        user = crud.create_user(test_db, user_data)

        assert user.id is not None
        assert user.username == "john"
        assert user.email == "john@example.com"
        assert user.hashed_password != "secret123"

    def test_get_user_by_username(self, test_db, test_user):
        user = crud.get_user_by_username(test_db, test_user.username)
        assert user is not None
        assert user.id == test_user.id
        assert user.username == test_user.username

    def test_get_nonexistent_user(self, test_db):
        user = crud.get_user_by_username(test_db, "ghost")
        assert user is None

    def test_get_user_by_email(self, test_db, test_user):
        user = crud.get_user_by_email(test_db, test_user.email)
        assert user is not None
        assert user.id == test_user.id

@pytest.mark.unit
class TestGameSessionCRUD:
    def test_create_game_session(self, test_db, test_user):
        session_data = schemas.GameSessionCreate(name="Dragon Quest")
        session = crud.create_game_session(test_db, session_data, test_user.id, "DRG001")

        assert session.id is not None
        assert session.name == "Dragon Quest"
        assert session.session_code == "DRG001"
        assert session.owner_id == test_user.id

    def test_get_session_by_code(self, test_db, test_game_session):
        session = crud.get_game_session_by_code(test_db, "TEST01")
        assert session is not None
        assert session.id == test_game_session.id
        assert session.name == test_game_session.name

    def test_get_user_sessions(self, test_db, test_user, test_game_session):
        sessions = crud.get_user_game_sessions(test_db, test_user.id)
        assert len(sessions) > 0
        session, role = sessions[0]  # Unpack the tuple
        assert session.id == test_game_session.id


@pytest.mark.unit
class TestChatCRUD:
    def test_create_and_load_session_chat_messages(self, test_db, test_game_session, test_user):
        message = crud.create_chat_message(test_db, schemas.ChatMessageCreate(
            message_id="msg-1",
            client_operation_id="op-1",
            session_id=test_game_session.id,
            user_id=test_user.id,
            username=test_user.username,
            text="Hello table",
            message_json={"id": "msg-1", "user": test_user.username, "text": "Hello table", "timestamp": 123},
            attachments=[{"asset_id": "asset-1", "name": "map.png"}],
            client_timestamp=123,
        ))

        assert message.id is not None
        loaded = crud.get_session_chat_messages(test_db, test_game_session.id, visible_to_user_id=test_user.id)
        assert [m.message_id for m in loaded] == ["msg-1"]
        assert loaded[0].to_dict()["attachments"][0]["asset_id"] == "asset-1"

    def test_chat_history_hides_whispers_from_other_users(self, test_db, test_game_session, test_user, player_user):
        crud.create_chat_message(test_db, schemas.ChatMessageCreate(
            message_id="public-1",
            client_operation_id="public-op-1",
            session_id=test_game_session.id,
            user_id=test_user.id,
            username=test_user.username,
            text="Public",
            message_json={"id": "public-1", "user": test_user.username, "text": "Public", "timestamp": 1},
        ))
        crud.create_chat_message(test_db, schemas.ChatMessageCreate(
            message_id="whisper-1",
            client_operation_id="whisper-op-1",
            session_id=test_game_session.id,
            user_id=test_user.id,
            username=test_user.username,
            channel="whisper",
            recipient_user_id=player_user.id,
            text="Secret",
            message_json={"id": "whisper-1", "user": test_user.username, "text": "Secret", "timestamp": 2},
        ))

        visible_to_recipient = crud.get_session_chat_messages(
            test_db,
            test_game_session.id,
            visible_to_user_id=player_user.id,
        )
        visible_to_unknown = crud.get_session_chat_messages(test_db, test_game_session.id)
        visible_to_moderator = crud.get_session_chat_messages(
            test_db,
            test_game_session.id,
            viewer_is_moderator=True,
        )

        assert [m.message_id for m in visible_to_recipient] == ["public-1", "whisper-1"]
        assert [m.message_id for m in visible_to_unknown] == ["public-1"]
        assert [m.message_id for m in visible_to_moderator] == [
            "public-1",
            "whisper-1",
        ]

    def test_chat_retention_deletes_only_expired_rows(
        self, test_db, test_game_session, test_user
    ):
        expired = crud.create_chat_message(test_db, schemas.ChatMessageCreate(
            message_id="expired",
            client_operation_id="expired-op",
            session_id=test_game_session.id,
            user_id=test_user.id,
            username=test_user.username,
            text="Old",
            message_json={"id": "expired", "text": "Old"},
        ))
        current = crud.create_chat_message(test_db, schemas.ChatMessageCreate(
            message_id="current",
            client_operation_id="current-op",
            session_id=test_game_session.id,
            user_id=test_user.id,
            username=test_user.username,
            text="Current",
            message_json={"id": "current", "text": "Current"},
        ))
        expired.created_at = datetime.utcnow() - timedelta(days=366)
        current.created_at = datetime.utcnow()
        test_db.commit()

        deleted = crud.delete_expired_chat_messages(
            test_db,
            datetime.utcnow() - timedelta(days=365),
        )

        assert deleted == 1
        assert crud.get_session_chat_message(
            test_db,
            session_id=test_game_session.id,
            message_id="current",
        ) is not None

    def test_chat_history_defaults_to_last_30_and_caps_page_size(self, test_db, test_game_session, test_user):
        for idx in range(105):
            crud.create_chat_message(test_db, schemas.ChatMessageCreate(
                message_id=f"msg-{idx}",
                client_operation_id=f"op-{idx}",
                session_id=test_game_session.id,
                user_id=test_user.id,
                username=test_user.username,
                text=f"Message {idx}",
                message_json={
                    "id": f"msg-{idx}",
                    "user": test_user.username,
                    "text": f"Message {idx}",
                    "timestamp": idx,
                },
                client_timestamp=idx,
            ))

        recent = crud.get_session_chat_messages(
            test_db,
            test_game_session.id,
            visible_to_user_id=test_user.id,
        )
        capped_messages = crud.get_session_chat_messages(
            test_db,
            test_game_session.id,
            visible_to_user_id=test_user.id,
            limit=500,
        )
        last_five = crud.get_session_chat_messages(
            test_db,
            test_game_session.id,
            visible_to_user_id=test_user.id,
            limit=5,
        )

        assert len(recent) == 30
        assert recent[0].message_id == "msg-75"
        assert recent[-1].message_id == "msg-104"
        assert len(capped_messages) == 100
        assert capped_messages[0].message_id == "msg-5"
        assert [m.message_id for m in last_five] == ["msg-100", "msg-101", "msg-102", "msg-103", "msg-104"]

    def test_chat_idempotency_lookup_is_scoped_to_sender(
        self, test_db, test_game_session, test_user, player_user
    ):
        for message_id, sender in (("server-1", test_user), ("server-2", player_user)):
            crud.create_chat_message(test_db, schemas.ChatMessageCreate(
                message_id=message_id,
                client_operation_id="same-client-operation",
                session_id=test_game_session.id,
                user_id=sender.id,
                username=sender.username,
                text="Hello",
                message_json={"id": message_id, "text": "Hello", "user": sender.username},
            ))

        resolved = crud.get_chat_message_by_client_operation(
            test_db,
            session_id=test_game_session.id,
            user_id=player_user.id,
            client_operation_id="same-client-operation",
        )

        assert resolved.message_id == "server-2"
