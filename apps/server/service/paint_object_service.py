"""Transactional authority for durable paint objects."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Callable, Mapping

from config import Settings
from core_table.paint import (
    PaintValidationError,
    paint_limits,
    paint_point_count,
    validate_paint_object_input,
    validate_paint_payload_size,
)
from database import models
from sqlalchemy import case, func
from sqlalchemy.orm import Session
from utils.roles import can_interact, is_dm
from utils.time import utc_now


@dataclass(frozen=True)
class PaintCommandError:
    code: str
    message: str
    current_object: dict[str, Any] | None = None
    current_version: int | None = None


@dataclass(frozen=True)
class PaintCommandResult:
    event: dict[str, Any] | None = None
    error: PaintCommandError | None = None
    broadcast: bool = False


@dataclass(frozen=True)
class PaintSnapshot:
    table_id: str
    revision: int
    objects: list[dict[str, Any]]


class _Rejected(RuntimeError):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        current_object: dict[str, Any] | None = None,
        current_version: int | None = None,
    ):
        super().__init__(message)
        self.error = PaintCommandError(
            code,
            message,
            current_object=current_object,
            current_version=current_version,
        )


def _timestamp(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _object_dict(value: models.PaintObject) -> dict[str, Any]:
    return {
        "id": value.id,
        "table_id": value.table_id,
        "kind": value.kind,
        "geometry": value.geometry,
        "transform": value.transform,
        "style": value.style,
        "created_by": value.created_by,
        "version": value.version,
        "z_order": value.z_order,
        "created_at": _timestamp(value.created_at),
        "updated_at": _timestamp(value.updated_at),
    }


def _canonical_payload(value: Mapping[str, Any]) -> dict[str, Any]:
    try:
        return json.loads(json.dumps(
            value,
            allow_nan=False,
            sort_keys=True,
            separators=(",", ":"),
        ))
    except (TypeError, ValueError) as exc:
        raise _Rejected("invalid_payload", "Paint command must contain finite JSON values") from exc


def _request_hash(action: str, payload: Mapping[str, Any]) -> str:
    canonical = json.dumps(
        {"action": action, "payload": payload},
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode()).hexdigest()


class PaintObjectService:
    """Apply one paint command per database transaction."""

    def __init__(
        self,
        session_factory: Callable[[], Session],
        *,
        retry_window_seconds: int | None = None,
        writes_enabled: bool | None = None,
        now: Callable[[], datetime] = utc_now,
    ):
        self._session_factory = session_factory
        configured_window = (
            retry_window_seconds
            if retry_window_seconds is not None
            else Settings().PAINT_OPERATION_RETRY_WINDOW_SECONDS
        )
        if configured_window <= 0:
            raise ValueError("retry_window_seconds must be positive")
        self._retry_window = timedelta(seconds=configured_window)
        self._now = now
        self._writes_enabled = (
            writes_enabled if writes_enabled is not None
            else Settings().PAINT_OBJECT_WRITES_ENABLED
        )

    def _require_writes(self) -> None:
        if not self._writes_enabled:
            raise _Rejected("paint_disabled", "Painting is read-only during rollout or maintenance")

    @staticmethod
    def _lock_table_and_role(
        db: Session,
        *,
        table_id: str,
        session_id: int,
        actor_id: int,
    ) -> tuple[models.VirtualTable, str]:
        row = (
            db.query(models.VirtualTable, models.GameSession.owner_id)
            .join(
                models.GameSession,
                models.VirtualTable.session_id == models.GameSession.id,
            )
            .filter(
                models.VirtualTable.table_id == table_id,
                models.VirtualTable.session_id == session_id,
            )
            .with_for_update(of=models.VirtualTable)
            .one_or_none()
        )
        if row is None:
            raise _Rejected("not_found", "Paint table was not found in this session")
        table, owner_id = row
        if owner_id == actor_id:
            return table, "owner"
        membership = (
            db.query(models.GamePlayer.role)
            .filter(
                models.GamePlayer.session_id == session_id,
                models.GamePlayer.user_id == actor_id,
            )
            .one_or_none()
        )
        if membership is None or membership[0] is None:
            raise _Rejected("forbidden", "Actor is not a member of this session")
        return table, membership[0]

    @staticmethod
    def _lock_state(
        db: Session,
        table_id: str,
        *,
        create: bool = True,
    ) -> models.PaintState | None:
        state = (
            db.query(models.PaintState)
            .filter(models.PaintState.table_id == table_id)
            .with_for_update()
            .one_or_none()
        )
        if state is None and create:
            state = models.PaintState(table_id=table_id, revision=0, next_z_order=1)
            db.add(state)
            db.flush()
        return state

    @staticmethod
    def _require_interactive(role: str) -> None:
        if not can_interact(role):
            raise _Rejected("forbidden", "Spectators cannot change paint objects")

    @staticmethod
    def _require_editor(role: str, actor_id: int, paint_object: models.PaintObject) -> None:
        if paint_object.created_by != actor_id and not is_dm(role):
            raise _Rejected("forbidden", "Only the creator or a DM may edit this paint object")

    def _replay(
        self,
        db: Session,
        *,
        table_id: str,
        actor_id: int,
        operation_id: str,
        request_hash: str,
    ) -> PaintCommandResult | None:
        previous = db.get(
            models.PaintOperationResult,
            (table_id, actor_id, operation_id),
        )
        if previous is None:
            return None
        if previous.created_at < self._now() - self._retry_window:
            raise _Rejected(
                "retry_window_expired",
                "Paint operation retry window expired; request a snapshot before retrying",
            )
        if previous.request_hash != request_hash:
            raise _Rejected(
                "invalid_payload",
                "operation_id was already used for a different paint command",
            )
        return PaintCommandResult(event=previous.result_json, broadcast=False)

    def _record_result(
        self,
        db: Session,
        *,
        table_id: str,
        actor_id: int,
        operation_id: str,
        request_hash: str,
        event: dict[str, Any],
    ) -> None:
        db.add(models.PaintOperationResult(
            table_id=table_id,
            actor_id=actor_id,
            operation_id=operation_id,
            request_hash=request_hash,
            result_json=event,
            created_at=self._now(),
        ))

    @staticmethod
    def _table_objects(db: Session, table_id: str) -> list[models.PaintObject]:
        return (
            db.query(models.PaintObject)
            .filter(models.PaintObject.table_id == table_id)
            .order_by(models.PaintObject.z_order, models.PaintObject.id)
            .all()
        )

    @staticmethod
    def _require_budget(
        db: Session,
        table_id: str,
        candidate: Mapping[str, Any],
        *,
        replacing_id: str | None = None,
    ) -> None:
        limits = paint_limits()
        # Count in the database instead of transferring/deserializing every path
        # for each edit. The table/state locks keep this aggregate transactional.
        if db.get_bind().dialect.name == "postgresql":
            path_length = func.jsonb_array_length(models.PaintObject.geometry["points"])
        else:
            path_length = func.json_array_length(models.PaintObject.geometry, "$.points")
        point_count = case(
            (models.PaintObject.kind == "freehand", path_length),
            (models.PaintObject.kind == "line", 2),
            else_=0,
        )
        query = db.query(func.count(), func.coalesce(func.sum(point_count), 0)).filter(
            models.PaintObject.table_id == table_id,
        )
        if replacing_id is not None:
            query = query.filter(models.PaintObject.id != replacing_id)
        objects, points = query.one()
        if objects >= limits.max_objects_per_table:
            raise _Rejected("limit_exceeded", "Paint table object limit reached")
        points += paint_point_count(candidate)
        if points > limits.max_points_per_table:
            raise _Rejected("limit_exceeded", "Paint table point limit reached")

    def create(
        self,
        *,
        session_id: int,
        actor_id: int,
        table_id: str,
        operation_id: str,
        editable: Mapping[str, Any],
    ) -> PaintCommandResult:
        try:
            self._require_writes()
            candidate = _canonical_payload(editable)
            validate_paint_object_input(candidate)
            request_hash = _request_hash("create", candidate)
            with self._session_factory() as db, db.begin():
                _, role = self._lock_table_and_role(
                    db,
                    table_id=table_id,
                    session_id=session_id,
                    actor_id=actor_id,
                )
                self._require_interactive(role)
                state = self._lock_state(db, table_id)
                assert state is not None
                replay = self._replay(
                    db,
                    table_id=table_id,
                    actor_id=actor_id,
                    operation_id=operation_id,
                    request_hash=request_hash,
                )
                if replay is not None:
                    return replay
                if db.get(models.PaintObject, candidate["id"]) is not None:
                    raise _Rejected("invalid_payload", "Paint object id already exists")
                self._require_budget(db, table_id, candidate)
                now = utc_now()
                accepted = models.PaintObject(
                    id=candidate["id"],
                    table_id=table_id,
                    kind=candidate["kind"],
                    geometry=candidate["geometry"],
                    transform=candidate["transform"],
                    style=candidate["style"],
                    created_by=actor_id,
                    version=1,
                    z_order=state.next_z_order,
                    created_at=now,
                    updated_at=now,
                )
                db.add(accepted)
                accepted_dto = _object_dict(accepted)
                validate_paint_payload_size(accepted_dto)
                db.flush()
                state.revision += 1
                state.next_z_order += 1
                event = {
                    "operation_id": operation_id,
                    "table_id": table_id,
                    "revision": state.revision,
                    "action": "create",
                    "object": accepted_dto,
                }
                self._record_result(
                    db,
                    table_id=table_id,
                    actor_id=actor_id,
                    operation_id=operation_id,
                    request_hash=request_hash,
                    event=event,
                )
            return PaintCommandResult(event=event, broadcast=True)
        except (PaintValidationError, _Rejected) as exc:
            error = exc.error if isinstance(exc, _Rejected) else PaintCommandError(
                "invalid_payload", str(exc)
            )
            return PaintCommandResult(error=error)

    def update(
        self,
        *,
        session_id: int,
        actor_id: int,
        table_id: str,
        operation_id: str,
        object_id: str,
        expected_version: int,
        editable: Mapping[str, Any],
    ) -> PaintCommandResult:
        try:
            self._require_writes()
            candidate = _canonical_payload(editable)
            validate_paint_object_input(candidate)
            if candidate["id"] != object_id:
                raise _Rejected("invalid_payload", "Paint object id does not match update target")
            request = {
                "id": object_id,
                "expected_version": expected_version,
                "object": candidate,
            }
            request_hash = _request_hash("update", request)
            with self._session_factory() as db, db.begin():
                _, role = self._lock_table_and_role(
                    db,
                    table_id=table_id,
                    session_id=session_id,
                    actor_id=actor_id,
                )
                self._require_interactive(role)
                state = self._lock_state(db, table_id)
                assert state is not None
                replay = self._replay(
                    db,
                    table_id=table_id,
                    actor_id=actor_id,
                    operation_id=operation_id,
                    request_hash=request_hash,
                )
                if replay is not None:
                    return replay
                current = (
                    db.query(models.PaintObject)
                    .filter(
                        models.PaintObject.table_id == table_id,
                        models.PaintObject.id == object_id,
                    )
                    .with_for_update()
                    .one_or_none()
                )
                if current is None:
                    raise _Rejected("not_found", "Paint object was not found")
                self._require_editor(role, actor_id, current)
                if current.version != expected_version:
                    current_dto = _object_dict(current)
                    raise _Rejected(
                        "version_conflict",
                        "Paint object version changed",
                        current_object=current_dto,
                        current_version=current.version,
                    )
                # A validated table cannot exceed its budgets through a move,
                # restyle, resize, or point-count reduction. Only growth needs
                # an aggregate of the other objects. This is safe under the
                # same table/state locks as inserts and growing replacements.
                previous_points = paint_point_count({"kind": current.kind, "geometry": current.geometry})
                if paint_point_count(candidate) > previous_points:
                    self._require_budget(db, table_id, candidate, replacing_id=object_id)
                current.kind = candidate["kind"]
                current.geometry = candidate["geometry"]
                current.transform = candidate["transform"]
                current.style = candidate["style"]
                current.version += 1
                current.updated_at = utc_now()
                accepted_dto = _object_dict(current)
                validate_paint_payload_size(accepted_dto)
                state.revision += 1
                db.flush()
                event = {
                    "operation_id": operation_id,
                    "table_id": table_id,
                    "revision": state.revision,
                    "action": "update",
                    "object": accepted_dto,
                }
                self._record_result(
                    db,
                    table_id=table_id,
                    actor_id=actor_id,
                    operation_id=operation_id,
                    request_hash=request_hash,
                    event=event,
                )
            return PaintCommandResult(event=event, broadcast=True)
        except (PaintValidationError, _Rejected) as exc:
            error = exc.error if isinstance(exc, _Rejected) else PaintCommandError(
                "invalid_payload", str(exc)
            )
            return PaintCommandResult(error=error)

    def delete(
        self,
        *,
        session_id: int,
        actor_id: int,
        table_id: str,
        operation_id: str,
        object_id: str,
        expected_version: int,
    ) -> PaintCommandResult:
        try:
            self._require_writes()
            request = {"id": object_id, "expected_version": expected_version}
            request_hash = _request_hash("delete", request)
            with self._session_factory() as db, db.begin():
                _, role = self._lock_table_and_role(
                    db,
                    table_id=table_id,
                    session_id=session_id,
                    actor_id=actor_id,
                )
                self._require_interactive(role)
                state = self._lock_state(db, table_id)
                assert state is not None
                replay = self._replay(
                    db,
                    table_id=table_id,
                    actor_id=actor_id,
                    operation_id=operation_id,
                    request_hash=request_hash,
                )
                if replay is not None:
                    return replay
                current = (
                    db.query(models.PaintObject)
                    .filter(
                        models.PaintObject.table_id == table_id,
                        models.PaintObject.id == object_id,
                    )
                    .with_for_update()
                    .one_or_none()
                )
                if current is None:
                    raise _Rejected("not_found", "Paint object was not found")
                self._require_editor(role, actor_id, current)
                if current.version != expected_version:
                    current_dto = _object_dict(current)
                    raise _Rejected(
                        "version_conflict",
                        "Paint object version changed",
                        current_object=current_dto,
                        current_version=current.version,
                    )
                deleted_version = current.version
                db.delete(current)
                state.revision += 1
                event = {
                    "operation_id": operation_id,
                    "table_id": table_id,
                    "revision": state.revision,
                    "action": "delete",
                    "deleted_id": object_id,
                    "deleted_version": deleted_version,
                }
                self._record_result(
                    db,
                    table_id=table_id,
                    actor_id=actor_id,
                    operation_id=operation_id,
                    request_hash=request_hash,
                    event=event,
                )
            return PaintCommandResult(event=event, broadcast=True)
        except _Rejected as exc:
            return PaintCommandResult(error=exc.error)

    def snapshot(
        self,
        *,
        session_id: int,
        actor_id: int,
        table_id: str,
    ) -> PaintSnapshot | PaintCommandError:
        try:
            with self._session_factory() as db, db.begin():
                self._lock_table_and_role(
                    db,
                    table_id=table_id,
                    session_id=session_id,
                    actor_id=actor_id,
                )
                state = self._lock_state(db, table_id, create=False)
                objects = [
                    _object_dict(value) for value in self._table_objects(db, table_id)
                ]
                return PaintSnapshot(table_id, state.revision if state else 0, objects)
        except _Rejected as exc:
            return exc.error
