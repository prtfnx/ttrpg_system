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
import time
import json
import asyncio
import paint
import gui.gui_imgui as gui_imgui
from net import client_sdl
from net import client_webhook
from net import client_webhook_protocol
from net import client_websocket
from net import client_websocket_protocol
from net.protocol import ProtocolHandler, Message, MessageType
from imgui_bundle import imgui
import OpenGL.GL as gl

import argparse
import lighting_sys



#Import profiling system
#import profiler
#from profiler_integration import profile_sdl_operations, profile_imgui_operations, profile_context_operations

# Configure logging with enhanced debug visibility
logging.basicConfig(
    level=logging.CRITICAL,
    format="%(asctime)s [%(levelname)8s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),  # Console output
        logging.FileHandler('debug.log', mode='w')  # File output for persistence
    ],    
)

# Set specific loggers to debug level to ensure they show debug messages

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)



BASE_WIDTH: int = 1920
BASE_HEIGHT: int = 1080
NET_SLEEP: float = 0.1
CHECK_INTERVAL: float = 2.0
NUMBER_OF_NET_FAILS: int = 5
TIME_TO_CONNECT: int = 4000  # 4 seconds
COMPENDIUM_SYSTEM: bool = False
LIGHTING_SYS: bool = True

# Import compendium integration
if COMPENDIUM_SYSTEM:
    from compendium_manager import get_compendium_manager, load_compendiums
    import compendium_sprites

def SDL_AppInit_func(args=None):
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
    # Create context for the application
    test_context = context.Context(renderer, window, base_width=BASE_WIDTH, base_height=BASE_HEIGHT)
    #Initialize ImGui GUI system
    
    try:
        imgui_sys = gui_imgui.ImGuiSystem(window, gl_context, test_context)
        logger.info("GUI ImGui system initialized.")
        test_context.imgui= imgui_sys
    except Exception as e:
        logger.error(f"Error initializing ImGui: {e}")
        imgui_sys = None
    
    #Enable VSync for the SDL renderer
    # vsync_result = sdl3.SDL_SetRenderVSync(renderer, ctypes.c_int(1))  # 1 = enable VSync
    # #print(('x'))
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
    if COMPENDIUM_SYSTEM:
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
    
   
    
    test_context.gl_context = sdl3.SDL_GL_CreateContext(window)
    logger.info("Context initialized.")
    # Initialize table, spell and character
    test_spell = core_table.entities.Spell(
        name="test", description="test", level=1, sprite=b"resources/magic_projectile.gif"
    )
    test_table = test_context.add_table("test_table", BASE_WIDTH, BASE_HEIGHT)
    test_character = core_table.Character.Character(
        name="test_name", race="test_race", char_class=None, hp=10, level=1, stats=None
    )
    test_character.add_spell(test_spell)

    test_context.add_sprite(b"resources/map.jpg", scale_x=0.5, scale_y=0.5)
    test_context.add_sprite(b"resources/woman.png", scale_x=0.5, scale_y=0.5, character=test_character)
    test_context.add_sprite(b"resources/token_1.png", scale_x=0.5, scale_y=0.5, collidable=True)
    test_context.add_sprite(b"resources/test.gif", scale_x=0.5, scale_y=0.5)
    # Initialize lighting system
    if LIGHTING_SYS:
        logger.info("Initializing lighting system...")
        try:
            test_context.LightingManager = lighting_sys.LightManager(test_context, name ="default_lighting_manager") 
            #print(f"Lighting manager: {test_context.LightingManager}")
            default_light = lighting_sys.Light('default_light')
            test_context.LightingManager.add_light(default_light)
            light_sprite = test_context.add_sprite(
                b"resources/light.png", scale_x=0.5, scale_y=0.5,layer='light',)
            #test_context.LightingManager.add_light_sprite(default_light, light_sprite)
            test_context.LightingManager.create_light_texture(default_light, path_to_image=b"resources/light.png")
            test_context.light_on= True
            logger.info("Lighting system initialized.")
        except Exception as e:
            logger.error(f"Failed to initialize lighting system: {e}")
            test_context.LightingManager = None

    # Initialize paint system
    paint.init_paint_system(test_context)
    logger.info("Paint system initialized.")
    logger.info("Start to initialize network client.")
    try:
        if args and args.connection == 'webhook':
            logger.info("Starting webhook client")
            webhook_thread = threading.Thread(
                target=start_webhook_connection_thread, 
                args=(test_context, args.server_url, int(args.webhook_port)), 
                daemon=True
            )
            webhook_thread.start()        
        elif args and args.connection == 'websocket':
            logger.info("Starting WebSocket client")
            # For WebSocket, we need authentication parameters
            session_code = getattr(args, 'session_code', None)
            jwt_token = getattr(args, 'jwt_token', None)
            
            websocket_thread = threading.Thread(
                target=start_websocket_connection_thread, 
                args=(test_context, args.server_url, session_code, jwt_token), 
                daemon=True
            )
            websocket_thread.start()
        else:
            logger.info("Starting SDL network client thread")
            net_thread = threading.Thread(target=start_net_connection_thread, args=(test_context,), daemon=True)
            net_thread.start()
        test_context.net_client_started = True
    except Exception as e:
        logger.error(f"Failed to start network connection: {e}")        
        test_context.net_client_started = False
      # Setup protocol
    def send_to_server(msg: str):
        test_context.queue_to_send.put(msg)
    
    if args and args.connection == 'webhook':
        protocol = client_webhook_protocol.setup_webhook_protocol(test_context, test_context.net_socket)
    elif args and args.connection == 'websocket':
        session_code = getattr(test_context, 'session_code', None)
        protocol = client_websocket_protocol.setup_websocket_protocol(test_context, test_context.net_socket, session_code)
    else:
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
    #sdl3.SDL_FlushRenderer(renderer)
    
    return sdl3.SDL_APP_CONTINUE

