"""Persistence and authorization for resumable character-wizard drafts."""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any

from database.database import SessionLocal
from database.models import CharacterDraft, GamePlayer, GameSession, SessionCharacter
from service.character_draft_schema import (
    CURRENT_DRAFT_SCHEMA_VERSION,
    validate_character_draft,
)
from service.character_schema import validate_character_document
from utils.logger import setup_logger

logger = setup_logger(__name__)


class CharacterDraftManager:
    @staticmethod
    def _is_member(db: Any, session_id: int, user_id: int) -> bool:
        session = db.query(GameSession).filter(GameSession.id == session_id).first()
        if not session:
            return False
        if int(session.owner_id) == int(user_id):
            return True
        return db.query(GamePlayer.id).filter(
            GamePlayer.session_id == session_id,
            GamePlayer.user_id == user_id,
        ).first() is not None

    @classmethod
    def _can_view(
        cls, db: Any, draft: CharacterDraft, user_id: int, bypass_owner_check: bool
    ) -> bool:
        if int(draft.owner_user_id) == int(user_id):
            return True
        return bool(
            bypass_owner_check
            and cls._is_member(db, int(draft.session_id), user_id)
        )

    @staticmethod
    def _to_dict(draft: CharacterDraft) -> dict[str, Any]:
        return {
            "draft_id": draft.draft_id,
            "session_id": draft.session_id,
            "owner_user_id": draft.owner_user_id,
            "draft_data": json.loads(draft.draft_data),
            "schema_version": draft.schema_version,
            "current_step": draft.current_step,
            "version": draft.version,
            "status": draft.status,
            "converted_character_id": draft.converted_character_id,
            "created_at": draft.created_at.isoformat() if draft.created_at else None,
            "updated_at": draft.updated_at.isoformat() if draft.updated_at else None,
            "last_modified_by": draft.last_modified_by,
        }

    def can_view_draft(
        self,
        session_id: int,
        draft_id: str,
        user_id: int,
        bypass_owner_check: bool = False,
    ) -> bool:
        with SessionLocal() as db:
            draft = db.query(CharacterDraft).filter(
                CharacterDraft.session_id == session_id,
                CharacterDraft.draft_id == draft_id,
            ).first()
            return bool(
                draft and self._can_view(db, draft, user_id, bypass_owner_check)
            )

    def create_draft(
        self, session_id: int, user_id: int, draft_data: dict, current_step: int = 0
    ) -> dict[str, Any]:
        try:
            if not 0 <= int(current_step) <= 7:
                return {"success": False, "error": "Draft step is out of range"}
            validated = validate_character_draft(draft_data)
            with SessionLocal() as db:
                if not self._is_member(db, session_id, user_id):
                    return {"success": False, "error": "Session not found or access denied"}
                draft = CharacterDraft(
                    draft_id=str(uuid.uuid4()),
                    session_id=session_id,
                    owner_user_id=user_id,
                    draft_data=json.dumps(validated, separators=(",", ":")),
                    schema_version=CURRENT_DRAFT_SCHEMA_VERSION,
                    current_step=int(current_step),
                    version=1,
                    status="active",
                    last_modified_by=user_id,
                )
                db.add(draft)
                db.commit()
                db.refresh(draft)
                return {"success": True, "draft": self._to_dict(draft)}
        except ValueError as exc:
            return {"success": False, "error": str(exc)}
        except Exception:
            logger.exception("Character draft creation failed")
            return {"success": False, "error": "Character draft could not be created"}

    def list_drafts(
        self, session_id: int, user_id: int, bypass_owner_check: bool = False
    ) -> dict[str, Any]:
        try:
            with SessionLocal() as db:
                if not self._is_member(db, session_id, user_id):
                    return {"success": False, "error": "Session not found or access denied"}
                query = db.query(CharacterDraft).filter(
                    CharacterDraft.session_id == session_id,
                    CharacterDraft.status == "active",
                )
                if not bypass_owner_check:
                    query = query.filter(CharacterDraft.owner_user_id == user_id)
                drafts = query.order_by(CharacterDraft.updated_at.desc()).all()
                return {
                    "success": True,
                    "drafts": [self._to_dict(draft) for draft in drafts],
                }
        except Exception:
            logger.exception("Character draft listing failed")
            return {"success": False, "error": "Character drafts could not be loaded"}

    def load_draft(
        self,
        session_id: int,
        draft_id: str,
        user_id: int,
        bypass_owner_check: bool = False,
    ) -> dict[str, Any]:
        try:
            with SessionLocal() as db:
                draft = db.query(CharacterDraft).filter(
                    CharacterDraft.session_id == session_id,
                    CharacterDraft.draft_id == draft_id,
                ).first()
                if not draft or not self._can_view(
                    db, draft, user_id, bypass_owner_check
                ):
                    return {"success": False, "error": "Draft not found or access denied"}
                return {"success": True, "draft": self._to_dict(draft)}
        except Exception:
            logger.exception("Character draft load failed")
            return {"success": False, "error": "Character draft could not be loaded"}

    def update_draft(
        self,
        session_id: int,
        draft_id: str,
        user_id: int,
        draft_data: dict,
        current_step: int,
        expected_version: int,
    ) -> dict[str, Any]:
        try:
            if not 0 <= int(current_step) <= 7:
                return {"success": False, "error": "Draft step is out of range"}
            validated = validate_character_draft(draft_data)
            serialized = json.dumps(validated, separators=(",", ":"))
            with SessionLocal() as db:
                now = datetime.utcnow()
                affected = db.query(CharacterDraft).filter(
                    CharacterDraft.session_id == session_id,
                    CharacterDraft.draft_id == draft_id,
                    CharacterDraft.owner_user_id == user_id,
                    CharacterDraft.status == "active",
                    CharacterDraft.version == expected_version,
                ).update({
                    CharacterDraft.draft_data: serialized,
                    CharacterDraft.current_step: int(current_step),
                    CharacterDraft.version: int(expected_version) + 1,
                    CharacterDraft.updated_at: now,
                    CharacterDraft.last_modified_by: user_id,
                }, synchronize_session=False)
                if affected != 1:
                    db.rollback()
                    current = db.query(CharacterDraft).filter(
                        CharacterDraft.session_id == session_id,
                        CharacterDraft.draft_id == draft_id,
                    ).first()
                    if not current or int(current.owner_user_id) != int(user_id):
                        return {"success": False, "error": "Draft not found or access denied"}
                    return {
                        "success": False,
                        "error": "Version conflict",
                        "current_draft": self._to_dict(current),
                    }
                db.commit()
                saved = db.query(CharacterDraft).filter(
                    CharacterDraft.draft_id == draft_id
                ).one()
                return {"success": True, "draft": self._to_dict(saved)}
        except ValueError as exc:
            return {"success": False, "error": str(exc)}
        except Exception:
            logger.exception("Character draft update failed")
            return {"success": False, "error": "Character draft could not be saved"}

    def finalize_draft(
        self,
        session_id: int,
        draft_id: str,
        user_id: int,
        expected_version: int,
        character_data: dict,
    ) -> dict[str, Any]:
        """Atomically convert one authorized active draft into a playable character."""
        try:
            if not isinstance(character_data, dict):
                return {"success": False, "error": "Character data must be an object"}
            name = character_data.get("name")
            document = validate_character_document({
                "schemaVersion": 1,
                "character_id": draft_id,
                "name": name,
                "controlledBy": [],
                "data": character_data,
            })
            with SessionLocal() as db:
                draft = db.query(CharacterDraft).filter(
                    CharacterDraft.session_id == session_id,
                    CharacterDraft.draft_id == draft_id,
                    CharacterDraft.owner_user_id == user_id,
                    CharacterDraft.status == "active",
                ).first()
                if not draft:
                    return {"success": False, "error": "Draft not found or access denied"}
                if int(draft.version) != int(expected_version):
                    return {
                        "success": False,
                        "error": "Version conflict",
                        "current_draft": self._to_dict(draft),
                    }
                if db.query(SessionCharacter.id).filter(
                    SessionCharacter.character_id == draft_id
                ).first():
                    return {"success": False, "error": "Draft was already converted"}

                character = SessionCharacter(
                    character_id=draft_id,
                    session_id=session_id,
                    character_name=str(name),
                    character_data=json.dumps(document, separators=(",", ":")),
                    owner_user_id=user_id,
                    version=1,
                    last_modified_by=user_id,
                )
                db.add(character)
                db.flush()

                affected = db.query(CharacterDraft).filter(
                    CharacterDraft.id == draft.id,
                    CharacterDraft.version == expected_version,
                    CharacterDraft.status == "active",
                ).update({
                    CharacterDraft.status: "converted",
                    CharacterDraft.converted_character_id: draft_id,
                    CharacterDraft.version: int(expected_version) + 1,
                    CharacterDraft.updated_at: datetime.utcnow(),
                    CharacterDraft.last_modified_by: user_id,
                }, synchronize_session=False)
                if affected != 1:
                    db.rollback()
                    return {"success": False, "error": "Version conflict"}
                db.commit()
                return {
                    "success": True,
                    "draft_id": draft_id,
                    "character_id": draft_id,
                    "version": 1,
                    "character_data": document,
                }
        except ValueError as exc:
            return {"success": False, "error": str(exc)}
        except Exception:
            logger.exception("Character draft finalization failed")
            return {"success": False, "error": "Character draft could not be finalized"}

    def abandon_draft(
        self, session_id: int, draft_id: str, user_id: int, expected_version: int
    ) -> dict[str, Any]:
        try:
            with SessionLocal() as db:
                affected = db.query(CharacterDraft).filter(
                    CharacterDraft.session_id == session_id,
                    CharacterDraft.draft_id == draft_id,
                    CharacterDraft.owner_user_id == user_id,
                    CharacterDraft.status == "active",
                    CharacterDraft.version == expected_version,
                ).update({
                    CharacterDraft.status: "abandoned",
                    CharacterDraft.version: int(expected_version) + 1,
                    CharacterDraft.updated_at: datetime.utcnow(),
                    CharacterDraft.last_modified_by: user_id,
                }, synchronize_session=False)
                if affected != 1:
                    db.rollback()
                    return {"success": False, "error": "Draft not found or version conflict"}
                db.commit()
                return {"success": True, "draft_id": draft_id, "status": "abandoned"}
        except Exception:
            logger.exception("Character draft abandonment failed")
            return {"success": False, "error": "Character draft could not be abandoned"}


_manager: CharacterDraftManager | None = None


def get_character_draft_manager() -> CharacterDraftManager:
    global _manager
    if _manager is None:
        _manager = CharacterDraftManager()
    return _manager
