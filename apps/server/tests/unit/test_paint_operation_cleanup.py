from datetime import datetime, timedelta

import pytest
from database import models
from service.paint_operation_cleanup import cleanup_expired_paint_operations
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


def _factory_with_results():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    factory = sessionmaker(bind=engine)
    models.Base.metadata.create_all(engine)
    now = datetime(2026, 9, 29, 12)
    with factory.begin() as db:
        owner = models.User(username="owner", hashed_password="x")
        db.add(owner)
        db.flush()
        session = models.GameSession(
            name="Session", session_code="PAINT", owner_id=owner.id
        )
        db.add(session)
        db.flush()
        table = models.VirtualTable(
            table_id="9e8ed60d-f18c-4f47-a5ce-fc04db50506a",
            name="Table",
            width=1000,
            height=1000,
            session_id=session.id,
        )
        db.add(table)
        db.flush()
        common = {
            "table_id": table.table_id,
            "actor_id": owner.id,
            "request_hash": "a" * 64,
            "result_json": {"action": "create"},
        }
        db.add_all([
            models.PaintOperationResult(
                **common,
                operation_id="3f37ebc7-87e4-4d49-89bb-e39f5d899a83",
                created_at=now - timedelta(seconds=101),
            ),
            models.PaintOperationResult(
                **common,
                operation_id="54802064-8e74-45e0-b5d1-f681407dc9d4",
                created_at=now - timedelta(seconds=100),
            ),
            models.PaintOperationResult(
                **common,
                operation_id="f04b9ba7-5ce4-4aa2-9966-cdcb3dcb3f9b",
                created_at=now - timedelta(seconds=99),
            ),
        ])
    return engine, factory, now


def test_cleanup_deletes_only_results_older_than_retention():
    engine, factory, now = _factory_with_results()
    try:
        deleted = cleanup_expired_paint_operations(
            session_factory=factory,
            retention_seconds=100,
            now=lambda: now,
        )

        assert deleted == 1
        with factory() as db:
            remaining = db.query(models.PaintOperationResult).order_by(
                models.PaintOperationResult.created_at
            ).all()
            assert [row.operation_id for row in remaining] == [
                "54802064-8e74-45e0-b5d1-f681407dc9d4",
                "f04b9ba7-5ce4-4aa2-9966-cdcb3dcb3f9b",
            ]
    finally:
        engine.dispose()


def test_cleanup_rejects_non_positive_retention():
    engine, factory, now = _factory_with_results()
    try:
        with pytest.raises(ValueError, match="retention_seconds"):
            cleanup_expired_paint_operations(
                session_factory=factory,
                retention_seconds=0,
                now=lambda: now,
            )
    finally:
        engine.dispose()
