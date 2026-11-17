"""Worker-owned membership removal, permanent ban and audit acceptance."""
import json
from dataclasses import dataclass

from database.database import SessionLocal
from database.models import GamePlayer, GameSession, User
from service.session_operation_receipts import OperationOutcomeUnknown
from sqlalchemy import text
from utils.audit import audit_event
from utils.roles import can_modify_role
from utils.time import utc_now


class ModerationRejected(ValueError):
    """No moderation change was accepted."""


@dataclass(frozen=True)
class ModerationResult:
    user_id: int
    username: str
    banned: bool
    resync_required: bool = False


class ModerationOutcomeUnknown(OperationOutcomeUnknown):
    def __init__(self, result: ModerationResult):
        super().__init__('Moderation acceptance is uncertain; refresh membership before another action')
        self.result = result


class SessionModerationService:
    def __init__(self, session_factory=None):
        self.session_factory = session_factory or SessionLocal

    def execute(self, session_code: str, actor_id: int, target_id: str | int | None,
                target_username: str | None, reason: str, *, ban=False, duration='permanent') -> ModerationResult:
        if isinstance(actor_id, bool) or not isinstance(actor_id, int) or actor_id <= 0:
            raise ModerationRejected('Authenticated actor is required')
        if not isinstance(reason, str) or len(reason) > 2000:
            raise ModerationRejected('Reason must be bounded text')
        if ban and duration != 'permanent':
            raise ModerationRejected('Only permanent bans are supported')
        if target_username is not None and (not isinstance(target_username, str) or not 1 <= len(target_username) <= 100):
            raise ModerationRejected('Invalid target username')
        target_user_id = None
        if target_id is not None:
            if isinstance(target_id, bool) or not isinstance(target_id, (str, int)):
                raise ModerationRejected('Invalid target identity')
            value = str(target_id)
            if not value.isascii() or not value.isdecimal() or len(value) > 19:
                raise ModerationRejected('Invalid target identity')
            target_user_id = int(value)
            if not 0 < target_user_id <= 2**63 - 1:
                raise ModerationRejected('Invalid target identity')
        if target_user_id is None and target_username is None:
            raise ModerationRejected('Target identity is required')

        with self.session_factory() as db:
            if db.get_bind().dialect.name == 'postgresql':
                db.execute(text("SET LOCAL lock_timeout = '5s'"))
            game = db.query(GameSession).filter_by(session_code=session_code, is_active=True).with_for_update().one_or_none()
            if game is None:
                raise ModerationRejected('Active session not found')
            actor = db.get(User, actor_id)
            if actor is None or actor.disabled:
                raise ModerationRejected('Current actor authority is required')
            actor_membership = db.query(GamePlayer).filter_by(session_id=game.id, user_id=actor_id).with_for_update().one_or_none()
            actor_role = 'owner' if game.owner_id == actor_id else actor_membership.role if actor_membership else None
            target_query = db.query(GamePlayer).join(User).filter(GamePlayer.session_id == game.id)
            target_query = (target_query.filter(GamePlayer.user_id == target_user_id) if target_user_id is not None
                            else target_query.filter(User.username == target_username))
            target = target_query.with_for_update(of=GamePlayer).one_or_none()
            if target is None or target.user_id == actor_id or target.user_id == game.owner_id:
                raise ModerationRejected('A different non-owner member is required')
            account = db.get(User, target.user_id)
            if account is None or target_username is not None and account.username != target_username:
                raise ModerationRejected('Target identity does not match')
            if not can_modify_role(actor_role or '', target.role or 'player'):
                raise ModerationRejected('Role hierarchy denies moderation')
            result = ModerationResult(target.user_id, account.username, bool(ban))
            if ban:
                bans = json.loads(game.ban_list or '[]')
                if not isinstance(bans, list) or any(not isinstance(entry, dict) for entry in bans):
                    raise ModerationRejected('Stored ban list requires repair')
                entry = {'player_id': str(result.user_id), 'username': result.username, 'reason': reason,
                         'duration': 'permanent', 'banned_by': actor.username, 'timestamp': utc_now().isoformat()}
                # Keep other bans intact and normalize an existing target entry.
                bans = [item for item in bans if str(item.get('player_id')) != str(result.user_id)]
                game.ban_list = json.dumps([*bans, entry])
            db.delete(target)
            db.add(audit_event('PLAYER_BANNED' if ban else 'PLAYER_KICKED', session_code=session_code,
                user_id=actor_id, target_type='user', target_id=result.user_id,
                details={'channel': 'websocket', 'reason': reason, 'target_user': result.user_id}))
            db.flush()
            try:
                db.commit()
            except Exception as exc:
                raise ModerationOutcomeUnknown(result) from exc
            return result
