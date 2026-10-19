"""Worker-owned wall transactions with cancellation-safe live publication."""
import asyncio
import inspect
from functools import wraps

from .action_batches import _finish_before_cancellation


def atomic_wall_command(method):
    signature = inspect.signature(method)
    @wraps(method)
    async def wrapped(actions, *args, **kwargs):
        if not actions.table_manager.db_session:
            return await method(actions, *args, **kwargs)
        table_id = signature.bind(actions, *args, **kwargs).arguments["table_id"]

        async def apply():
            table = await actions._get_table(table_id)
            key = str(table.table_id) if table is not None else table_id
            async with actions.table_manager.table_write_lock(key):
                return await method(actions, *args, **kwargs)

        return await _finish_before_cancellation(asyncio.create_task(apply()))
    return wrapped


async def write_wall(actions, table_id, operation, wall_id, payload, session_id):
    from sqlalchemy.orm import sessionmaker
    from utils.blocking import run_blocking

    factory = sessionmaker(bind=actions.table_manager.db_session.get_bind(), expire_on_commit=False)
    actions.table_manager.release_db_session()

    def commit():
        from database import crud, models
        with factory() as db, db.begin():
            table = db.query(models.VirtualTable).filter_by(table_id=table_id, session_id=session_id).one_or_none()
            if table is None:
                raise ValueError("Wall table does not belong to this session")
            if operation == "create":
                crud.create_wall(db, payload, commit=False)
            else:
                row = db.query(models.Wall).filter_by(wall_id=wall_id, table_id=table_id).one_or_none()
                if row is None:
                    raise KeyError("Wall not found in this table")
                if operation == "update":
                    crud.update_wall(db, wall_id, payload, commit=False)
                else:
                    crud.delete_wall(db, wall_id, commit=False)
    await run_blocking(commit)
