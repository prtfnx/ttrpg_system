"""
FastAPI-based TTRPG Server for render.com hosting
Provides HTTP/webhook and WebSocket endpoints for client communication
"""
import asyncio
import logging
import os
import sys
import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.exception_handlers import http_exception_handler
from starlette.exceptions import HTTPException as StarletteHTTPException

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.logger import setup_logger
logger = setup_logger(__name__)
from server_host.utils.logger import setup_logger
from server_host.routers import users
from server_host.routers import game
from server_host.routers import compendium
from server_host.api import game_ws
from server_host.database.database import create_tables
from server_host.service.game_session import ConnectionManager
from server_host.utils.rate_limiter import registration_limiter, login_limiter

# Import table manager for WebSocket protocol
from core_table.server import TableManager

# Import token API and R2 manager
from core_table.api.token_api import router as token_router, init_token_api
from storage.r2_manager import R2AssetManager


logger = setup_logger("main.py" ) # set level in logger.py to DEBUG for detailed logs

# Application state
class AppState:
    def __init__(self):
        self.connection_manager = ConnectionManager()
        self.table_manager = TableManager()
        self.r2_manager = R2AssetManager()

app_state = AppState()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage server lifecycle"""
    # Startup
    logger.info("Starting TTRPG Server...")
    
    # Create database tables
    create_tables()
    logger.info("Database tables created/verified")
    
    # Store app state in FastAPI app
    app.state.connection_manager = app_state.connection_manager
    app.state.r2_manager = app_state.r2_manager
    
    # Initialize token API with R2 manager
    init_token_api(app_state.r2_manager)
    logger.info("Token API initialized with R2 manager")
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
    logger.info("Server shutdown complete")

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
        except Exception as e:
            logger.error(f"Rate limiter cleanup error: {e}")

# Create FastAPI app
app = FastAPI(
    title="TTRPG Web Server",
    description="Web-based TTRPG server with WebSocket support",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
cors_origins = os.environ.get("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
if os.path.exists("static"):
    app.mount("/static", StaticFiles(directory="static"), name="static")

# Mount resources directory for game assets
resources_path = os.path.join(os.path.dirname(__file__), "..", "resources")
if os.path.exists(resources_path):
    app.mount("/resources", StaticFiles(directory=resources_path), name="resources")

# Set up templates
templates = Jinja2Templates(directory="templates")

# Custom exception handlers
@app.exception_handler(404)
async def not_found_handler(request: Request, exc: HTTPException):
    """Custom 404 error page"""
    return templates.TemplateResponse("404.html", {"request": request}, status_code=404)

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

app.include_router(token_router)  # Token resolution API
# Include routers
app.include_router(users.router)
app.include_router(game.router)
app.include_router(compendium.router)
app.include_router(game_ws.router)

@app.get("/")
async def root():
    """Root endpoint - redirect to login"""
    return RedirectResponse(url="/users/login")

@app.get("/test-404")
async def test_404():
    """Test route to trigger 404 page"""
    raise HTTPException(status_code=404, detail="Test 404 page")

@app.get("/test-auth-error")
async def test_auth_error():
    """Test route to trigger auth error page"""
    raise HTTPException(status_code=401, detail="Test authentication error")

@app.get("/health")
async def health_check():
    """Health check endpoint for Render.com"""
    return JSONResponse(
        content={
            "status": "healthy",
            "service": "ttrpg-server",
            "version": "1.0.0"
        },
        status_code=200
    )

if __name__ == "__main__":     
   
    
       
    # Get port from environment (render.com sets this automatically)
    port = int(os.environ.get("PORT", 12345))
    
    # Determine host based on environment
    # If PORT is set by cloud provider (Render, Heroku, etc.), bind to 0.0.0.0
    # Otherwise, bind to localhost for local development
    host = "0.0.0.0" if "PORT" in os.environ or os.environ.get("ENVIRONMENT") == "production" else "127.0.0.1"
    logger.info(f"Starting server on {host}:{port}")
    logger.info(f"PORT environment variable: {os.environ.get('PORT', 'Not set')}")
    logger.info(f"ENVIRONMENT: {os.environ.get('ENVIRONMENT', 'test')}")

    # Run server
    logger.debug("Running Uvicorn server...")
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        log_level="warning",
        access_log=True
    )
