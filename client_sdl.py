import sys
import sdl3
import sdl3.SDL_net
import ctypes
SERVER_IP = ctypes.c_char_p(b"127.0.0.1")
SERVER_PORT = ctypes.c_uint16(12345)

        
def init_connection(server_ip=SERVER_IP, server_port=SERVER_PORT):
    # Initialize net connection
    if not sdl3.SDL_Init(sdl3.SDL_INIT_VIDEO):
        print("SDL3 init failed:", sdl3.get_error())
        return

    if sdl3.SDL_net.NET_Init() < 0:
        print("SDL3_net init failed:", sdl3.SDL_GetError())
        return

    # Resolve server address
    ip = sdl3.SDL_net.NET_ResolveHostname(server_ip)
    if not ip:
        print("Failed to resolve server address:", sdl3.SDL_GetError())
        return

    # Open TCP connection to server
    
    if sdl3.NET_WaitUntilResolved(ip, -1):
        client = sdl3.SDL_net.NET_CreateClient(ip, server_port)
    else:
        print("Failed to resolve server address:", sdl3.SDL_GetError())
        return

    if sdl3.NET_WaitUntilResolved(ip, -1):
        client = sdl3.SDL_net.NET_CreateClient(ip, server_port)
    else:
        print("Failed to create client:", sdl3.SDL_GetError())
        return

    if not client:
        print("Failed to connect to server:", sdl3.SDL_GetError())
        return

    print("Connected to server at", server_ip, server_port)
    return client

def send_data(socket,data):
   # Send game status to server
    status_msg = data.encode('utf-8')
    sent = sdl3.SDL_net.NET_WriteToStreamSocket(socket, status_msg, len(status_msg))
    if sent <= 0:
        pass
        #print("Failed to send status to server.")
       
    print("Sent status to server:", status_msg)

    

def receive_data(socket):
    # Receive game change info from server
    received = None
    game_update = None
    buffer = ctypes.create_string_buffer(1024)
    #print("Waiting for game update from server...")
    received = sdl3.SDL_net.NET_ReadFromStreamSocket(socket, buffer, len(buffer))
    if received > 0:
        game_update = buffer[:received].decode('utf-8')
        #print("Received game update from server:", game_update)
    else:
        pass
        #print("No data received from server.")
    return game_update

def close_connection(socket):
    sdl3.SDL_net.NET_DestroyStreamSocket(socket)
    sdl3.SDL_net.NET_Quit()
    sdl3.SDL_Quit()

if __name__ == "__main__":
    init_connection()