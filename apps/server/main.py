"""
FastAPI-based TTRPG Server for render.com hosting
Provides HTTP/webhook and WebSocket endpoints for client communication
"""
import asyncio
import os
import re
import secrets
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path

import uvicorn
from api import game_ws
from config import Settings
from core_table.server import TableManager
from database import models
from database.database import SessionLocal, engine, get_db, schema_is_current
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from routers import audit, auth, compendium, demo, game, invitations, telemetry, users
from routers.users import get_current_user_optional
from service.game_session import ConnectionManager
from service.readiness import ReadinessChecker
from storage.r2_manager import R2AssetManager
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware
from utils.logger import bind_log_context, configure_logging, reset_log_context, setup_logger
from utils.audit import persist_http_security_decision
from utils.observability import configure_tracing, observe_http, record_job, refresh_durable_metrics
from utils.rate_limiter import login_limiter, registration_limiter

settings = Settings()
configure_logging(level=settings.LOG_LEVEL, log_format=settings.LOG_FORMAT)
logger = setup_logger(__name__)
environment = settings.ENVIRONMENT.lower()
_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{8,128}$")
_TRACEPARENT = re.compile(
    r"^[\da-f]{2}-([\da-f]{32})-([\da-f]{16})-[\da-f]{2}$", re.IGNORECASE
)

# Application state
class AppState:
    def __init__(self):
        self.connection_manager = ConnectionManager()
        self.table_manager = TableManager()

