"""Atomic table deletion and actor-scoped receipt recovery in a blocking worker."""

import uuid
from collections.abc import Callable
from contextlib import AbstractContextManager
from dataclasses import dataclass

from database import crud, models
from database.database import SessionLocal
from service.session_operation_receipts import (
    OperationIdentity,
    OperationOutcomeUnknown,
    OperationRejected,
    find_receipt,
    lock_operation_session,
    session_actor_is_dm,
    stage_receipt,
)
from sqlalchemy import or_
from sqlalchemy.orm import Session


@dataclass(frozen=True)
class TableDeleteIntent:
    identity: OperationIdentity
    table_id: str

    @classmethod
    def create(cls, session_id, actor_id, request_id, data):
        if not isinstance(data, dict) or set(data) != {'table_id'}:
            raise OperationRejected('Table deletion requires only a table_id')
        try:
            table_id = str(uuid.UUID(data['table_id']))
        except (ValueError, TypeError, AttributeError) as exc:
            raise OperationRejected('table_id must be a table UUID') from exc
        return cls(OperationIdentity.create(session_id, actor_id, 'table_delete', request_id,
                                           {'table_id': table_id}), table_id)


@dataclass(frozen=True)
class TableDeletionAccepted:
    receipt: dict
    replayed: bool
    actor_authorized: bool = True


class TableDeletionService:
    def __init__(self, session_factory: Callable[[], AbstractContextManager[Session]] | None = None):
        self._factory = session_factory or SessionLocal

    @staticmethod
    def _result(intent, *, already_deleted=False):
        return dict(success=True, operation='delete', table_id=intent.table_id,
                    operation_id=intent.identity.operation_id, already_deleted=already_deleted,
                    message='Table deleted successfully')

    @staticmethod
    def _verify_deletion(db, intent):
        retired = db.get(models.TableDeletionTombstone, intent.table_id)
        resident = db.query(models.VirtualTable.id).filter_by(table_id=intent.table_id).first()
        if retired is None or retired.session_id != intent.identity.session_id or resident is not None:
            raise OperationOutcomeUnknown('Table deletion evidence is inconsistent')

    def resolve(self, intent: TableDeleteIntent, *, internal_recovery=False) -> TableDeletionAccepted | None:
        with self._factory() as db:
            game = lock_operation_session(db, intent.identity, require_dm=not internal_recovery)
            receipt = find_receipt(db, intent.identity)
            if receipt is None:
                retired = db.get(models.TableDeletionTombstone, intent.table_id)
                if not internal_recovery or retired is None or retired.session_id != intent.identity.session_id:
                    return None
                # Actor/receipt removal ends retry history, but retained table
                # retirement still proves the state needed for server cleanup.
                self._verify_deletion(db, intent)
                return TableDeletionAccepted(self._result(intent, already_deleted=True), True, False)
            self._verify_deletion(db, intent)
            authorized = bool(game.is_active and session_actor_is_dm(db, game, intent.identity.actor_id))
            return TableDeletionAccepted(receipt, True, authorized)

    def execute(self, intent: TableDeleteIntent, cached_encounter_active=False) -> TableDeletionAccepted:
        commit_started = False
        try:
            with self._factory() as db:
                lock_operation_session(db, intent.identity)
                receipt = find_receipt(db, intent.identity)
                if receipt is not None:
                    self._verify_deletion(db, intent)
                    return TableDeletionAccepted(receipt, True)
                table = db.query(models.VirtualTable).filter_by(table_id=intent.table_id).with_for_update().one_or_none()
                retired = db.get(models.TableDeletionTombstone, intent.table_id)
                if table is not None and table.session_id != intent.identity.session_id:
                    raise OperationRejected('Table not found in this session', 'forbidden')
                if table is None and (retired is None or retired.session_id != intent.identity.session_id):
                    raise OperationRejected('Table not found in this session', 'forbidden')
                already_deleted = table is None
                if table is not None:
                    combat = db.query(models.CombatEncounter.id).filter_by(session_id=intent.identity.session_id,
                        table_id=intent.table_id, ended_at=None).filter(or_(models.CombatEncounter.phase.is_(None),
                            models.CombatEncounter.phase.notin_(('inactive', 'ended')))).first()
                    choice = db.query(models.ChoiceEncounter.id).filter_by(session_id=intent.identity.session_id,
                        table_id=intent.table_id, ended_at=None).filter(models.ChoiceEncounter.phase != 'completed').first()
                    if cached_encounter_active or combat is not None or choice is not None:
                        raise OperationRejected('End the active encounter before deleting this table', 'conflict')
                    if retired is not None:
                        raise OperationOutcomeUnknown('Retired table identity was recreated outside the deletion contract')
                    crud.stage_table_deletion(db, table, intent.identity.actor_id)
                receipt = self._result(intent, already_deleted=already_deleted)
                stage_receipt(db, intent.identity, receipt)
                commit_started = True
                db.commit()
                return TableDeletionAccepted(receipt, False)
        except (OperationRejected, OperationOutcomeUnknown):
            if not commit_started:
                raise
        except Exception as exc:
            if not commit_started:
                raise OperationRejected('Table deletion could not be saved', 'persistence_failed') from exc
        try:
            recovered = self.resolve(intent)
        except Exception as exc:
            raise OperationOutcomeUnknown('Table deletion outcome is unknown') from exc
        if recovered is not None:
            return recovered
        raise OperationRejected('Table deletion did not commit. Retry the original request.', 'persistence_failed')
