"""Authenticated WebSocket endpoint for game sessions."""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
import uuid
from dataclasses import dataclass
from datetime import UTC

from config import Settings
from database import crud, models
from database.database import SessionLocal
from database.writer import WriterOwnershipLost
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, status
from service.authentication import AccessTokenRejected, resolve_active_user_from_token
from service.demo_guests import DEMO_COOKIE, demo_message_allowed, resolve_demo_guest
from service.game_session import ConnectionManager, get_connection_manager
from sqlalchemy.orm import Session
from utils.blocking import run_blocking
from utils.logger import log_context, setup_logger
from utils.observability import (
    WS_ACTIVE,
    WS_DURATION,
    record_ws_connection,
    record_ws_message,
)
from utils.websocket_rate_limit import WebSocketMessageLimiter, WebSocketRateExceeded

logger = setup_logger(__name__)
router = APIRouter()
settings = Settings()


@dataclass(frozen=True)
class WebSocketSessionContext:
    user_id: int
    username: str
    role: str
    guest_expires_at: float | None = None


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
        return resolve_active_user_from_token(token, db)
    except AccessTokenRejected as error:
        log = logger.info if error.reason == "expired" else logger.warning
        log(
            "WebSocket access token rejected",
            extra={
                "event_name": "websocket.authentication.rejected",
                "reason": error.reason,
            },
        )
        return None


def _load_websocket_session_context(
    token: str,
    session_code: str,
    demo: bool = False,
) -> tuple[WebSocketSessionContext | None, str | None]:
    """Resolve handshake authority with a worker-owned ORM session."""
    db = SessionLocal()
    try:
        if demo:
            try:
                user = resolve_demo_guest(token, db, session_code)
            except AccessTokenRejected:
                return None, "authentication"
        else:
            user = get_user_from_token(token, db)
        if not user:
            return None, "authentication"

        db_game_session = crud.get_game_session_by_code(db, session_code)
        if not db_game_session:
            return None, "session_not_found"

        db_player = db.query(models.GamePlayer).filter(
            models.GamePlayer.session_id == db_game_session.id,
            models.GamePlayer.user_id == user.id,
        ).first()
        if not db_player:
            return None, "not_member"

        return WebSocketSessionContext(
            user_id=user.id,
            username=user.username,
            role=db_player.role or "player",
            guest_expires_at=(user.guest_expires_at.replace(tzinfo=UTC).timestamp()
                              if demo and user.guest_expires_at else None),
        ), None
    finally:
        db.close()


@router.websocket("/ws/game/{session_code}")
async def websocket_game_endpoint(
    websocket: WebSocket,
    session_code: str,
    connection_manager: ConnectionManager = Depends(get_connection_manager),
):
    """Authenticate from the HTTP-only cookie and join a durable game session."""
    connection_id = uuid.uuid4().hex
    connected = False
    connection_started = time.perf_counter()
    with log_context(
        connection_id=connection_id,
        session_ref=_session_reference(session_code),
    ):
        try:
            if not _origin_is_allowed(websocket.headers.get("origin")):
                record_ws_connection("rejected", "origin")
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

            demo = websocket.query_params.get("demo") == "1"
            token = websocket.cookies.get(DEMO_COOKIE if demo else "token")
            context = None
            rejection_reason = "authentication"
            if token:
                context, rejection_reason = await run_blocking(
                    _load_websocket_session_context,
                    token,
                    session_code,
                    *([True] if demo else []),
                )

            if not context:
                if rejection_reason == "authentication":
                    record_ws_connection("rejected", "authentication")
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
                if rejection_reason == "session_not_found":
                    record_ws_connection("rejected", "session_not_found")
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
                if rejection_reason == "not_member":
                    record_ws_connection("rejected", "not_member")
                    logger.warning(
                        "WebSocket membership check failed",
                        extra={
                            "event_name": "websocket.connection.rejected",
                            "reason": "not_member",
                            "outcome": "rejected",
                        },
                    )
                    await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                    return

                raise RuntimeError("Unknown WebSocket authorization result")

            user_id = context.user_id
            username = context.username
            role = context.role

            client_id = await connection_manager.connect(
                websocket,
                session_code,
                user_id,
                username,
                role,
                connection_id=connection_id,
            )
            connected = True
            WS_ACTIVE.inc()
            record_ws_connection("opened")
            logger.info(
                "WebSocket connected",
                extra={
                    "event_name": "websocket.connection.opened",
                    "client_id": client_id,
                    "user_id": user_id,
                    "role": role,
                    "outcome": "success",
                },
            )

            limiter = WebSocketMessageLimiter(settings.WS_MESSAGES_PER_MINUTE, settings.WS_PREVIEWS_PER_MINUTE)
            while True:
                if context.guest_expires_at is None:
                    raw_message = await websocket.receive_text()
                else:
                    remaining = context.guest_expires_at - time.time()
                    if remaining <= 0:
                        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Demo expired")
                        return
                    try:
                        raw_message = await asyncio.wait_for(websocket.receive_text(), timeout=remaining)
                    except TimeoutError:
                        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Demo expired")
                        return
                    if time.time() >= context.guest_expires_at:
                        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Demo expired")
                        return
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
                if not limiter.allow_frame(now):
                    logger.info(
                        "WebSocket message rate exceeded",
                        extra={
                            "event_name": "websocket.message.rejected",
                            "reason": "rate_limit",
                            "outcome": "rejected",
                        },
                    )
                    await websocket.close(code=status.WS_1013_TRY_AGAIN_LATER, reason="Message rate exceeded")
                    return
                try:
                    message_data = json.loads(raw_message)
                    if not isinstance(message_data, dict):
                        raise ValueError("WebSocket message must be an object")
                    message_data = limiter.filter_message(message_data, now)
                    if message_data is None:
                        continue
                    if demo and not demo_message_allowed(message_data):
                        await connection_manager.send_personal_message(
                            {"type": "error", "data": {"error": "Demo is read-only"}},
                            websocket,
                        )
                        continue
                    message_id = message_data.get("message_id")
                    if not isinstance(message_id, str) or not message_id:
                        message_id = uuid.uuid4().hex
                        message_data["message_id"] = message_id
                    with log_context(message_id=message_id):
                        await connection_manager.handle_message(websocket, message_data)
                        record_ws_message(
                            "inbound",
                            message_data.get("type"),
                            "success",
                            time.perf_counter() - message_started,
                        )
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
                except WebSocketRateExceeded:
                    record_ws_message("inbound", "unknown", "rejected", time.perf_counter() - message_started)
                    await websocket.close(code=status.WS_1013_TRY_AGAIN_LATER, reason="Command rate exceeded")
                    return
                except (json.JSONDecodeError, ValueError):
                    record_ws_message(
                        "inbound", "unknown", "rejected", time.perf_counter() - message_started
                    )
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
        except WriterOwnershipLost:
            await websocket.close(code=1012, reason="Server replaced; reconnect")
        except WebSocketDisconnect as exc:
            record_ws_connection("closed")
            logger.info(
                "WebSocket disconnected",
                extra={
                    "event_name": "websocket.connection.closed",
                    "close_code": exc.code,
                    "outcome": "closed",
                },
            )
        except Exception:
            record_ws_connection("error", "server_error")
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
                WS_ACTIVE.dec()
                WS_DURATION.observe(time.perf_counter() - connection_started)
                await connection_manager.disconnect(websocket)
