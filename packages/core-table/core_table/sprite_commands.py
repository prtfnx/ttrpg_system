"""Stage legacy sprite commands before persistence, never retry rejected state."""
import asyncio
import copy
import inspect
import logging
from functools import wraps

from .action_batches import _finish_before_cancellation, _lock
from .async_actions_protocol import ActionResult
from .server import TableManager

logger = logging.getLogger(__name__)


def atomic_sprite_command(method):
    """Keep the legacy API/results while isolating persistent sprite edits."""
    signature = inspect.signature(method)

    @wraps(method)
    async def wrapped(actions, *args, **kwargs):
        if not actions.table_manager.db_session:
            return await method(actions, *args, **kwargs)
        arguments = signature.bind(actions, *args, **kwargs)
        arguments.apply_defaults()
        worker = asyncio.create_task(_apply(actions, method, arguments.arguments))
        return await _finish_before_cancellation(worker)

    return wrapped


async def _apply(actions, method, arguments):
    session_id = arguments.get("session_id")
    if isinstance(session_id, bool) or not isinstance(session_id, int) or session_id <= 0:
        return ActionResult(False, "Session identity is required for sprite persistence")
    table_id = arguments["table_id"]
    async with _lock(actions):
        live = await actions._get_table(table_id)
        if live is None:
            return ActionResult(False, "Table not found")
        staged = copy.deepcopy(live)
        manager = TableManager()
        manager.tables = {**actions.table_manager.tables, table_id: staged}
        manager.tables_id = {**actions.table_manager.tables_id, str(live.table_id): staged}
        # Replace every alias; global identity checks still see other tables.
        manager.tables = {key: staged if value is live else value for key, value in manager.tables.items()}
        worker = type(actions)(manager)
        call = dict(arguments)
        call.pop("self")
        call["session_id"] = None
        extras = call.pop("kwargs", {})
        try:
            result = await method(worker, **call, **extras)
            if not result.success:
                return result
            persist = getattr(actions, "persist_sprite_command", None)
            if persist is None:
                saved = await actions.table_manager.save_table_async(str(live.table_id), session_id, draft=staged)
            else:
                saved = await persist(staged, copy.deepcopy(live.to_dict()), result, session_id)
            if not saved:
                return ActionResult(False, "Sprite persistence failed; live state unchanged. Reload before retrying.")
            live.__dict__.clear()
            live.__dict__.update(staged.__dict__)
            for entry in worker.action_history:
                await actions._add_to_history(entry)
            return result
        except Exception:
            logger.exception("Isolated sprite command failed")
            return ActionResult(False, "Sprite could not be persisted; live state unchanged. Reload before retrying.")
