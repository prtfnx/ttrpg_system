"""Complete synchronous retention transactions for bounded background workers."""

from datetime import timedelta

from database import crud, models
from database.database import SessionLocal
from utils.time import utc_now


def cleanup_expired_audit_logs(retention_days: int) -> int:
    with SessionLocal() as db:
        deleted = db.query(models.AuditLog).filter(
            models.AuditLog.timestamp < utc_now() - timedelta(days=retention_days),
        ).delete(synchronize_session=False)
        db.commit()
        return int(deleted)


def cleanup_expired_chat_messages(retention_days: int) -> int:
    with SessionLocal() as db:
        return crud.delete_expired_chat_messages(db, utc_now() - timedelta(days=retention_days))
