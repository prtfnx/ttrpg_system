"""
FastAPI-based TTRPG Server for render.com hosting
Provides HTTP/webhook and WebSocket endpoints for client communication
"""
import asyncio
import os
import re
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from api import game_ws
from config import Settings
from core_table.server import TableManager
from database import models
from database.database import create_tables, engine, get_db
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from routers import auth, compendium, demo, game, invitations, users
from routers.users import get_current_user_optional
from service.game_session import ConnectionManager
from service.readiness import ReadinessChecker
from storage.r2_manager import R2AssetManager
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware
from utils.logger import bind_log_context, configure_logging, reset_log_context, setup_logger
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

    # Create database tables
    create_tables()
    logger.info("Database schema initialized", extra={"event_name": "database.schema.initialized"})

    # Store app state in FastAPI app
    app.state.connection_manager = app_state.connection_manager
    app.state.table_manager = app_state.table_manager

    # Start cleanup task for rate limiters
    cleanup_task = asyncio.create_task(rate_limiter_cleanup_task())

    yield

    # Shutdown
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass
    logger.info("Application stopped", extra={"event_name": "application.stopped"})

async def rate_limiter_cleanup_task():
    """Background task to clean up old rate limiter entries"""
    while True:
        try:
            # Clean up entries older than 1 hour every 30 minutes
            await asyncio.sleep(1800)  # 30 minutes
            registration_limiter.cleanup_old_entries(hours_old=1)
            login_limiter.cleanup_old_entries(hours_old=1)
            logger.debug("Rate limiter cleanup completed")
        except asyncio.CancelledError:
            break
        except Exception:
            logger.exception(
                "Rate limiter cleanup failed",
                extra={"event_name": "rate_limiter.cleanup.failed"},
            )

# Create FastAPI app
app = FastAPI(
    title="TTRPG Web Server",
    description="Web-based TTRPG server with WebSocket support",
    version="1.0.0",
    lifespan=lifespan
)


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
        if not request.url.path.startswith("/health/"):
            route = request.scope.get("route")
            logger.info(
                "HTTP request completed",
                extra={
                    "event_name": "http.request.completed",
                    "http_route": getattr(route, "path", request.url.path),
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


@app.get("/health", include_in_schema=False)
async def legacy_health_alias():
    """Compatibility alias; deployment probes /health/ready."""
    return await health_check()

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
