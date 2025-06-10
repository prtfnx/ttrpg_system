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
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server_host.routers import users
from server_host.routers import game
from server_host.api import game_ws
from server_host.database.database import create_tables
from server_host.service.game_session import ConnectionManager

# Import table manager for WebSocket protocol
from core_table.server import TableManager

logger = logging.getLogger(__name__)

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
    logger.info("Starting TTRPG Server...")
    
    # Create database tables
    create_tables()
    logger.info("Database tables created/verified")
      # Store app state in FastAPI app
    app.state.connection_manager = app_state.connection_manager
    app.state.table_manager = app_state.table_manager
    
    yield
    
    # Shutdown
    logger.info("Server shutdown complete")

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

# Include routers
app.include_router(users.router)
app.include_router(game.router)
app.include_router(game_ws.router)

@app.get("/")
async def root():
    """Root endpoint - redirect to login"""
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/users/login")

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
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,  # Changed to DEBUG to see protocol messages
        format="%(asctime)s %(levelname)s:%(name)s: %(message)s"
    )    # Get port from environment (render.com sets this automatically)
    port = int(os.environ.get("PORT", 8000))
    
    # Determine host based on environment
    # If PORT is set by cloud provider (Render, Heroku, etc.), bind to 0.0.0.0
    # Otherwise, bind to localhost for local development
    host = "0.0.0.0" if "PORT" in os.environ else "127.0.0.1"
    
    logger.info(f"Starting server on {host}:{port}")
    logger.info(f"PORT environment variable: {os.environ.get('PORT', 'Not set')}")
    
    # Run server
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        log_level="info",
        access_log=True
    )
