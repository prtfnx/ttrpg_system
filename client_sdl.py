import sys
import logging
import sdl3
import sdl3.SDL_net
import ctypes

logger = logging.getLogger(__name__)

SERVER_IP = ctypes.c_char_p(b"127.0.0.1")
SERVER_PORT = ctypes.c_uint16(12345)

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
    """Send data to server."""
    status_msg = data.encode('utf-8')
    sent = sdl3.SDL_net.NET_WriteToStreamSocket(socket, status_msg, len(status_msg))
    if sent <= 0:
        logger.warning("Failed to send data to server.")
    logger.debug("Sent status to server: %s", status_msg)

def receive_data(socket):
    """Receive data from server."""
    buffer = ctypes.create_string_buffer(1024)
    received = sdl3.SDL_net.NET_ReadFromStreamSocket(socket, buffer, len(buffer))
    if received > 0:
        game_update = buffer[:received].decode('utf-8')
        # Handle pong reply for ping
        if game_update.strip() == "__pong__":
            logger.debug("Received pong from server.")
            return "__pong__"
        return game_update
    else:
        pass
        #logger.debug("No data received from server.")
    return None

def close_connection(socket):
    """Close the network connection."""
    sdl3.SDL_net.NET_DestroyStreamSocket(socket)
    logger.info("Closed network connection.")

if __name__ == "__main__":
    init_connection()