def handle_information(msg, context):
    """Handle incoming network messages."""
    try:
        # Handle WebSocket wrapped messages (old format compatibility)
        if isinstance(msg, str):
            try:
                parsed = json.loads(msg)
                # Check if this is a wrapped message format from WebSocket server
                if isinstance(parsed, dict) and "message" in parsed and "server_id" in parsed:
                    # Extract the actual message from the wrapper
                    actual_message = parsed["message"]
                    # If the message is a JSON string, use it directly
                    if isinstance(actual_message, str):
                        msg = actual_message
                    else:
                        # If it's already parsed, re-serialize it
                        msg = json.dumps(actual_message)
                    logger.debug("Unwrapped WebSocket message")
            except (json.JSONDecodeError, KeyError):
                # Not a wrapped message, use as-is
                pass
        #print('context.protocol.handle_message', context.protocol)
        # Process the message through the protocol handler
        asyncio.run(context.protocol.handle_message(msg))

        if context.waiting_for_table:
            context.waiting_for_table = False
            msg_data = json.loads(msg) if isinstance(msg, str) else msg
            table = context.create_table_from_json(msg_data)
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
            
    except Exception as e:
        logger.error(f"Error handling message: {e}")
        logger.debug(f"Problematic message: {msg[:200] if isinstance(msg, str) else str(msg)[:200]}...")
# def init_net_func(context):
#     """Initialize the network thread."""
#     logger.info("Initializing network thread...")
#     socket = client_sdl.init_connection()
#     context.net_socket = socket

def start_net_connection_thread(context):
    """Start the network connection."""
    logger.info("Starting network connection...")
    while True:
        try:
            logger.info("Creating network socket...")
            socket = client_sdl.init_connection()
            context.net_socket = socket
            net_thread_func(context)
        except Exception as e:
            logger.error("Error creating network socket: %s", e)
            time.sleep(1)

    #init_net_thread = threading.Thread(target=init_net_func, daemon=True)
    #init_net_thread.start()

def net_thread_func(context):
    """Thread for network communication."""
    logger.info("Network thread func started.")
    last_check = time.time()
    check_interval = CHECK_INTERVAL
    net_fails = 0


    socket = context.net_socket
    logger.info("Waiting for network connection...")
    connected = sdl3.SDL_net.NET_GetConnectionStatus(socket)

    while not connected == 1:
        logger.info(f'Connected status: {connected}')
        logger.info("Waiting for network connection...")
        #time.sleep(1)
        connected = sdl3.SDL_net.NET_WaitUntilConnected(
            socket, 
            TIME_TO_CONNECT     # Wait for 2 second to ensure connection
        )
        if connected == -1:
            logger.error("Failed to connect to server: %s", sdl3.SDL_GetError().decode())
            try:
                logger.info("Closing socket after failed connection.")
                logger.info(f"socket: {socket}")
                client_sdl.close_connection(socket)                
            except Exception as e:
                logger.error("Error closing socket: %s", e)
            return 
        
    def manual_ping(socket, ):
        try:
            
            client_sdl.send_data(socket, "__ping__")
            return True
        except Exception as e:
            logger.warning("Socket check failed: %s", e)
            return False

    
    logger.info("Network socket obtained.")

    while True:
        #logger.info(f'time.time() {time.time()}  last_check {last_check}  check_interval: {check_interval}')
        # Periodically check connection
        if time.time() - last_check > check_interval:
            # TODO: Implement a proper reconnect mechanism, refactor this
            if net_fails > NUMBER_OF_NET_FAILS :
                logger.warning(f"net fails {net_fails}  is more than {NUMBER_OF_NET_FAILS}.")
                logger.warning("Connection lost. Reconnecting...")
                try:
                    client_sdl.close_connection(socket)
                except Exception as e:
                    logger.error("Error closing socket: %s", e)
                return
            
            logger.debug(f"Manual ping attempt, net fails:  {net_fails}")
            net_fails +=1  
            manual_ping(socket)
                         
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
            if data:
                if data.strip() == "__pong__":
                    net_fails = max(0, net_fails - 1)
                    logger.debug(f'Received pong decrease net fails. net_fails={net_fails}.')
                elif data.strip() == "-1":
                    pass
                    #TODO: implement proper send receive handling
                    #net_fails += 1
                    #logger.error(f'Cannt receive data, increase net_fails={net_fails}')
                else:
                    context.queue_to_read.put(data)
                    logger.debug(f"Received data: %s", data)  
                    #net_fails -= 1

        except Exception as e:
            logger.error("Error receiving data: %s", e)

        time.sleep(NET_SLEEP)

