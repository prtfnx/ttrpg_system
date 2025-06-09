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
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
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

if __name__ == "__main__":    # Configure logging
    logging.basicConfig(
        level=logging.DEBUG,  # Changed to DEBUG to see protocol messages
        format="%(asctime)s %(levelname)s:%(name)s: %(message)s"
    )
    
    # Get port from environment (render.com sets this automatically)
    port = int(os.environ.get("PORT", 8000))
    
    # Run server
    uvicorn.run(
        "main:app",
        host="127.0.0.1",  # Bind to localhost for testing
        port=port,
        log_level="info",
        access_log=True
    )
