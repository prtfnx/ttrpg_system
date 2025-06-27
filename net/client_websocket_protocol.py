import asyncio
from logger import setup_logger
import time
import hashlib
import os
from typing import Callable, Optional, Dict, Any
from .protocol import Message, MessageType, ProtocolHandler
from .client_protocol import ClientProtocol

logger = setup_logger(__name__)

class WebSocketClientProtocol(ClientProtocol):
    pass
    # def __init__(self, context, send_callback: Callable[[str], None], websocket_client=None, session_code: Optional[str] = None):
    #     # super().__init__(context, send_callback)
    #     # self.websocket_client = websocket_client
    #     # self.session_code = session_code
    #     # self.connection_type = "websocket"