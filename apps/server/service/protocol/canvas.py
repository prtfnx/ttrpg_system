"""Authenticated transport for atomic editor commands and durable history."""
import asyncio
import copy

from core_table.combat import CombatPhase
from core_table.protocol import Message, MessageType
from database.database import SessionLocal
from service.canvas_command_service import CanvasCommandService, CanvasRejected
from service.combat_engine import CombatEngine
from utils.blocking import run_blocking
from utils.logger import setup_logger

from ._protocol_base import _ProtocolBase

logger = setup_logger(__name__)


class _CanvasMixin(_ProtocolBase):
    @staticmethod
    def _canvas_failure(data, code, error):
        response = {"success": False, "code": code, "error": error}
        for key, limit in (("operation_id", 36), ("table_id", 128)):
            if isinstance(data.get(key), str) and len(data[key]) <= limit:
                response[key] = data[key]
        return Message(MessageType.CANVAS_COMMAND_RESULT, response)

    async def handle_canvas_command(self, msg: Message, client_id: str) -> Message:
        data = msg.data or {}
        session_id = self._get_session_id(msg)
        actor_id = self._get_user_id(msg, client_id)
        if session_id is None or actor_id is None:
            return self._canvas_failure(data, "forbidden", "Authenticated session context is required")
        table_id = data.get("table_id")
        if not isinstance(table_id, str):
            return self._canvas_failure(data, "invalid_payload", "table_id is required")
        try:
            worker = asyncio.create_task(self._commit_canvas_command(
                copy.deepcopy(data), session_id, actor_id, table_id, client_id,
            ))
            try:
                return await asyncio.shield(worker)
            except asyncio.CancelledError:
                # SQL cannot be cancelled. Do not release the session mutation
                # lock while a committed table is still waiting for publication.
                while not worker.done():
                    try:
                        await asyncio.shield(worker)
                    except asyncio.CancelledError:
                        continue
                    except Exception:
                        break
                if not worker.cancelled():
                    worker.exception()  # retrieve a failed worker before re-raising
                raise
        except CanvasRejected as exc:
            return self._canvas_failure(data, exc.code, str(exc))
        except Exception:
            logger.exception("Canvas command failed")
            return self._canvas_failure(data, "persistence_failed", "Canvas command failed; reload before retrying")

    async def _commit_canvas_command(self, data, session_id, actor_id, table_id, client_id):
        async with self.table_manager.table_write_lock(table_id):
            table = self.table_manager.get_table(table_id)
            if table is None:
                raise CanvasRejected("not_found", "Table is not loaded")
            combat = CombatEngine.get_state(self._get_session_code())
            combat_ids = tuple(str(member.entity_id) for member in combat.combatants) if (
                combat is not None and combat.table_id == table_id and combat.phase != CombatPhase.INACTIVE
            ) else ()
            result = await run_blocking(
                CanvasCommandService(SessionLocal).execute,
                session_id=session_id, actor_id=actor_id, command=data,
                table_snapshot=copy.deepcopy(table.to_dict()), combat_sprite_ids=combat_ids,
            )
            if result.table is not None:
                self.table_manager.add_table(result.table)
            receipt = copy.deepcopy(result.receipt)
            for event in result.events:
                message = Message(MessageType(event["type"]), event["data"])
                # Publication is post-commit. A transport failure cannot turn a
                # durable success into a rejected command or prevent live state
                # publication. The receipt asks the sender for fresh hydration.
                try:
                    if event["layer"] is None:
                        await self.broadcast_to_session(message, client_id)
                    else:
                        await self.broadcast_filtered(message, event["layer"], client_id)
                except Exception:
                    receipt["resync_required"] = True
                    logger.exception("Canvas event broadcast failed after commit")
                try:
                    await self.send_to_client(message, client_id)
                except Exception:
                    receipt["resync_required"] = True
                    logger.exception("Canvas event delivery failed after commit")
            return Message(MessageType.CANVAS_COMMAND_RESULT, receipt)

    async def handle_canvas_history_request(self, msg: Message, client_id: str) -> Message:
        table_id = (msg.data or {}).get("table_id")
        state = {"table_id": table_id if isinstance(table_id, str) and len(table_id) <= 128 else "",
                 "can_undo": False, "can_redo": False}
        try:
            session_id, actor_id = self._get_session_id(msg), self._get_user_id(msg, client_id)
            if session_id is None or actor_id is None:
                raise CanvasRejected("forbidden", "Authenticated session context is required")
            if not isinstance(table_id, str) or not table_id:
                raise CanvasRejected("invalid_payload", "table_id is required")
            state = await run_blocking(CanvasCommandService(SessionLocal).history,
                session_id=session_id, actor_id=actor_id, table_id=table_id)
        except CanvasRejected as exc:
            state.update(code=exc.code, error=str(exc))
        except Exception:
            logger.exception("Canvas history request failed")
            state.update(code="history_unavailable", error="Canvas history is unavailable")
        return Message(MessageType.CANVAS_HISTORY_STATE, state)
