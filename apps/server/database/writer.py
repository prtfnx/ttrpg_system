"""Database fencing for the application's single active writer.

Every application transaction holds the singleton row's shared lock. A handover
takes its exclusive lock, so earlier transactions finish before the replacement
can hydrate state. PostgreSQL triggers also reject uninstrumented legacy writers.
A superseded process can never reacquire ownership with stale in-memory tables.
"""
from __future__ import annotations

import uuid
from contextlib import contextmanager, nullcontext
from threading import Event, Lock

from sqlalchemy import event, inspect, text
from sqlalchemy.engine import Connection, Engine

STATE_TABLE = "application_writer_state"


class WriterOwnershipLost(RuntimeError):
    """This process must stop admission and discard its superseded live state."""


class ApplicationWriter:
    def __init__(self, application_engine: Engine, control_engine: Engine):
        if application_engine is control_engine:
            raise ValueError("Writer control requires a separate engine")
        self.application_engine = application_engine
        self.control_engine = control_engine
        self.owner_token = str(uuid.uuid4())
        self.generation: int | None = None
        self._claim_attempted = False
        self._claim_lock = Lock()
        self._lost = Event()
        self._closed = Event()
        event.listen(application_engine, "begin", self._begin_transaction)

    @property
    def active(self) -> bool:
        return self.generation is not None and not self._lost.is_set() and not self._closed.is_set()

    def claim(self) -> int:
        """Claim once, before loading any live state; serialize with all old transactions."""
        with self._claim_lock:
            if self._claim_attempted:
                raise RuntimeError("A process must never reacquire writer ownership")
            self._claim_attempted = True
            with self.control_engine.begin() as connection:
                if connection.dialect.name == "postgresql":
                    connection.execute(text("SET LOCAL lock_timeout = '15s'"))
                    connection.execute(text("SET LOCAL statement_timeout = '20s'"))
                generation = connection.execute(text(
                    "UPDATE application_writer_state "
                    "SET owner_token = :owner, generation = generation + 1 "
                    "WHERE id = 1 RETURNING generation"
                ), {"owner": self.owner_token}).scalar_one()
            self.generation = int(generation)
            return self.generation

    def require_active(self) -> None:
        if not self.active:
            raise WriterOwnershipLost("Application writer is unavailable or superseded")

    def _begin_transaction(self, connection: Connection) -> None:
        self.require_active()
        if connection.dialect.name == "postgresql":
            owner = connection.execute(text(
                "SELECT owner_token FROM application_writer_state WHERE id = 1 FOR SHARE"
            )).scalar_one_or_none()
        else:
            # SQLite is for isolated development/tests. Its database-wide writer
            # lock provides the equivalent ordering when explicitly using this gate.
            owner = connection.execute(text(
                "UPDATE application_writer_state SET generation = generation "
                "WHERE id = 1 AND owner_token = :owner RETURNING owner_token"
            ), {"owner": self.owner_token}).scalar_one_or_none()
        if owner != self.owner_token:
            self._lost.set()
            raise WriterOwnershipLost("Application writer has been superseded")
        if connection.dialect.name == "postgresql":
            connection.execute(text(
                "SELECT set_config('ttrpg.writer_token', :owner, true)"
            ), {"owner": self.owner_token})

    def check(self) -> bool:
        """Poll ownership without extending it or reclaiming a lost generation."""
        if not self.active:
            return False
        with self.control_engine.connect() as connection:
            owner = connection.execute(text(
                "SELECT owner_token FROM application_writer_state WHERE id = 1"
            )).scalar_one_or_none()
        if owner != self.owner_token:
            self._lost.set()
        return self.active

    def close(self) -> None:
        # Keep the listener fail-closed for any worker that outlives shutdown.
        # Never clear the persisted owner: that would re-enable legacy writers.
        self._closed.set()
        self.control_engine.dispose()


@contextmanager
def migration_writer_transaction(connection: Connection):
    """Run migrations under exclusive writer fencing, retaining the current owner."""
    transaction = nullcontext() if connection.in_transaction() else connection.begin()
    with transaction:
        if connection.dialect.name == "postgresql" and inspect(connection).has_table(STATE_TABLE):
            owner = connection.execute(text(
                "SELECT owner_token FROM application_writer_state WHERE id = 1 FOR UPDATE"
            )).scalar_one_or_none()
            if owner:
                connection.execute(text(
                    "SELECT set_config('ttrpg.writer_token', :owner, true)"
                ), {"owner": owner})
        yield
