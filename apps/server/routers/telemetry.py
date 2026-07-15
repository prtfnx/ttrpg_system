"""Privacy-bounded browser error intake."""

from typing import Literal

from config import Settings
from database.database import get_db
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from routers.users import get_current_user_optional
from sqlalchemy.orm import Session
from utils.logger import setup_logger
from utils.observability import BROWSER_ERRORS
from utils.rate_limiter import RateLimiter, get_client_ip

router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])
logger = setup_logger(__name__)
settings = Settings()
telemetry_limiter = RateLimiter()


class BrowserErrorReport(BaseModel):
    event_type: Literal["error", "unhandled_rejection"]
    message: str = Field(min_length=1, max_length=512)
    stack: str | None = Field(default=None, max_length=4096)
    path: str = Field(min_length=1, max_length=256, pattern=r"^/")
    release: str = Field(min_length=1, max_length=128)


@router.post("/browser-error", status_code=204)
async def browser_error(
    report: BrowserErrorReport,
    request: Request,
    db: Session = Depends(get_db),
):
    if not settings.BROWSER_TELEMETRY_ENABLED:
        raise HTTPException(status_code=404, detail="Not found")
    identifier = get_client_ip(request)
    if not telemetry_limiter.is_allowed(identifier, max_requests=30, window_minutes=1):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    user = await get_current_user_optional(request, db)
    release_label = "current" if report.release == settings.SERVICE_VERSION else "other"
    BROWSER_ERRORS.labels(report.event_type, release_label).inc()
    logger.error(
        "Browser error reported",
        extra={
            "event_name": "browser.error.reported",
            "browser_event_type": report.event_type,
            "browser_error_message": report.message,
            "browser_error_stack": report.stack,
            "browser_path": report.path,
            "client_release": report.release,
            "user_id": user.id if user else None,
        },
    )
    return Response(status_code=204)
