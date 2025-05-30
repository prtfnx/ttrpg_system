import sys
import logging
import sdl3
import ctypes
import colorsys
import event_sys
import context
import sprite
import core_table.Character
import core_table.entities
import movement_sys
import threading
import client_sdl
import time
import json
import paint  
import gui.gui_imgui as gui_imgui  
import asyncio
from protocol import ProtocolHandler, Message, MessageType
from imgui_bundle import imgui
import OpenGL.GL as gl
import example
import argparse

# Import compendium integration
from compendium_manager import get_compendium_manager, load_compendiums
import compendium_sprites

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)s:%(name)s: %(message)s"
)
logger = logging.getLogger(__name__)


BASE_WIDTH: int = 1920
BASE_HEIGHT: int = 1080
NET_SLEEP: float = 0.1
CHECK_INTERVAL: float = 20.0

def SDL_AppInit_func():
    """Initialize SDL window, renderer, and network client."""
    
    # Set OpenGL attributes BEFORE creating window
    
    sdl3.SDL_GL_SetAttribute(sdl3.SDL_GLAttr(sdl3.SDL_GL_DOUBLEBUFFER), ctypes.c_int(1))
    sdl3.SDL_GL_SetAttribute(sdl3.SDL_GLAttr(sdl3.SDL_GL_DEPTH_SIZE), ctypes.c_int(24))
    sdl3.SDL_GL_SetAttribute(sdl3.SDL_GLAttr(sdl3.SDL_GL_STENCIL_SIZE), ctypes.c_int(8))
    sdl3.SDL_GL_SetAttribute(sdl3.SDL_GLAttr(sdl3.SDL_GL_ACCELERATED_VISUAL), ctypes.c_int(1))
    sdl3.SDL_GL_SetAttribute(sdl3.SDL_GLAttr(sdl3.SDL_GL_MULTISAMPLEBUFFERS), ctypes.c_int(1))
    sdl3.SDL_GL_SetAttribute(sdl3.SDL_GLAttr(sdl3.SDL_GL_MULTISAMPLESAMPLES), ctypes.c_int(8))
    sdl3.SDL_GL_SetAttribute(sdl3.SDL_GLAttr(sdl3.SDL_GL_CONTEXT_FLAGS), ctypes.c_int(sdl3.SDL_GL_CONTEXT_FORWARD_COMPATIBLE_FLAG))
    sdl3.SDL_GL_SetAttribute(sdl3.SDL_GLAttr(sdl3.SDL_GL_CONTEXT_MAJOR_VERSION), ctypes.c_int(4))
    sdl3.SDL_GL_SetAttribute(sdl3.SDL_GLAttr(sdl3.SDL_GL_CONTEXT_MINOR_VERSION), ctypes.c_int(1))
    sdl3.SDL_GL_SetAttribute(sdl3.SDL_GLAttr(sdl3.SDL_GL_CONTEXT_PROFILE_MASK), ctypes.c_int(sdl3.SDL_GL_CONTEXT_PROFILE_CORE))
    
    # Create window with OpenGL support
    window = sdl3.SDL_CreateWindow(
        b"TTRPG System", BASE_WIDTH, BASE_HEIGHT, 
        sdl3.SDL_WINDOW_RESIZABLE | sdl3.SDL_WINDOW_OPENGL
    )
    if not window:
        logger.critical("Failed to create SDL window: %s", sdl3.SDL_GetError().decode())
        sys.exit(1)
    
    # Create OpenGL context BEFORE renderer
    gl_context = sdl3.SDL_GL_CreateContext(window)
    sdl3.SDL_GL_SetSwapInterval(ctypes.c_int(1))
    if not gl_context:
        logger.critical("Failed to create OpenGL context: %s", sdl3.SDL_GetError().decode())
        sys.exit(1)
    
    # Make context current
    sdl3.SDL_GL_MakeCurrent(window, gl_context)

    # Create renderer
    render_drivers = [sdl3.SDL_GetRenderDriver(i).decode() for i in range(sdl3.SDL_GetNumRenderDrivers())]
    #render_driver = next((d for d in ["vulkan", "opengl", "software"] if d in render_drivers), None)
    render_driver = next((d for d in [ "opengl", "software"] if d in render_drivers), None)
    if not render_driver:
        logger.error("No suitable render driver found.")
        sys.exit(1)

    # Create renderer
    renderer = sdl3.SDL_CreateRenderer(window, render_driver.encode())
    if not renderer:
        logger.critical("Failed to create renderer: %s", sdl3.SDL_GetError().decode())
        sys.exit(1)
    # Initialize ImGui GUI system
    test_context = context.Context(renderer, window, base_width=BASE_WIDTH, base_height=BASE_HEIGHT)
    try:
        imgui_sys = gui_imgui.ImGuiSystem(window, gl_context, test_context)
        logger.info("GUI ImGui system initialized.")
        test_context.imgui= imgui_sys
    except Exception as e:
        logger.error(f"Error initializing ImGui: {e}")
        imgui_sys = None
    
    # Enable VSync for the SDL renderer
    # vsync_result = sdl3.SDL_SetRenderVSync(renderer, ctypes.c_int(1))  # 1 = enable VSync
    # print(('x'))
    # if vsync_result == 0:
    #     logger.info(f"VSync enabled for {render_driver} renderer.")
    # else:
    #     logger.warning(f"Failed to enable VSync: {sdl3.SDL_GetError().decode()}")
    #     # Try adaptive VSync as fallback
    #     adaptive_result = sdl3.SDL_SetRenderVSync(renderer, -1)  # -1 = adaptive VSync
    #     if adaptive_result == 0:
    #         logger.info("Adaptive VSync enabled as fallback.")
    #     else:
    #         logger.warning("VSync not supported by this renderer.")
    
    logger.info(f"Renderer {render_driver} initialized.")
    
    # Initialize D&D 5e Compendiums
    logger.info("Loading D&D 5e compendiums...")
    try:
        compendium_results = load_compendiums()
        compendium_manager = get_compendium_manager()
        test_context.compendium_manager = compendium_manager
        
        loaded_systems = sum(compendium_results.values())
        logger.info(f"Loaded {loaded_systems}/4 compendium systems: {compendium_results}")
        
        # Log system status
        status = compendium_manager.get_system_status()
        if status['data_counts']:
            logger.info(f"Compendium data loaded: {status['data_counts']}")
    except Exception as e:
        logger.error(f"Failed to load compendiums: {e}")
        test_context.compendium_manager = None
    
    test_spell = core_table.entities.Spell(
        name="test", description="test", level=1, sprite=b"resources/magic_projectile.gif"
    )
    
    test_context.gl_context = sdl3.SDL_GL_CreateContext(window)
    logger.info("Context initialized.")

    test_table = test_context.add_table("test_table", BASE_WIDTH, BASE_HEIGHT)
    test_character = core_table.Character.Character(
        name="test_name", race="test_race", char_class=None, hp=10, level=1, stats=None
    )
    test_character.add_spell(test_spell)

    test_context.add_sprite(b"resources/map.jpg", scale_x=0.5, scale_y=0.5)
    test_context.add_sprite(b"resources/woman.png", scale_x=0.5, scale_y=0.5, character=test_character)
    test_context.add_sprite(b"resources/token_1.png", scale_x=0.5, scale_y=0.5, collidable=True)
    test_context.add_sprite(b"resources/test.gif", scale_x=0.5, scale_y=0.5)
    
    # Initialize paint system
    paint.init_paint_system(test_context)
    logger.info("Paint system initialized.")
    

    
    
    

    def init_net_thread():
        socket = client_sdl.init_connection()
        test_context.net_socket = socket

    net_thread = threading.Thread(target=init_net_thread, daemon=True)
    net_thread.start()
    test_context.net_client_started = True
    logger.info("Network client initialized.")

    # Setup protocol
    def send_to_server(msg: str):
        test_context.queue_to_send.put(msg)
    
    protocol = test_context.setup_protocol(send_to_server)
    protocol.request_table()  # Request default table
    
    return test_context

