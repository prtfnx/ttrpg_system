import base64
import binascii
import json
import math
import re
from typing import Any, TypeGuard

from core_table.protocol import Message, MessageType
from database import crud
from database.database import SessionLocal
from utils.logger import setup_logger
from utils.roles import can_interact, is_dm

from ._protocol_base import _ProtocolBase

logger = setup_logger(__name__)
_IDENTIFIER = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
_THUMBNAIL = re.compile(
    r"^data:image/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$"
)
_MAX_TEMPLATES_PER_SESSION = 100
_MAX_STROKES_PER_TEMPLATE = 500
_MAX_POINTS_PER_STROKE = 20_000
_MAX_TEMPLATE_BYTES = 1024 * 1024
_MAX_THUMBNAIL_BYTES = 128 * 1024


def _finite_number(value: Any) -> TypeGuard[int | float]:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
    )


def _validate_stroke(stroke: Any) -> bool:
    if not isinstance(stroke, dict):
        return False
    stroke_id = stroke.get("id")
    points = stroke.get("points")
    color = stroke.get("color")
    width = stroke.get("width")
    if (
        not isinstance(stroke_id, str)
        or not 1 <= len(stroke_id) <= 128
        or not isinstance(points, list)
        or len(points) > _MAX_POINTS_PER_STROKE
        or not isinstance(color, list)
        or len(color) != 4
        or not all(_finite_number(channel) for channel in color)
        or not _finite_number(width)
    ):
        return False
    if not 0 < width <= 1000:
        return False
    return all(
        isinstance(point, dict)
        and _finite_number(point.get("x"))
        and _finite_number(point.get("y"))
        and (
            point.get("pressure") is None
            or _finite_number(point.get("pressure"))
        )
        for point in points
    )


