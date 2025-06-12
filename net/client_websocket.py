import asyncio
import hashlib
import os
from websockets.exceptions import ConnectionClosed
from websockets.asyncio.client import connect
from dataclasses import dataclass, field
from typing import Any 
from queue import PriorityQueue, Empty
from .protocol import Message, PrioritizedItem
import logging
logger = logging.getLogger(__name__)


class QueueBridge:
    def __init__(self, sync_queue: PriorityQueue, revert_bridge: bool = False):
        self.sync_queue = sync_queue
        self.async_queue = asyncio.PriorityQueue()
        self._bridge_task = None
        self.revert_bridge = revert_bridge

    async def start_bridge(self):
        """Start the bridge in a separate thread"""
        if self.revert_bridge:
            logger.info(f"Starting revert bridge worker")
            self._bridge_task = asyncio.create_task(self._revert_bridge_worker())
        else:
            logger.info(f"Starting bridge worker")
            self._bridge_task = asyncio.create_task(self._bridge_worker())

    async def _bridge_worker(self):
        """Worker that moves items from sync to async queue"""
        def get_from_sync_queue(): 
            try:
                return self.sync_queue.get(timeout=0.1)
            except Empty:
                return None

        while True:
            try:
                # Run sync queue get in thread
                item = await asyncio.to_thread(get_from_sync_queue)
                if item is not None:
                    await self.async_queue.put(item)
                else:
                    await asyncio.sleep(0.01)
            except asyncio.CancelledError:
                break
    
    async def _revert_bridge_worker(self):
        """Worker that moves items from async to sync queue"""
        while True:
            
            try:
               
                item = await self.async_queue.get()
                self.sync_queue.put(item)
                
            except asyncio.CancelledError:
                break

    async def get(self):
        """Async get from the bridge"""
        return await self.async_queue.get()

    async def put(self, item):
        """Async put from the bridge"""
        return await self.async_queue.put(item)
    
    
class WebSocketClient:
    def __init__(self, uri: str, queue_to_send: PriorityQueue, queue_to_read: PriorityQueue, jwt_token: str, session_code: str):
        self.uri = uri
        self.websocket = None
        self.server_bridge = QueueBridge(queue_to_send)
        self.client_bridge = QueueBridge(queue_to_read, revert_bridge=True)        
        # For authentication and session management
        self.jwt_token = jwt_token
        self.session_code = session_code
        
        # Store base WebSocket URL without specific endpoint
        if self.uri.startswith('http://'):
            self.base_websocket_url = self.uri.replace('http://', 'ws://')
        elif self.uri.startswith('https://'):
            self.base_websocket_url = self.uri.replace('https://', 'wss://')
        elif self.uri.startswith('ws://') or self.uri.startswith('wss://'):
            self.base_websocket_url = self.uri
        else:
            # Plain hostname:port, assume WebSocket
            self.base_websocket_url = f"ws://{self.uri}"
        self.url_with_token = self.base_websocket_url+f"?token={self.jwt_token}"
    
    async def connect(self):
        # Make bridges
        await self.server_bridge.start_bridge()
        await self.client_bridge.start_bridge()
        print(f"Connecting to WebSocket at {self.base_websocket_url} with session code {self.session_code} and token {self.jwt_token}")
        headers = {"Authorization": f"Bearer {self.jwt_token}", "session_code": self.session_code}
        async for websocket in connect(self.base_websocket_url, additional_headers=headers):
            try:
                self.websocket = websocket
                await self.handler(websocket)
            except ConnectionClosed:
                continue
    def start_from_sync_func(self):
        """Start the WebSocket client from sync func with its own event loop."""
        
        # Create new event loop for this thread
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            # Run the async client
            loop.run_until_complete(self.connect())
        finally:
            loop.close()

    async def handler(self, websocket):
        consumer_task = asyncio.create_task(self.consumer_handler(websocket))
        producer_task = asyncio.create_task(self.producer_handler(websocket))
        done, pending = await asyncio.wait(
            [consumer_task, producer_task],
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
            task.cancel()

    async def consumer_handler(self, websocket):
        async for message in websocket:
            logger.info(f"Received message: {message}")
            #TODO: remove wrapper, make prioritized item 
            # if isinstance(message, Message):               
            #     pass
            # elif isinstance(message, str):
            #     message = Message(message)
                
            # else:
            #     logger.warning(f"Received unknown message type: {type(message)}")
            #     continue
            #priority_message = PrioritizedItem(priority=message.priority, item=message)
            await self.client_bridge.put(message)

    async def producer_handler(self, websocket):
        while True:
            try:
                message = await self.server_bridge.get()
                await websocket.send(message)
            except ConnectionClosed:
                break
    
    def build_websocket_url(self, session_code: str) -> str:
        """Build WebSocket URL for game session with authentication"""
        url = f"{self.base_websocket_url}/ws/game/{session_code}"
        if self.jwt_token:
            url += f"?token={self.jwt_token}"
        return url