app_state = AppState()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage server lifecycle"""
    # Startup
    logger.info(
        "Application starting",
        extra={"event_name": "application.starting", "service_version": settings.SERVICE_VERSION},
    )

    if settings.is_production:
        schema_unavailable = False
        try:
            schema_current = schema_is_current()
        except Exception:
            schema_unavailable = True
            schema_current = False
        if schema_unavailable:
            logger.critical(
                "Database schema status is unavailable",
                extra={"event_name": "database.schema.unavailable", "outcome": "error"},
            )
            raise RuntimeError("Database schema status is unavailable") from None
        if not schema_current:
            logger.critical(
                "Database schema is not at the release migration head",
                extra={"event_name": "database.schema.rejected", "outcome": "error"},
            )
            raise RuntimeError("Database schema is not current")
    logger.info("Database schema accepted", extra={"event_name": "database.schema.accepted"})

    # Store app state in FastAPI app
    app.state.connection_manager = app_state.connection_manager
    app.state.table_manager = app_state.table_manager

    # Start cleanup task for rate limiters
    cleanup_task = asyncio.create_task(rate_limiter_cleanup_task())
    audit_retention_cleanup = asyncio.create_task(audit_retention_task())

    yield

    # Shutdown
    cleanup_task.cancel()
    audit_retention_cleanup.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass
    try:
        await audit_retention_cleanup
    except asyncio.CancelledError:
        pass
    logger.info("Application stopped", extra={"event_name": "application.stopped"})

async def rate_limiter_cleanup_task():
    """Background task to clean up old rate limiter entries"""
    while True:
        started = time.perf_counter()
        try:
            # Clean up entries older than 1 hour every 30 minutes
            await asyncio.sleep(1800)  # 30 minutes
            started = time.perf_counter()
            registration_limiter.cleanup_old_entries(hours_old=1)
            login_limiter.cleanup_old_entries(hours_old=1)
            record_job("rate_limit_cleanup", "success", time.perf_counter() - started)
            logger.debug("Rate limiter cleanup completed")
        except asyncio.CancelledError:
            break
        except Exception:
            record_job("rate_limit_cleanup", "error", time.perf_counter() - started)
            logger.exception(
                "Rate limiter cleanup failed",
                extra={"event_name": "rate_limiter.cleanup.failed"},
            )


async def audit_retention_task():
    """Apply the configured audit retention window without blocking startup."""
    while True:
        started = time.perf_counter()
        try:
            await asyncio.sleep(86400)
            started = time.perf_counter()
            db = SessionLocal()
            try:
                deleted = db.query(models.AuditLog).filter(
                    models.AuditLog.timestamp < datetime.utcnow() - timedelta(
                        days=settings.AUDIT_RETENTION_DAYS
                    )
                ).delete(synchronize_session=False)
                db.commit()
                record_job("audit_retention", "success", time.perf_counter() - started)
                logger.info(
                    "Audit retention cleanup completed",
                    extra={
                        "event_name": "audit.retention.completed",
                        "deleted_count": deleted,
                    },
                )
            finally:
                db.close()
        except asyncio.CancelledError:
            break
        except Exception:
            record_job("audit_retention", "error", time.perf_counter() - started)
            logger.exception(
                "Audit retention cleanup failed",
                extra={"event_name": "audit.retention.failed", "outcome": "error"},
            )

# Create FastAPI app
app = FastAPI(
    title="TTRPG Web Server",
    description="Web-based TTRPG server with WebSocket support",
    version="1.0.0",
    lifespan=lifespan
)
configure_tracing(app, engine, settings)


@app.middleware("http")
async def request_observability(request: Request, call_next):
    """Correlate HTTP work and emit one bounded completion event."""
    supplied_id = request.headers.get("x-request-id", "")
    request_id = supplied_id if _REQUEST_ID.fullmatch(supplied_id) else uuid.uuid4().hex
    trace_match = _TRACEPARENT.fullmatch(request.headers.get("traceparent", ""))
    context_token = bind_log_context(
        request_id=request_id,
        trace_id=trace_match.group(1).lower() if trace_match else None,
        http_method=request.method,
    )
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        route = request.scope.get("route")
        observe_http(
            request.method,
            getattr(route, "path", "unmatched"),
            500,
            time.perf_counter() - started,
        )
        logger.exception(
            "Unhandled HTTP request failure",
            extra={
                "event_name": "http.request.failed",
                "http_route": request.url.path,
                "duration_ms": round((time.perf_counter() - started) * 1000, 3),
                "outcome": "error",
            },
        )
        raise
    else:
        response.headers["X-Request-ID"] = request_id
        route = request.scope.get("route")
        route_path = getattr(route, "path", "unmatched")
        observe_http(
            request.method,
            route_path,
            response.status_code,
            time.perf_counter() - started,
        )
        persist_http_security_decision(request, response.status_code, route_path)
        if not request.url.path.startswith("/health/"):
            logger.info(
                "HTTP request completed",
                extra={
                    "event_name": "http.request.completed",
                    "http_route": route_path,
                    "http_status_code": response.status_code,
                    "duration_ms": round((time.perf_counter() - started) * 1000, 3),
                    "outcome": "error" if response.status_code >= 500 else "success",
                },
            )
        return response
    finally:
        reset_log_context(context_token)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)

# Add Session middleware for OAuth state management
# Use a strong secret key in production (.env: SESSION_SECRET)
session_secret = settings.resolved_session_secret
if not settings.is_production and settings.SESSION_SECRET != session_secret:
    logger.warning(
        "SESSION_SECRET is not set or too short; using a default development secret. "
        "Do NOT use this in production."
    )

app.add_middleware(
    SessionMiddleware,
    secret_key=session_secret,
    session_cookie="session",
    max_age=3600,  # 1 hour
    same_site="lax",
    https_only=settings.is_production  # Use secure cookies in production
)

# Mount static files
if os.path.exists("static"):
    app.mount("/static", StaticFiles(directory="static"), name="static")

# Mount resources directory for game assets
resources_path = os.path.join(os.path.dirname(__file__), "..", "resources")
if os.path.exists(resources_path):
    app.mount("/resources", StaticFiles(directory=resources_path), name="resources")

# Set up templates
templates_dir = os.path.join(os.path.dirname(__file__), "templates")
templates = Jinja2Templates(directory=templates_dir)

# Custom exception handlers
@app.exception_handler(404)
async def not_found_handler(request: Request, exc: HTTPException):
    """Custom 404 error page"""
    return templates.TemplateResponse(request, "404.html", {}, status_code=404)

@app.exception_handler(401)
async def unauthorized_handler(request: Request, exc: HTTPException):
    """Custom 401 authentication error page"""
    # Check if this is an API request (JSON) vs web request (HTML)
    accept_header = request.headers.get("accept", "")
    if "application/json" in accept_header:
        # Return JSON for API requests
        return JSONResponse(
            status_code=401,
            content={"detail": "Authentication required"}
        )
    else:
        # Redirect to auth error page for web requests
        return RedirectResponse(url="/users/auth-error", status_code=302)

@app.exception_handler(403)
async def forbidden_handler(request: Request, exc: HTTPException):
    """Custom 403 forbidden error page"""
    accept_header = request.headers.get("accept", "")
    if "application/json" in accept_header:
        return JSONResponse(
            status_code=403,
            content={"detail": "Access forbidden"}
        )
    else:
        return RedirectResponse(url="/users/auth-error", status_code=302)

# Include routers
app.include_router(users.router)
app.include_router(auth.router)
app.include_router(game.router)
app.include_router(compendium.router)
app.include_router(invitations.router, prefix="/api/invitations", tags=["invitations"])
app.include_router(demo.router)
app.include_router(game_ws.router)
app.include_router(telemetry.router)
app.include_router(audit.router)

@app.get("/")
async def root():
    """Root endpoint - redirect to login"""
    return RedirectResponse(url="/users/login")

@app.get("/invite/{invite_code}")
async def invitation_page(invite_code: str, request: Request, db: Session = Depends(get_db)):
    """Invitation acceptance page"""

    # Get invitation details
    invitation = db.query(models.SessionInvitation).filter(
        models.SessionInvitation.invite_code == invite_code
    ).first()

    if not invitation:
        return templates.TemplateResponse(
            request,
            "invitation.html",
            {
                "error": "Invitation not found. Please check the link and try again."
            }
        )

    # Get session details
    session = db.query(models.GameSession).filter(
        models.GameSession.id == invitation.session_id
    ).first()

    # Check if user is authenticated
    current_user = None
    try:
        current_user = await get_current_user_optional(request, db)
    except Exception as exc:
        logger.debug("Optional authentication resolution failed in invitation_page", exc_info=exc)

    return templates.TemplateResponse(
        request,
        "invitation.html",
        {
            "invite_code": invite_code,
            "session_name": session.name if session else "Unknown Session",
            "pre_assigned_role": invitation.pre_assigned_role,
            "expires_at": invitation.expires_at,
            "max_uses": invitation.max_uses,
            "uses_count": invitation.uses_count,
            "is_valid": invitation.is_valid(),
            "is_authenticated": current_user is not None
        }
    )

@app.get("/health/live")
async def health_check():
    """Constant-time process liveness check."""
    return JSONResponse(
        content={
            "status": "healthy",
            "service": "ttrpg-server",
            "version": settings.SERVICE_VERSION
        },
        status_code=200
    )


@app.get("/health/ready")
def readiness_check():
    """Verify release-critical database, UI artifact, and R2 dependencies."""
    result = ReadinessChecker(
        settings=settings,
        engine=engine,
        r2_manager=R2AssetManager(),
        static_ui_path=Path(__file__).resolve().parent / "static" / "ui" / "index.html",
    ).run()
    return JSONResponse(content=result, status_code=200 if result["status"] == "ready" else 503)


@app.get("/metrics", include_in_schema=False)
def service_metrics(request: Request, db: Session = Depends(get_db)):
    """Expose Prometheus metrics behind a deployment-managed bearer token."""
    if not settings.METRICS_ENABLED:
        raise HTTPException(status_code=404, detail="Not found")
    supplied = request.headers.get("authorization", "")
    expected = f"Bearer {settings.METRICS_TOKEN}"
    if not settings.METRICS_TOKEN or not secrets.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Authentication required")
    refresh_durable_metrics(db, settings.BACKUP_ROOT)
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)

if __name__ == "__main__":



    # Get port from environment (render.com sets this automatically)
    port = int(os.environ.get("PORT", 12345))

    # Determine host based on environment
    # If PORT is set by cloud provider (Render, Heroku, etc.), bind to 0.0.0.0
    # Otherwise, bind to localhost for local development
    host = "0.0.0.0" if "PORT" in os.environ or os.environ.get("ENVIRONMENT") == "production" else "127.0.0.1"
    logger.info(
        "Starting HTTP server",
        extra={"event_name": "http.server.starting", "host": host, "port": port},
    )

    # Run server
    logger.debug("Running Uvicorn server...")
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        log_level="warning",
        access_log=True
    )
