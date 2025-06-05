#!/usr/bin/env python3
"""
Mock webhook server to simulate the server-side webhook endpoints
This simulates what would be running on render.com
"""

import asyncio
import uvicorn
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from typing import Dict, Any
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Mock TTRPG Webhook Server")

# Store connected clients
connected_clients: Dict[str, Dict[str, Any]] = {}

@app.get("/")
async def root():
    """Root endpoint"""
    return {"message": "Mock TTRPG Webhook Server", "status": "running"}

@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "healthy", "clients": len(connected_clients)}

@app.post("/api/client/register")
async def register_client_api(request: Request):
    """Register a webhook client (API endpoint that the client expects)"""
    try:
        data = await request.json()
        client_id = data.get("client_id")
        webhook_url = data.get("webhook_url")
        client_type = data.get("client_type", "unknown")
        
        if not client_id or not webhook_url:
            raise HTTPException(status_code=400, detail="Missing client_id or webhook_url")
        
        # Store client info
        connected_clients[client_id] = {
            "webhook_url": webhook_url,
            "client_type": client_type,
            "registered_at": asyncio.get_event_loop().time()
        }
        
        logger.info(f"Client registered via API: {client_id} -> {webhook_url} (type: {client_type})")
        
        return {
            "status": "registered",
            "client_id": client_id,
            "message": "Client registered successfully"
        }
        
    except Exception as e:
        logger.error(f"Registration error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/webhook/register")
async def register_client(request: Request):
    """Register a webhook client (legacy endpoint)"""
    try:
        data = await request.json()
        client_id = data.get("client_id")
        webhook_url = data.get("webhook_url")
        
        if not client_id or not webhook_url:
            raise HTTPException(status_code=400, detail="Missing client_id or webhook_url")
        
        # Store client info
        connected_clients[client_id] = {
            "webhook_url": webhook_url,
            "registered_at": asyncio.get_event_loop().time()
        }
        
        logger.info(f"Client registered: {client_id} -> {webhook_url}")
        
        return {
            "status": "registered",
            "client_id": client_id,
            "message": "Client registered successfully"
        }
        
    except Exception as e:
        logger.error(f"Registration error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/webhook/unregister")
async def unregister_client(request: Request):
    """Unregister a webhook client"""
    try:
        data = await request.json()
        client_id = data.get("client_id")
        
        if not client_id:
            raise HTTPException(status_code=400, detail="Missing client_id")
        
        if client_id in connected_clients:
            del connected_clients[client_id]
            logger.info(f"Client unregistered: {client_id}")
            return {"status": "unregistered", "client_id": client_id}
        else:
            raise HTTPException(status_code=404, detail="Client not found")
            
    except Exception as e:
        logger.error(f"Unregistration error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/webhook/message")
async def receive_message(request: Request):
    """Receive messages from clients"""
    try:
        data = await request.json()
        client_id = data.get("client_id")
        message = data.get("message")
        
        if not client_id or not message:
            raise HTTPException(status_code=400, detail="Missing client_id or message")
        
        logger.info(f"Message from {client_id}: {message}")
        
        # Echo the message back to all other clients (simple broadcast)
        response_count = 0
        for other_client_id, client_info in connected_clients.items():
            if other_client_id != client_id:
                # In a real implementation, you would send webhook requests to other clients
                # For now, just log what would be sent
                logger.info(f"Would send to {other_client_id}: {message}")
                response_count += 1
        
        return {
            "status": "received",
            "message_id": f"msg_{asyncio.get_event_loop().time()}",
            "broadcasted_to": response_count
        }
        
    except Exception as e:
        logger.error(f"Message handling error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/webhook/clients")
async def list_clients():
    """List connected clients"""
    return {
        "clients": list(connected_clients.keys()),
        "count": len(connected_clients)
    }

@app.post("/webhook/ping")
async def ping_client(request: Request):
    """Ping a specific client"""
    try:
        data = await request.json()
        client_id = data.get("client_id")
        
        if not client_id:
            raise HTTPException(status_code=400, detail="Missing client_id")
        
        if client_id not in connected_clients:
            raise HTTPException(status_code=404, detail="Client not found")
        
        # In a real implementation, you would send a ping webhook to the client
        logger.info(f"Ping sent to {client_id}")
        
        return {
            "status": "ping_sent",
            "client_id": client_id,
            "timestamp": asyncio.get_event_loop().time()
        }
        
    except Exception as e:
        logger.error(f"Ping error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def run_server(host: str = "localhost", port: int = 8000):
    """Run the mock server"""
    logger.info(f"Starting mock webhook server on {host}:{port}")
    uvicorn.run(app, host=host, port=port, log_level="info")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Mock TTRPG Webhook Server")
    parser.add_argument("--host", default="localhost", help="Host to bind to")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind to")
    
    args = parser.parse_args()
    run_server(args.host, args.port)
