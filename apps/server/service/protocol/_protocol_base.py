from typing import Any, ClassVar, Dict, Optional

from core_table.protocol import Message


class _ProtocolBase:
    """Shared type interface for all ServerProtocol mixin classes.

    Declares the attributes and helper methods that mixins rely on.
    Concrete implementations are provided by _HelpersMixin, _PlayersMixin,
    and ServerProtocol.__init__ via Python's MRO at runtime.
    """

    # Set by ServerProtocol.__init__
    table_manager: Any
    session_manager: Any
    actions: Any
    clients: Dict[str, Any]
    _rules_cache: Dict[str, Any]
    _pending_moves: ClassVar[dict]

    # ── transport ────────────────────────────────────────────────────────────
    async def send_to_client(self, message: Message, client_id: str) -> None:
        raise NotImplementedError

    async def broadcast_to_session(self, message: Message, client_id: str) -> None:
        raise NotImplementedError

    async def broadcast_filtered(self, message: Message, layer: str, client_id: str) -> None:
        raise NotImplementedError

    async def _broadcast_error(self, client_id: str, error_message: str) -> None:
        raise NotImplementedError

    # ── session resolution ────────────────────────────────────────────────────
    def _get_session_code(self, msg: Optional[Message] = None) -> str:
        raise NotImplementedError

    def _get_session_id(self, msg: Message) -> Optional[int]:
        raise NotImplementedError

    # ── client metadata ───────────────────────────────────────────────────────
    def _get_user_id(self, msg: Message, client_id: Optional[str] = None) -> Optional[int]:
        raise NotImplementedError

    def _get_client_info(self, client_id: str) -> dict:
        raise NotImplementedError

    def _get_client_role(self, client_id: str) -> str:
        raise NotImplementedError

    def _has_kick_permission(self, client_info: dict) -> bool:
        raise NotImplementedError

    def _has_ban_permission(self, client_info: dict) -> bool:
        raise NotImplementedError

    # ── object lookup ─────────────────────────────────────────────────────────
    async def _can_control_sprite(self, sprite_id: str, user_id: Optional[int]) -> bool:
        raise NotImplementedError

    # ── cross-mixin: assets ───────────────────────────────────────────────────
    async def ensure_assets_in_r2(self, table_data: dict, session_code: str, user_id: int) -> dict:
        raise NotImplementedError

    async def add_asset_hashes_to_table(self, table_data: dict, session_code: str, user_id: int) -> dict:
        raise NotImplementedError

    # ── cross-mixin: session ──────────────────────────────────────────────────
    async def _get_player_active_table(self, user_id: int, session_code: str) -> Optional[str]:
        raise NotImplementedError

    async def _set_player_active_table(self, user_id: int, session_code: str, table_id: Optional[str]) -> bool:
        raise NotImplementedError