def SDL_AppIterate(context):
    """This function runs every frame."""
    renderer = context.renderer
    now = sdl3.SDL_GetTicks()
    delta_time = now - context.last_time
    context.last_time = now

    # Clear SDL render surface
    sdl3.SDL_SetRenderDrawColorFloat(renderer, 0.2, 0.2, 0.2, sdl3.SDL_ALPHA_OPAQUE_FLOAT)
    sdl3.SDL_RenderClear(renderer)
    
    sdl3.SDL_GetWindowSize(context.window, context.window_width, context.window_height)

    # Always render the table first
    if context.current_table:
        context.current_table.draw_grid(renderer, context.window)

    movement_sys.move_sprites(context, delta_time)
    movement_sys.test_margin(context)

    # Render paint system if active
    if paint.is_paint_mode_active():
        paint.render_paint_system()

    if not context.queue_to_read.empty():
        data = context.queue_to_read.get()
        handle_information(data, context)
    
    # FLUSH SDL content to OpenGL - this is the key fix
    sdl3.SDL_FlushRenderer(renderer)
    
    return sdl3.SDL_APP_CONTINUE

def handle_information(msg, context):
    """Handle incoming network messages."""
    asyncio.run(context.protocol.handle_message(msg))

    if context.waiting_for_table:
        context.waiting_for_table = False
        msg = json.loads(msg)
        table = context.create_table_from_json(msg)
        context.list_of_tables.append(table)
        context.current_table = table
        logger.info("Table created and changed")
        #gui_sys.add_chat_message(f"Table '{table.name}' loaded from network")
        
    logger.info("Received message: %s", msg)
    #gui_sys.add_chat_message(f"Network: {msg}", "Server")
    
    if msg == "INITIALIZE_TABLE":
        context.waiting_for_table = True
        #gui_sys.add_chat_message("Waiting for table data...", "System")

    if msg == "hello":
        event_sys.handle_key_event(context, sdl3.SDL_SCANCODE_SPACE)
        #gui_sys.add_chat_message("Hello received from server!", "Server")

