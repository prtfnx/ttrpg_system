import sys
import logging
import sdl3
import sdl3.SDL_net
import ctypes
import json

logger = logging.getLogger(__name__)

SERVER_IP = ctypes.c_char_p(b"127.0.0.1")
SERVER_PORT = ctypes.c_uint16(12345)

class MessageBuffer:
    """Handle incomplete JSON messages from network"""
    def __init__(self):
        self.buffer = ""
        
    def add_data(self, data: str) -> list:
        """Add data to buffer and return complete messages"""
        self.buffer += data
        messages = []
        
        # Look for complete JSON messages (ending with newline or complete braces)
        while self.buffer:
            # Try to find a complete JSON object
            brace_count = 0
            in_string = False
            escape_next = False
            end_pos = -1
            
            for i, char in enumerate(self.buffer):
                if escape_next:
                    escape_next = False
                    continue
                    
                if char == '\\':
                    escape_next = True
                    continue
                    
                if char == '"' and not escape_next:
                    in_string = not in_string
                    continue
                    
                if not in_string:
                    if char == '{':
                        brace_count += 1
                    elif char == '}':
                        brace_count -= 1
                        if brace_count == 0:
                            end_pos = i + 1
                            break
                    elif char == '\n' and brace_count == 0:
                        # Handle simple messages that end with newline
                        end_pos = i
                        break
            
            if end_pos > 0:
                # Extract complete message
                message = self.buffer[:end_pos].strip()
                self.buffer = self.buffer[end_pos:].lstrip('\n')
                
                if message:
                    messages.append(message)
            else:
                # No complete message found
                break
                
        return messages

def init_connection(server_ip=SERVER_IP, server_port=SERVER_PORT):
    """Initialize net connection."""
    if not sdl3.SDL_Init(sdl3.SDL_INIT_VIDEO):
        logger.critical("SDL3 init failed: %s", sdl3.get_error())
        return

    if sdl3.SDL_net.NET_Init() < 0:
        logger.critical("SDL3_net init failed: %s", sdl3.SDL_GetError())
        return

    # Resolve server address
    ip = sdl3.SDL_net.NET_ResolveHostname(server_ip)
    if not ip:
        logger.error("Failed to resolve server address: %s", sdl3.SDL_GetError())
        return

    if sdl3.NET_WaitUntilResolved(ip, -1):
        client = sdl3.SDL_net.NET_CreateClient(ip, server_port)
    else:
        logger.error("Failed to resolve server address: %s", sdl3.SDL_GetError())
        return

    if not client:
        logger.error("Failed to connect to server: %s", sdl3.SDL_GetError())
        return

    logger.info("Connected to server at %s %s", server_ip.value.decode(), server_port.value)
    return client

def send_data(socket, data):
    """Send data to server with proper framing."""
    # Add newline delimiter for message framing
    message = data.encode('utf-8') + b'\n'
    sent = sdl3.SDL_net.NET_WriteToStreamSocket(socket, message, len(message))
    if sent <= 0:
        logger.warning("Failed to send data to server.")
    logger.debug("Sent status to server: %s", message)

def receive_data(socket, message_buffer=None):
    """Receive data from server with proper message handling."""
    if message_buffer is None:
        message_buffer = MessageBuffer()
        
    # Use larger buffer for big messages
    buffer = ctypes.create_string_buffer(8192)  # Increased from 1024
    received = sdl3.SDL_net.NET_ReadFromStreamSocket(socket, buffer, len(buffer))
    
    if received > 0:
        try:
            data = buffer[:received].decode('utf-8')
            
            # Handle simple ping/pong without buffering
            if data.strip() == "__pong__":
                logger.debug("Received pong from server.")
                return "__pong__"
            
            # Add to message buffer and get complete messages
            messages = message_buffer.add_data(data)
            
            # Return the first complete message, store others for next call
            if messages:
                return messages[0]  # Return first complete message
                
        except UnicodeDecodeError as e:
            logger.error(f"Failed to decode received data: {e}")
            return None
    
    return None

def close_connection(socket):
    """Close the network connection."""
    sdl3.SDL_net.NET_DestroyStreamSocket(socket)
    logger.info("Closed network connection.")

if __name__ == "__main__":
    init_connection()