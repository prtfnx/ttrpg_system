"""Request-local timings; operation identities belong in logs, never metric labels."""
import time
from contextvars import ContextVar
from dataclasses import dataclass


@dataclass
class ActionDiagnostics:
    sql_count: int = 0
    sql_seconds: float = 0
    worker_wait_seconds: float = 0
    worker_seconds: float = 0
    lock_wait_seconds: float = 0

    def fields(self):
        return {"sql_count": self.sql_count, "sql_ms": round(self.sql_seconds * 1000, 2),
                "worker_wait_ms": round(self.worker_wait_seconds * 1000, 2),
                "worker_ms": round(self.worker_seconds * 1000, 2),
                "lock_wait_ms": round(self.lock_wait_seconds * 1000, 2)}


current_action_diagnostics: ContextVar[ActionDiagnostics | None] = ContextVar("action_diagnostics", default=None)


def record_sql(started: float | None):
    stats = current_action_diagnostics.get()
    if stats is not None:
        stats.sql_count += 1
        if started is not None:
            stats.sql_seconds += time.perf_counter() - started