def start_webhook_connection_thread(context, server_url, webhook_port):
    """Start the webhook connection."""
    logger.info("Starting webhook connection...")
    while True:
        try:
            logger.info("Creating webhook client...")
            webhook_client = client_webhook.init_connection(server_url, webhook_port)
            context.net_socket = webhook_client  # Store webhook client in same attribute
            webhook_thread_func(context)
        except Exception as e:
            logger.error("Error creating webhook connection: %s", e)
            time.sleep(1)

def webhook_thread_func(context):
    """Thread for webhook communication."""
    logger.info("Webhook thread func started.")
    last_check = time.time()
    check_interval = CHECK_INTERVAL
    net_fails = 0

    webhook_client = context.net_socket
    logger.info("Webhook client ready for communication...")

    while True:
        current_time = time.time()
        
        # Check connection periodically
        if current_time - last_check > check_interval:
            try:
                webhook_client.ping_server()
                last_check = current_time
            except Exception as e:
                logger.error("Webhook ping error: %s", e)
                net_fails += 1
                if net_fails > NUMBER_OF_NET_FAILS:
                    logger.error("Too many webhook failures, reconnecting...")
                    break

        # Send queued messages
        try:
            while not context.queue_to_send.empty():
                msg = context.queue_to_send.get_nowait()
                webhook_client.send_data(msg)
                logger.debug(f"Sent webhook data: {msg[:100]}...")
        except Exception as e:
            logger.error("Error sending webhook data: %s", e)

        # Receive messages
        try:
            data = client_webhook.receive_data(webhook_client)
            if data:
                if data.strip() == "__pong__":
                    net_fails = max(0, net_fails - 1)
                    logger.debug(f'Received webhook pong, net_fails={net_fails}.')
                elif data.strip() == "-1":
                    pass  # Handle webhook specific errors
                else:
                    context.queue_to_read.put(data)
                    logger.debug(f"Received webhook data: {data[:100]}...")
        except Exception as e:
            logger.error("Error receiving webhook data: %s", e)
            net_fails += 1        
        time.sleep(NET_SLEEP)

def start_websocket_connection_thread(context, server_url, session_code=None, jwt_token=None):
    """Start the WebSocket connection with authentication."""
    logger.info("Starting WebSocket connection...")
    while True:
        try:
            logger.info("Creating WebSocket client...")
            websocket_client = client_websocket.init_connection(server_url)
            
            if not websocket_client:
                logger.error("Failed to initialize WebSocket client")
                time.sleep(5)
                continue
            
            # Set authentication token if provided
            if jwt_token:
                websocket_client.set_auth_token(jwt_token)
                logger.info("JWT token set for WebSocket client")
            
            # Connect to session if specified
            if session_code and jwt_token:
                success = websocket_client.connect_to_session(session_code)
                if not success:
                    logger.error("Failed to connect to session - missing authentication")
                    time.sleep(5)
                    continue
                    
            context.net_socket = websocket_client  # Store WebSocket client in same attribute
            context.session_code = session_code  # Store session code for protocol
            websocket_thread_func(context)
        except Exception as e:
            logger.error("Error creating WebSocket connection: %s", e)
            time.sleep(1)

