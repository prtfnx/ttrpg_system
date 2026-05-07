"""Unit tests for _AuthMixin protocol handlers."""

from core_table.protocol import Message, MessageType
from service.protocol.auth import _AuthMixin


class _ProtoStub(_AuthMixin):
    def _get_client_info(self, client_id):
        if client_id == "authed":
            return {"user_id": 42, "username": "gandalf", "role": "player"}
        return {"user_id": None, "role": "spectator"}

    def _get_client_role(self, client_id):
        return "player"

    def _get_session_code(self, msg=None):
        return "TST"

    def _get_session_id(self, msg):
        return 1

    def _get_user_id(self, msg, client_id=None):
        return None

    async def broadcast_to_session(self, message, client_id):
        pass

    async def broadcast_filtered(self, message, layer, client_id):
        pass

    async def send_to_client(self, message, client_id):
        pass

    async def _broadcast_error(self, client_id, error_message):
        pass


class TestAuthHandlers:
    async def test_register_redirects_to_http(self):
        proto = _ProtoStub()
        resp = await proto.handle_auth_register(Message(MessageType.AUTH_REGISTER, {}), "c1")
        assert resp.type == MessageType.AUTH_STATUS
        assert resp.data["authenticated"] is False
        assert "register" in resp.data["message"].lower()

    async def test_login_redirects_to_http(self):
        proto = _ProtoStub()
        resp = await proto.handle_auth_login(Message(MessageType.AUTH_LOGIN, {}), "c1")
        assert resp.type == MessageType.AUTH_STATUS
        assert resp.data["authenticated"] is False
        assert "login" in resp.data["message"].lower()

    async def test_logout_returns_unauthenticated(self):
        proto = _ProtoStub()
        resp = await proto.handle_auth_logout(Message(MessageType.AUTH_LOGOUT, {}), "c1")
        assert resp.type == MessageType.AUTH_STATUS
        assert resp.data["authenticated"] is False

    async def test_token_redirects_to_http(self):
        proto = _ProtoStub()
        resp = await proto.handle_auth_token(Message(MessageType.AUTH_TOKEN, {}), "c1")
        assert resp.type == MessageType.AUTH_STATUS
        assert resp.data["authenticated"] is False

    async def test_status_authenticated_client(self):
        proto = _ProtoStub()
        resp = await proto.handle_auth_status(Message(MessageType.AUTH_STATUS, {}), "authed")
        assert resp.type == MessageType.AUTH_STATUS
        assert resp.data["authenticated"] is True
        assert resp.data["user_id"] == 42
        assert resp.data["username"] == "gandalf"

    async def test_status_unauthenticated_client(self):
        proto = _ProtoStub()
        resp = await proto.handle_auth_status(Message(MessageType.AUTH_STATUS, {}), "anon")
        assert resp.type == MessageType.AUTH_STATUS
        assert resp.data["authenticated"] is False
