"""HTTP/WebSocket admission and retirement after database writer handover."""
from __future__ import annotations

import asyncio
import logging

from database.writer import ApplicationWriter
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send
from utils.blocking import run_blocking

logger = logging.getLogger(__name__)


class WriterAdmissionMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        application = scope.get("app")
        writer = getattr(application.state, "application_writer", None) if application else None
        if (
            writer is not None and not writer.active
            and scope["type"] in {"http", "websocket"}
            and scope.get("path") != "/health/live"
        ):
            if scope["type"] == "websocket":
                # Accept only to deliver a retryable close code to browser clients.
                await receive()
                await send({"type": "websocket.accept"})
                await send({"type": "websocket.close", "code": 1012, "reason": "Server replaced; reconnect"})
            else:
                response = JSONResponse(
                    {"detail": "Server replaced; retry on the active instance"},
                    status_code=503, headers={"Retry-After": "2"},
                )
                await response(scope, receive, send)
            return
        await self.app(scope, receive, send)


async def monitor_writer(writer: ApplicationWriter, connection_manager, interval: float = 1.0) -> None:
    while True:
        await asyncio.sleep(interval)
        try:
            active = await run_blocking(writer.check)
        except Exception:
            logger.exception("Application writer ownership check unavailable")
            continue
        if not active:
            logger.warning(
                "Application writer superseded; closing live sessions",
                extra={"event_name": "application.writer.superseded", "generation": writer.generation},
            )
            await connection_manager.close_all(reason="Server replaced; reconnect")
            return