def websocket_thread_func(context):
    """Thread for WebSocket communication."""
    logger.info("WebSocket thread func started.")
    last_check = time.time()
    check_interval = CHECK_INTERVAL
    net_fails = 0

    websocket_client = context.net_socket
    logger.info("WebSocket client ready for communication...")

    while True:
        current_time = time.time()
        
        # Check connection periodically
        if current_time - last_check > check_interval:
            try:
                websocket_client.ping_server()
                last_check = current_time
            except Exception as e:
                logger.error("WebSocket ping error: %s", e)
                net_fails += 1
                if net_fails > NUMBER_OF_NET_FAILS:
                    logger.error("Too many WebSocket failures, reconnecting...")
                    break

        # Send queued messages
        try:
            while not context.queue_to_send.empty():
                msg = context.queue_to_send.get_nowait()
                websocket_client.send_data(msg)
                logger.debug(f"Sent WebSocket data: {msg[:100]}...")
        except Exception as e:
            logger.error("Error sending WebSocket data: %s", e)

        # Receive messages
        try:
            data = client_websocket.receive_data(websocket_client)
            if data:
                if data.strip() == "__pong__":
                    net_fails = max(0, net_fails - 1)
                    logger.debug(f'Received WebSocket pong, net_fails={net_fails}.')
                elif data.strip() == "-1":
                    pass  # Handle WebSocket specific errors
                else:
                    context.queue_to_read.put(data)
                    logger.debug(f"Received WebSocket data: {data}...")
        except Exception as e:
            logger.error("Error receiving WebSocket data: %s", e)
            net_fails += 1
            
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
    parser.add_argument('--connection', choices=['sdl', 'webhook', 'websocket'], default='websocket',
                       help='Connection type: sdl for TCP socket, webhook for HTTP/webhooks, or websocket for WebSocket connection (default: sdl)')
    parser.add_argument('--webhook-port', default='8080',
                       help='Local webhook server port (default: 8080)')
    parser.add_argument('--server-url', default='127.0.0.01:12345',
                       help='Server URL for webhook connection (default: localhost:12345)')
    # Authentication parameters for WebSocket connections
    parser.add_argument('--session-code', default='V2ERPCXR',
                       help='Game session code for WebSocket connection')
    parser.add_argument('--jwt-token', default='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0IiwiZXhwIjoxNzQ5NTkzMTg3fQ.WpdR9rgF_jLlvOoKnpVCXn7J-mj6JSHFiXgOHXbn72U',
                       help='JWT authentication token for WebSocket connection')
    parser.add_argument('--username', default='test',
                       help='Username for authentication')
    parser.add_argument('--password', default='test',
                       help='Password for authentication')
    parser.add_argument('--no-menu', action='store_true',
                       help='Skip main menu and start directly')
    

    return parser.parse_args()

def main(args=None):
    """Main entry point."""
    # Parse command line arguments
    print(args)
    if args is None:
        args = parse_arguments()
    else:
        # Convert dict to argparse Namespace
        args = argparse.Namespace(**args)
    
    logger.info(f"Starting TTRPG System in {args.mode} mode")
    logger.info(f"Connection type: {args.connection}")
    if args.connection == 'webhook':
        logger.info(f"Server URL: {args.server_url}")
        logger.info(f"Webhook port: {args.webhook_port}")
    else:
        logger.info(f"Server: {args.server}:{args.port}")
    
    # Initialize SDL
    try:
        context = SDL_AppInit_func(args)
    except Exception as e:
        logger.critical("Error initializing SDL: %s", e)
        sdl3.SDL_Quit()
        sys.exit(1)
        
    # Initialize Net thread
    # if context.net_client_started:
    #     logger.info("Starting network client thread")
    #     net_thread = threading.Thread(target=net_thread_func, args=(context,), daemon=True)
    #     net_thread.start()

    running = True
    event = sdl3.SDL_Event()

    while running:
        # Handle events
        while sdl3.SDL_PollEvent(ctypes.byref(event)):
            # Let ImGui process events first and check if it consumed them
            gui_consumed = context.imgui.process_event(event)
            
            # if ctx.imgui.io.want_capture_mouse or ctx.imgui.io.want_capture_keyboard:
            #     gui_consumed = ctx.imgui.process_event(event)
            
            # Only process game events if ImGui didn't consume them
            if not gui_consumed:
                # Handle paint events
                if paint.handle_paint_events(event):
                    continue  # Paint system consumed the event
                
                # Handle normal game events
                running = event_sys.handle_event(context, event)

        # Render SDL content first (SDL handles its own clearing)
        SDL_AppIterate(context)
        #context.LightingManager.iterate()
        # Then render ImGui over the SDL content
        sdl3.SDL_FlushRenderer(context.renderer)
        context.imgui.iterate()

        #sdl3.SDL_RenderPresent(context.renderer)
        #sdl3.SDL_GL_SwapWindow(ctx.window)
        
        # Final buffer swap to display both SDL and ImGui content
        sdl3.SDL_GL_SwapWindow(context.window)

    # Cleanup
    sdl3.SDL_DestroyRenderer(context.renderer)
    sdl3.SDL_DestroyWindow(context.window)
    sdl3.SDL_Quit()

if __name__ == "__main__":
    main()