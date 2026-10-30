"""Detached join metadata loaded entirely inside a blocking worker."""

import json

from database.database import SessionLocal
from database.models import GameSession
from utils.logger import setup_logger

logger = setup_logger(__name__)


def load_join_metadata(session_id: int, session_code: str, user_id: str, username: str) -> tuple[str, dict]:
    with SessionLocal() as db:
        session = db.get(GameSession, session_id)
        if session is None or not session.is_active or session.session_code != session_code:
            raise PermissionError("Active game session is unavailable")
        for ban in json.loads(session.ban_list or '[]'):
            if ban.get('player_id') == user_id or ban.get('username') == username:
                raise PermissionError(f"Banned: {ban.get('reason', 'no reason given')}")
        try:
            rules = json.loads(session.session_rules_json or '{}')
            if not isinstance(rules, dict):
                raise TypeError("Session rules must be an object")
            rules.setdefault('session_id', session_code)
        except (json.JSONDecodeError, TypeError):
            logger.warning("Stored session rules are invalid", extra={
                "event_name": "game_session.rules.invalid", "outcome": "rejected"})
            rules = {}
        return session.game_mode or 'free_roam', rules
