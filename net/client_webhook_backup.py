import asyncio
import logging
import threading
import time
import json
import requests
import uvicorn
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from typing import Optional, Callable, Dict, Any
import hashlib
import os
from contextlib import asynccontextmanager
import queue  # Use regular queue instead of asyncio.Queue for thread safety

logger = logging.getLogger(__name__)

class WebhookMessageBuffer:
    """Handle webhook message queuing and delivery using thread-safe queues"""
    def __init__(self):
        self.incoming_queue = queue.Queue()  # Thread-safe queue
        self.outgoing_queue = queue.Queue()  # Thread-safe queue
        
    def add_incoming(self, message: str):
        """Add incoming webhook message to queue"""
        self.incoming_queue.put(message)
        
    def get_incoming(self) -> Optional[str]:
        """Get next incoming message, non-blocking"""
        try:
            return self.incoming_queue.get_nowait()
        except queue.Empty:
            return None
            
    def add_outgoing(self, message: str):
        """Add outgoing message to queue"""
        self.outgoing_queue.put(message)
        
    def get_outgoing(self) -> Optional[str]:
        """Get next outgoing message, non-blocking"""
        try:
            return self.outgoing_queue.get_nowait()
        except queue.Empty:
            return None

class WebhookClient:
    """Webhook-based client for render.com hosted server"""
    
    def __init__(self, server_url: str = "https://your-app.onrender.com", 
                 webhook_port: int = 8080, webhook_host: str = "localhost"):
        self.server_url = server_url.rstrip('/')
        self.webhook_port = webhook_port
        self.webhook_host = webhook_host
        self.client_id = hashlib.md5(f"{time.time()}_{os.getpid()}".encode()).hexdigest()[:8]
          self.message_buffer = WebhookMessageBuffer()
        self.app = FastAPI(title="TTRPG Webhook Client")
        self.server_task = None
        self.sender_task = None
        self.is_connected = False
        self.last_ping = time.time()
        
        # Register webhook endpoints
        self.setup_routes()
        
    def setup_routes(self):
        """Setup FastAPI webhook routes"""
        
        @self.app.post("/webhook/message")
        async def receive_webhook(request: Request):
            """Receive messages from server via webhook"""
            try:
                data = await request.json()
                message = data.get('message', '')
                
                if message:
                    self.message_buffer.add_incoming(message)  # No await needed - thread-safe
                    logger.debug(f"Received webhook message: {message[:100]}...")
                    
                return JSONResponse({"status": "success", "client_id": self.client_id})
                
            except Exception as e:
                logger.error(f"Webhook receive error: {e}")
                raise HTTPException(status_code=400, detail=str(e))
        
        @self.app.get("/webhook/health")
        async def health_check():
            """Health check endpoint"""
            return JSONResponse({
                "status": "healthy", 
                "client_id": self.client_id,
                "connected": self.is_connected
            })
        
        @self.app.post("/webhook/ping")
        async def ping_response():
            """Respond to server ping"""
            self.last_ping = time.time()
            return JSONResponse({"status": "pong", "client_id": self.client_id})

    async def start_webhook_server(self):
        """Start the webhook server in background"""
        config = uvicorn.Config(
            self.app, 
            host=self.webhook_host, 
            port=self.webhook_port,
            log_level="warning"  # Reduce uvicorn logging
        )
        server = uvicorn.Server(config)
        
        logger.info(f"Starting webhook server on {self.webhook_host}:{self.webhook_port}")
        await server.serve()

    def start_server_thread(self):
        """Start webhook server in a separate thread"""
        def run_server():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(self.start_webhook_server())
            except Exception as e:
                logger.error(f"Webhook server error: {e}")
            finally:
                loop.close()
        
        self.server_task = threading.Thread(target=run_server, daemon=True)
        self.server_task.start()
        
        # Give server time to start
        time.sleep(2)

    async def register_with_server(self) -> bool:
        """Register this client with the server"""
        try:
            webhook_url = f"http://{self.webhook_host}:{self.webhook_port}/webhook/message"
            
            response = requests.post(
                f"{self.server_url}/api/client/register",
                json={
                    "client_id": self.client_id,
                    "webhook_url": webhook_url,
                    "client_type": "ttrpg_client"
                },
                timeout=10
            )
            
            if response.status_code == 200:
                self.is_connected = True
                logger.info(f"Successfully registered with server. Client ID: {self.client_id}")
                return True
            else:
                logger.error(f"Registration failed: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"Registration error: {e}")
            return False

    def send_data(self, data: str):
        """Send data to server via HTTP POST"""
        try:
            response = requests.post(
                f"{self.server_url}/api/message",
                json={
                    "client_id": self.client_id,
                    "message": data
                },
                timeout=5
            )
            
            if response.status_code == 200:
                            logger.debug(f"Sent message to server: {data[:100]}...")
            else:
                logger.warning(f"Failed to send message: {response.status_code}")
                
        except Exception as e:
            logger.error(f"Send error: {e}")

    def receive_data(self) -> Optional[str]:
        """Receive data from webhook queue"""
        return self.message_buffer.get_incoming()

    def ping_server(self):
        """Send ping to server"""
        try:
            response = requests.post(
                f"{self.server_url}/api/ping",
                json={"client_id": self.client_id},
                timeout=5
            )
            
            if response.status_code == 200:
                logger.debug("Ping sent successfully")
            else:
                logger.warning(f"Ping failed: {response.status_code}")
                
        except Exception as e:
            logger.error(f"Ping error: {e}")

    def close_connection(self):
        """Close webhook connection"""
        try:
            # Unregister from server
            requests.post(
                f"{self.server_url}/api/client/unregister",
                json={"client_id": self.client_id},
                timeout=5
            )
            
            self.is_connected = False
            logger.info("Webhook client disconnected")
            
        except Exception as e:
            logger.error(f"Disconnect error: {e}")


def init_connection(server_url: str = "https://your-app.onrender.com", 
                   webhook_port: int = 8080) -> Optional[WebhookClient]:
    """Initialize webhook connection"""
    try:
        client = WebhookClient(server_url, webhook_port)
        
        # Start webhook server
        client.start_server_thread()
        
        # Register with server - handle both sync and async contexts
        try:
            # Check if we're already in an event loop
            current_loop = asyncio.get_running_loop()
            # If we are, schedule the registration as a task
            logger.info("Running in async context - scheduling registration")
            # For now, just return the client and let caller handle registration
            logger.info("Webhook connection initialized (registration will be handled separately)")
            return client
        except RuntimeError:
            # No running loop, we can create our own
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            try:
                success = loop.run_until_complete(client.register_with_server())
                if success:
                    logger.info("Webhook connection established")
                    return client
                else:
                    logger.error("Failed to establish webhook connection")
                    return None
            finally:
                loop.close()
            
    except Exception as e:
        logger.error(f"Webhook init error: {e}")
        return None

def send_data(client: WebhookClient, data: str):
    """Send data via webhook client"""
    if client:
        client.send_data(data)

async def receive_data_async(client: WebhookClient) -> Optional[str]:
    """Receive data via webhook client (async)"""
    if client:
        return client.receive_data()  # Now this is sync, so no await needed
    return None

def receive_data(client: WebhookClient) -> Optional[str]:
    """Receive data via webhook client (sync wrapper)"""
    if not client:
        return None
    
    # Since the method is now sync, we can call it directly
    return client.receive_data()

def close_connection(client: WebhookClient):
    """Close webhook connection"""
    if client:
        client.close_connection()

async def register_client_async(client: WebhookClient) -> bool:
    """Register client with server (async version)"""
    if client:
        return await client.register_with_server()
    return False

if __name__ == "__main__":
    # Test webhook client
    import sys
    
    server_url = sys.argv[1] if len(sys.argv) > 1 else "https://your-app.onrender.com"
    
    client = init_connection(server_url)
    if client:
        print("Webhook client started. Testing connection...")
        
        # Test sending a message
        send_data(client, '{"type": "ping", "data": {}}')
        
        # Test receiving messages
        for i in range(5):
            message = receive_data(client)
            if message:
                print(f"Received: {message}")
            time.sleep(1)
        
        close_connection(client)
    else:
        print("Failed to start webhook client")
