#!/usr/bin/env python3
"""
Simple WebSocket server for testing TTRPG WebSocket integration
"""
import asyncio
import websockets
import json
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class TTRPGWebSocketServer:
    def __init__(self):
        self.clients = set()
        
    async def register_client(self, websocket, client_info):
        """Register a new client"""
        self.clients.add(websocket)
        client_id = client_info.get('client_id', 'unknown')
        logger.info(f"Client {client_id} registered. Total clients: {len(self.clients)}")
        
        # Send welcome message
        welcome_msg = {
            "type": "system_message",
            "data": {"message": f"Welcome client {client_id}!"}
        }
        await websocket.send(json.dumps(welcome_msg))
        
    async def unregister_client(self, websocket):
        """Unregister a client"""
        self.clients.discard(websocket)
        logger.info(f"Client disconnected. Total clients: {len(self.clients)}")
        
    async def handle_message(self, websocket, message):
        """Handle incoming message from client"""
        try:
            data = json.loads(message)
            msg_type = data.get('type', 'unknown')
            
            logger.info(f"Received message type: {msg_type}")
            
            if msg_type == 'client_registration':
                await self.register_client(websocket, data.get('data', {}))
                
            elif msg_type == 'ping':
                # Respond to ping
                pong_msg = {"type": "pong", "data": {}}
                await websocket.send(json.dumps(pong_msg))
                
            elif msg_type == 'table_request':
                # Send a test table
                table_msg = {
                    "type": "table_data",
                    "data": {
                        "name": "Test Table",
                        "width": 1920,
                        "height": 1080,
                        "sprites": []
                    }
                }
                await websocket.send(json.dumps(table_msg))
                
            elif msg_type == 'sprite_update':
                # Echo sprite updates to all other clients
                for client in self.clients:
                    if client != websocket:
                        try:
                            await client.send(message)
                        except websockets.exceptions.ConnectionClosed:
                            pass
                            
            else:
                logger.info(f"Unknown message type: {msg_type}")
                
        except json.JSONDecodeError:
            logger.error(f"Invalid JSON received: {message}")
        except Exception as e:
            logger.error(f"Error handling message: {e}")
    
    async def handle_client(self, websocket, path):
        """Handle a client connection"""
        logger.info(f"New WebSocket connection from {websocket.remote_address}")
        
        try:
            async for message in websocket:
                await self.handle_message(websocket, message)
        except websockets.exceptions.ConnectionClosed:
            logger.info("Client connection closed")
        except Exception as e:
            logger.error(f"Error in client handler: {e}")
        finally:
            await self.unregister_client(websocket)

async def main():
    """Start the WebSocket server"""
    server = TTRPGWebSocketServer()
    
    logger.info("Starting TTRPG WebSocket server on ws://localhost:8000/ws")
    
    async with websockets.serve(server.handle_client, "localhost", 8000):
        logger.info("WebSocket server is running...")
        await asyncio.Future()  # Run forever

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Server shutdown requested")
    except Exception as e:
        logger.error(f"Server error: {e}")
