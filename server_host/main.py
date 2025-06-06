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
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, List, Optional
import json


# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server_host.webhook_server import WebhookGameServer
from server_host.websocket_server import WebSocketGameServer
#from core_table.server import TableManager
import core_table.game as game_module
logger = logging.getLogger(__name__)

# Global server instances
webhook_server: Optional[WebhookGameServer] = None
websocket_server: Optional[WebSocketGameServer] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage server lifecycle"""
    global webhook_server, websocket_server
    
    # Startup
    logger.info("Starting TTRPG Hybrid Server...")
    
    game = game_module.create_test_game()
    # Initialize both webhook and websocket servers
    webhook_server = WebhookGameServer(game)
    websocket_server = WebSocketGameServer(game)

    await webhook_server.initialize()
    await websocket_server.initialize()
    
    logger.info("Hybrid server initialized successfully")
    
    yield
    
    # Shutdown
    if webhook_server:
        await webhook_server.cleanup()
    if websocket_server:
        await websocket_server.cleanup()
    logger.info("Server shutdown complete")

# Create FastAPI app
app = FastAPI(
    title="TTRPG Hybrid Server",
    description="HTTP/Webhook and WebSocket-based TTRPG server for render.com hosting",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware for cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    """Root endpoint - server status"""
    webhook_clients = len(webhook_server.clients) if webhook_server else 0
    websocket_clients = len(websocket_server.clients) if websocket_server else 0
    total_tables = len(webhook_server.table_manager.tables) if webhook_server else 0
    
    return {
        "status": "running",
        "server": "TTRPG Hybrid Server",
        "version": "1.0.0",
        "webhook_clients_connected": webhook_clients,
        "websocket_clients_connected": websocket_clients,
        "total_clients_connected": webhook_clients + websocket_clients,
        "tables_available": total_tables
    }

@app.get("/status")
async def server_status():
    """Server status endpoint"""
    webhook_clients = len(webhook_server.clients) if webhook_server else 0
    websocket_clients = len(websocket_server.clients) if websocket_server else 0
    total_tables = len(webhook_server.table_manager.tables) if webhook_server else 0
    
    return {
        "status": "running",
        "server": "TTRPG Hybrid Server",
        "version": "1.0.0",
        "webhook_clients_connected": webhook_clients,
        "websocket_clients_connected": websocket_clients,
        "total_clients_connected": webhook_clients + websocket_clients,
        "tables_available": total_tables
    }

@app.get("/health")
async def health_check():
    """Health check endpoint for render.com"""
    return {
        "status": "healthy",
        "webhook_server_running": webhook_server is not None,
        "websocket_server_running": websocket_server is not None,
        "timestamp": asyncio.get_event_loop().time()
    }

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time client connections"""
    await websocket.accept()
    
    if not websocket_server:
        await websocket.close(code=1011, reason="WebSocket server not initialized")
        return
    
    # Handle the WebSocket connection
    await websocket_server.handle_websocket_connection(websocket, "/ws")

@app.post("/api/client/register")
async def register_client(request: Request):
    """Register a new webhook client"""
    try:
        data = await request.json()
        client_id = data.get("client_id")
        webhook_url = data.get("webhook_url")
        client_type = data.get("client_type", "unknown")
        
        if not client_id or not webhook_url:
            raise HTTPException(status_code=400, detail="client_id and webhook_url required")
        
        if not webhook_server:
            raise HTTPException(status_code=503, detail="Webhook server not initialized")
        
        success = await webhook_server.register_client(client_id, webhook_url, client_type)
        
        if success:
            return {
                "status": "registered",
                "client_id": client_id,
                "message": "Client registered successfully"
            }
        else:
            raise HTTPException(status_code=400, detail="Registration failed")
            
    except Exception as e:
        logger.error(f"Client registration error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/client/unregister")
async def unregister_client(request: Request):
    """Unregister a webhook client"""
    try:
        data = await request.json()
        client_id = data.get("client_id")
        
        if not client_id:
            raise HTTPException(status_code=400, detail="client_id required")
        
        if not webhook_server:
            raise HTTPException(status_code=503, detail="Webhook server not initialized")
        
        await webhook_server.unregister_client(client_id)
        
        return {
            "status": "unregistered",
            "client_id": client_id,
            "message": "Client unregistered successfully"
        }
        
    except Exception as e:
        logger.error(f"Client unregistration error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/message")
async def receive_message(request: Request):
    """Receive message from client"""
    try:
        data = await request.json()
        client_id = data.get("client_id")
        message = data.get("message")
        
        if not client_id or not message:
            raise HTTPException(status_code=400, detail="client_id and message required")
        
        if not webhook_server:
            raise HTTPException(status_code=503, detail="Webhook server not initialized")
        
        # Process the message through the webhook server
        await webhook_server.handle_client_message(client_id, message)
        
        return {
            "status": "received",
            "client_id": client_id,
            "message": "Message processed successfully"
        }
        
    except Exception as e:
        logger.error(f"Message processing error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ping")
async def handle_ping(request: Request):
    """Handle ping from client"""
    try:
        data = await request.json()
        client_id = data.get("client_id")
        
        if not client_id:
            raise HTTPException(status_code=400, detail="client_id required")
        
        if not webhook_server:
            raise HTTPException(status_code=503, detail="Webhook server not initialized")
        
        # Update client's last ping time
        await webhook_server.handle_client_ping(client_id)
        
        return {
            "status": "pong",
            "client_id": client_id,
            "message": "Ping received"
        }
        
    except Exception as e:
        logger.error(f"Ping handling error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/clients")
async def list_clients():
    """List connected clients"""
    try:
        if not webhook_server:
            raise HTTPException(status_code=503, detail="Webhook server not initialized")
        
        clients = await webhook_server.get_client_list()
        return {
            "status": "success",
            "clients": clients,
            "total": len(clients)
        }
        
    except Exception as e:
        logger.error(f"Client listing error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/tables")
async def list_tables():
    """List available tables"""
    try:
        if not webhook_server:
            raise HTTPException(status_code=503, detail="Webhook server not initialized")
        
        tables = await webhook_server.get_table_list()
        return {
            "status": "success",
            "tables": tables,
            "total": len(tables)
        }
        
    except Exception as e:
        logger.error(f"Table listing error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/table/{table_name}")
async def get_table_data(table_name: str):
    """Get specific table data"""
    try:
        if not webhook_server:
            raise HTTPException(status_code=503, detail="Webhook server not initialized")
        
        table_data = await webhook_server.get_table_data(table_name)
        return {
            "status": "success",
            "table": table_data
        }
        
    except Exception as e:
        logger.error(f"Table data error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/table/create")
async def create_table(request: Request):
    """Create a new table"""
    try:
        data = await request.json()
        name = data.get("name")
        width = data.get("width", 100)
        height = data.get("height", 100)
        
        if not name:
            raise HTTPException(status_code=400, detail="table name required")
        
        if not webhook_server:
            raise HTTPException(status_code=503, detail="Webhook server not initialized")
        
        table = await webhook_server.create_table(name, width, height)
        
        return {
            "status": "created",
            "table": {
                "name": table.name,
                "width": table.width,
                "height": table.height
            }
        }
        
    except Exception as e:
        logger.error(f"Table creation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s:%(name)s: %(message)s"
    )
    
    # Get port from environment (render.com sets this automatically)
    port = int(os.environ.get("PORT", 8000))
    
    # Run server
    uvicorn.run(
        "main:app",
        #host="0.0.0.0",  # Bind to all interfaces for render.com
        host="127.0.0.1",  # Bind to localhost for testing
        port=port,
        log_level="info",
        access_log=True
    )
