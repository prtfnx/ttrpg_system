"""Authenticated WebSocket endpoint for game sessions."""

from __future__ import annotations

import hashlib
import json
import time
import uuid
from collections import deque

import jwt
from config import Settings
from database import crud, models
from database.database import SessionLocal
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, status
from routers.users import ALGORITHM, SECRET_KEY
from service.game_session import ConnectionManager, get_connection_manager
from sqlalchemy.orm import Session
from utils.logger import log_context, setup_logger


logger = setup_logger(__name__)
router = APIRouter()
settings = Settings()


def _session_reference(session_code: str) -> str:
    """Pseudonymous session reference safe for diagnostic logs."""
    return hashlib.sha256(session_code.encode("utf-8")).hexdigest()[:12]


def _origin_is_allowed(origin: str | None) -> bool:
    """Apply the HTTP origin allowlist to browser WebSocket handshakes."""
    allowed = settings.cors_origin_list
    if "*" in allowed and not settings.is_production:
        return True
    return bool(origin and origin in allowed)


def get_user_from_token(token: str, db: Session):
    """Resolve a user without ever recording token material."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not isinstance(username, str) or not username:
            logger.warning(
                "WebSocket JWT has no subject",
                extra={"event_name": "websocket.authentication.rejected", "reason": "missing_subject"},
            )
            return None
        return crud.get_user_by_username(db, username=username)
    except jwt.ExpiredSignatureError:
        logger.info(
            "WebSocket JWT expired",
            extra={"event_name": "websocket.authentication.rejected", "reason": "expired"},
        )
    except jwt.InvalidTokenError:
        logger.warning(
            "WebSocket JWT invalid",
            extra={"event_name": "websocket.authentication.rejected", "reason": "invalid"},
        )
    return None


@router.websocket("/ws/game/{session_code}")
async def websocket_game_endpoint(
    websocket: WebSocket,
    session_code: str,
    connection_manager: ConnectionManager = Depends(get_connection_manager),
):
    """Authenticate from the HTTP-only cookie and join a durable game session."""
    connection_id = uuid.uuid4().hex
    connected = False
    db = SessionLocal()
    with log_context(
        connection_id=connection_id,
        session_ref=_session_reference(session_code),
    ):
        try:
            if not _origin_is_allowed(websocket.headers.get("origin")):
                logger.warning(
                    "WebSocket Origin rejected",
                    extra={
                        "event_name": "websocket.connection.rejected",
                        "reason": "origin",
                        "outcome": "rejected",
                    },
                )
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                return

            token = websocket.cookies.get("token")
            user = get_user_from_token(token, db) if token else None
            if not user:
                logger.warning(
                    "WebSocket authentication failed",
                    extra={
                        "event_name": "websocket.connection.rejected",
                        "reason": "authentication",
                        "outcome": "rejected",
                    },
                )
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                return

            db_game_session = crud.get_game_session_by_code(db, session_code)
            if not db_game_session:
                logger.info(
                    "WebSocket session does not exist",
                    extra={
                        "event_name": "websocket.connection.rejected",
                        "reason": "session_not_found",
                        "outcome": "rejected",
                    },
                )
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                return

            db_player = db.query(models.GamePlayer).filter(
                models.GamePlayer.session_id == db_game_session.id,
                models.GamePlayer.user_id == user.id,
            ).first()
            if not db_player:
                logger.warning(
                    "WebSocket membership check failed",
                    extra={
                        "event_name": "websocket.connection.rejected",
                        "reason": "not_member",
                        "user_id": user.id,
                        "outcome": "rejected",
                    },
                )
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                return

            client_id = await connection_manager.connect(
                websocket,
                session_code,
                user.id,
                user.username,
                db_player.role or "player",
                connection_id=connection_id,
            )
            connected = True
            logger.info(
                "WebSocket connected",
                extra={
                    "event_name": "websocket.connection.opened",
                    "client_id": client_id,
                    "user_id": user.id,
                    "role": db_player.role or "player",
                    "outcome": "success",
                },
            )

            message_times: deque[float] = deque()
            while True:
                raw_message = await websocket.receive_text()
                message_started = time.perf_counter()
                payload_bytes = len(raw_message.encode("utf-8"))
                if payload_bytes > settings.WS_MAX_MESSAGE_BYTES:
                    logger.info(
                        "Oversized WebSocket message rejected",
                        extra={
                            "event_name": "websocket.message.rejected",
                            "reason": "message_too_large",
                            "payload_bytes": payload_bytes,
                            "outcome": "rejected",
                        },
                    )
                    await websocket.close(code=status.WS_1009_MESSAGE_TOO_BIG)
                    return

                now = time.monotonic()
                while message_times and now - message_times[0] >= 60:
                    message_times.popleft()
                if len(message_times) >= settings.WS_MESSAGES_PER_MINUTE:
                    logger.info(
                        "WebSocket message rate exceeded",
                        extra={
                            "event_name": "websocket.message.rejected",
                            "reason": "rate_limit",
                            "outcome": "rejected",
                        },
                    )
                    await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                    return
                message_times.append(now)
                try:
                    message_data = json.loads(raw_message)
                    if not isinstance(message_data, dict):
                        raise ValueError("WebSocket message must be an object")
                    message_id = message_data.get("message_id")
                    if not isinstance(message_id, str) or not message_id:
                        message_id = uuid.uuid4().hex
                        message_data["message_id"] = message_id
                    with log_context(message_id=message_id):
                        await connection_manager.handle_message(websocket, message_data)
                        logger.debug(
                            "WebSocket message processed",
                            extra={
                                "event_name": "websocket.message.processed",
                                "message_type": str(message_data.get("type", "unknown"))[:80],
                                "duration_ms": round(
                                    (time.perf_counter() - message_started) * 1000, 3
                                ),
                                "outcome": "success",
                            },
                        )
                except (json.JSONDecodeError, ValueError):
                    logger.info(
                        "Invalid WebSocket message rejected",
                        extra={
                            "event_name": "websocket.message.rejected",
                            "reason": "invalid_json",
                            "payload_bytes": payload_bytes,
                            "outcome": "rejected",
                        },
                    )
                    await connection_manager.send_personal_message(
                        {"type": "error", "data": {"message": "Invalid message format"}},
                        websocket,
                    )
        except WebSocketDisconnect as exc:
            logger.info(
                "WebSocket disconnected",
                extra={
                    "event_name": "websocket.connection.closed",
                    "close_code": exc.code,
                    "outcome": "closed",
                },
            )
        except Exception:
            logger.exception(
                "WebSocket connection failed",
                extra={"event_name": "websocket.connection.failed", "outcome": "error"},
            )
            if not connected:
                try:
                    await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
                except RuntimeError:
                    pass
        finally:
            if connected:
                await connection_manager.disconnect(websocket)
            db.close()