def _validate_thumbnail(value: Any) -> str | None:
    if value in (None, ""):
        return None
    if not isinstance(value, str) or len(value) > (_MAX_THUMBNAIL_BYTES * 2):
        raise ValueError("thumbnail must be a PNG, JPEG, or WebP data URL")
    match = _THUMBNAIL.fullmatch(value)
    if not match:
        raise ValueError("thumbnail must be a PNG, JPEG, or WebP data URL")
    try:
        decoded = base64.b64decode(match.group(1), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("thumbnail contains invalid base64 data") from exc
    if len(decoded) > _MAX_THUMBNAIL_BYTES:
        raise ValueError("thumbnail exceeds 128 KiB")
    return value


def _validate_template(
    data: dict[str, Any],
) -> tuple[str, str | None, str, str | None]:
    name = data.get("name")
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 100:
        raise ValueError("name must contain between 1 and 100 characters")
    description = data.get("description")
    if description is not None and (
        not isinstance(description, str) or len(description.strip()) > 500
    ):
        raise ValueError("description cannot exceed 500 characters")
    strokes = data.get("strokes")
    if (
        not isinstance(strokes, list)
        or len(strokes) > _MAX_STROKES_PER_TEMPLATE
        or not all(_validate_stroke(stroke) for stroke in strokes)
    ):
        raise ValueError("strokes must contain up to 500 valid paint strokes")
    strokes_json = json.dumps(
        strokes,
        separators=(",", ":"),
        sort_keys=True,
        allow_nan=False,
    )
    if len(strokes_json.encode("utf-8")) > _MAX_TEMPLATE_BYTES:
        raise ValueError("template stroke data exceeds 1 MiB")
    return (
        name.strip(),
        description.strip() if description else None,
        strokes_json,
        _validate_thumbnail(data.get("thumbnail")),
    )


class _PaintTemplatesMixin(_ProtocolBase):
    """Persist reusable paint templates for every browser in a game session."""

    def _paint_template_context(
        self, msg: Message, client_id: str, *, write: bool
    ) -> tuple[int, int] | Message:
        if write and not can_interact(self._get_client_role(client_id)):
            return Message(
                MessageType.ERROR,
                {"error": "Not permitted to edit paint templates"},
            )
        session_id = self._get_session_id(msg)
        user_id = self._get_user_id(msg, client_id)
        if session_id is None or user_id is None:
            return Message(
                MessageType.ERROR,
                {"error": "Authenticated session context is required"},
            )
        return session_id, user_id

    async def handle_paint_template_upsert(
        self, msg: Message, client_id: str
    ) -> Message:
        context = self._paint_template_context(msg, client_id, write=True)
        if isinstance(context, Message):
            return context
        session_id, user_id = context
        data = msg.data or {}
        template_id = data.get("id")
        if not isinstance(template_id, str) or not _IDENTIFIER.fullmatch(template_id):
            return Message(MessageType.ERROR, {"error": "Invalid paint template id"})
        try:
            name, description, strokes_json, thumbnail = _validate_template(data)
        except (TypeError, ValueError) as exc:
            return Message(MessageType.ERROR, {"error": str(exc)})

        db = SessionLocal()
        try:
            existing = crud.get_paint_template(db, session_id, template_id)
            if (
                existing is None
                and len(crud.get_paint_templates(db, session_id))
                >= _MAX_TEMPLATES_PER_SESSION
            ):
                return Message(
                    MessageType.ERROR,
                    {"error": "Session paint template limit reached"},
                )
            template = crud.upsert_paint_template(
                db,
                session_id=session_id,
                template_id=template_id,
                created_by=user_id,
                name=name,
                description=description,
                strokes_json=strokes_json,
                thumbnail=thumbnail,
            )
            payload = {"operation": "upsert", "template": template.to_dict()}
        except PermissionError as exc:
            return Message(MessageType.ERROR, {"error": str(exc)})
        except Exception:
            logger.exception("Paint template persistence failed")
            return Message(
                MessageType.ERROR,
                {"error": "Paint template could not be persisted"},
            )
        finally:
            db.close()

        outbound = Message(MessageType.PAINT_TEMPLATE_UPSERT, payload)
        await self.broadcast_to_session(outbound, client_id)
        return outbound

    async def handle_paint_template_delete(
        self, msg: Message, client_id: str
    ) -> Message:
        context = self._paint_template_context(msg, client_id, write=True)
        if isinstance(context, Message):
            return context
        session_id, user_id = context
        template_id = (msg.data or {}).get("id")
        if not isinstance(template_id, str) or not _IDENTIFIER.fullmatch(template_id):
            return Message(MessageType.ERROR, {"error": "Invalid paint template id"})

        db = SessionLocal()
        try:
            deleted = crud.delete_paint_template(
                db,
                session_id,
                template_id,
                created_by=None if is_dm(self._get_client_role(client_id)) else user_id,
            )
        except Exception:
            logger.exception("Paint template deletion failed")
            return Message(
                MessageType.ERROR,
                {"error": "Paint template could not be deleted"},
            )
        finally:
            db.close()
        if not deleted:
            return Message(
                MessageType.ERROR,
                {"error": "Paint template not found or not owned by you"},
            )

        outbound = Message(
            MessageType.PAINT_TEMPLATE_DELETE,
            {"operation": "delete", "id": template_id},
        )
        await self.broadcast_to_session(outbound, client_id)
        return outbound

    async def handle_paint_template_sync(
        self, msg: Message, client_id: str
    ) -> Message:
        context = self._paint_template_context(msg, client_id, write=False)
        if isinstance(context, Message):
            return context
        session_id, _ = context
        db = SessionLocal()
        try:
            templates = [
                template.to_dict()
                for template in crud.get_paint_templates(db, session_id)
            ]
        except Exception:
            logger.exception("Paint template sync failed")
            return Message(
                MessageType.ERROR,
                {"error": "Paint templates could not be loaded"},
            )
        finally:
            db.close()
        return Message(MessageType.PAINT_TEMPLATE_SYNC, {"templates": templates})