def net_thread(context):
    """Thread for network communication."""
    logger.info("Network thread started.")
    last_check = time.time()
    check_interval = CHECK_INTERVAL

    def is_socket_alive(sock):
        try:
            client_sdl.send_data(sock, "__ping__")
            return True
        except Exception as e:
            logger.warning("Socket check failed: %s", e)
            return False

    while not context.net_socket:
        time.sleep(NET_SLEEP)
    socket = context.net_socket
    logger.info("Network socket obtained.")

    while True:
        # Periodically check connection
        if time.time() - last_check > check_interval:
            if not is_socket_alive(socket):
                logger.warning("Connection lost. Reconnecting...")
                try:
                    client_sdl.close_connection(socket)
                except Exception as e:
                    logger.error("Error closing socket: %s", e)
                while True:
                    try:
                        socket = client_sdl.init_connection()
                        if socket:
                            context.net_socket = socket
                            logger.info("Reconnected to server.")
                            break
                    except Exception as e:
                        logger.error("Reconnect failed: %s", e)
                    time.sleep(2)
            last_check = time.time()

        # Write from queue_to_send to socket
        try:
            while not context.queue_to_send.empty():
                out_data = context.queue_to_send.get_nowait()
                client_sdl.send_data(socket, out_data)
        except Exception as e:
            logger.error("Error sending data: %s", e)

        # Read from socket and put into queue_to_read
        try:
            data = client_sdl.receive_data(socket)
            if data and data.strip() != "__pong__":
                context.queue_to_read.put(data)
                logger.info("Received data: %s", data)
        except Exception as e:
            logger.error("Error receiving data: %s", e)

        time.sleep(NET_SLEEP)

def parse_arguments():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(description='TTRPG System Main Application')
    parser.add_argument('--mode', choices=['player', 'master'], default='player',
                       help='Run as player or master (default: player)')
    parser.add_argument('--server', default='127.0.0.1',
                       help='Server IP address (default: 127.0.0.1)')
    parser.add_argument('--port', default='12345',
                       help='Server port (default: 12345)')
    parser.add_argument('--no-menu', action='store_true',
                       help='Skip main menu and start directly')
    
    return parser.parse_args()

def main():
    """Main entry point."""
    # Parse command line arguments
    args = parse_arguments()
    
    logger.info(f"Starting TTRPG System in {args.mode} mode")
    logger.info(f"Server: {args.server}:{args.port}")
    
    # Initialize SDL
    try:
        ctx = SDL_AppInit_func()
    except Exception as e:
        logger.critical("Error initializing SDL: %s", e)
        sdl3.SDL_Quit()
        sys.exit(1)
        
    # Initialize Net thread
    if ctx.net_client_started:
        logger.info("Starting network client thread")
        t = threading.Thread(target=net_thread, args=(ctx,), daemon=True)
        t.start()

    running = True
    event = sdl3.SDL_Event()

    while running:
        # Handle events
        while sdl3.SDL_PollEvent(ctypes.byref(event)):
            # Let ImGui process events first and check if it consumed them
            gui_consumed = ctx.imgui.process_event(event)
            #if ctx.imgui.io.want_capture_mouse or ctx.imgui.io.want_capture_keyboard:
                #gui_consumed = ctx.imgui.process_event(event)
            
            # Only process game events if ImGui didn't consume them
            if not gui_consumed:
                # Handle paint events
                if paint.handle_paint_events(event):
                    continue  # Paint system consumed the event
                    
                # Handle normal game events
                running = event_sys.handle_event(ctx, event)
        
        # Render SDL content first (SDL handles its own clearing)
        SDL_AppIterate(ctx)
        
        # Then render ImGui over the SDL content
        ctx.imgui.iterate()

        #sdl3.SDL_RenderPresent(ctx.renderer)
        #sdl3.SDL_GL_SwapWindow(ctx.window)
        
        # Final buffer swap to display both SDL and ImGui content
        sdl3.SDL_GL_SwapWindow(ctx.window)
        
    # Cleanup
    sdl3.SDL_DestroyRenderer(ctx.renderer)
    sdl3.SDL_DestroyWindow(ctx.window)
    sdl3.SDL_Quit()

if __name__ == "__main__":
    main()