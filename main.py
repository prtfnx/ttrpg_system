import sys
from logger import setup_logger
import sdl3
import ctypes
import event_sys
import core_table.Character
import core_table.entities
import MovementManager
import threading
import time
import PaintManager
import gui.gui_imgui as gui_imgui
from RenderManager import RenderManager
from Context import Context
from net import client_sdl
from net.client_websocket import WebSocketClient
from net import client_websocket_protocol
from net.protocol import ProtocolHandler, Message, MessageType
from net.client_protocol import ClientProtocol
from net.DownloadManager import DownloadManager
from imgui_bundle import imgui
from LayoutManager import LayoutManager
from Actions import Actions
from typing import Optional
from ctypes import c_int, c_float, c_char, c_char_p
from LightManager import LightManager, Light
from storage.StorageManager import StorageManager
from AssetManager import ClientAssetManager
from GeometricManager import GeometricManager
from CharacterManager import CharacterManager
from core_table.actions_protocol import Position
import OpenGL.GL as gl
import argparse

import settings


#Import profiling system
#import profiler
#from profiler_integration import profile_sdl_operations, profile_imgui_operations, profile_context_operations


logger = setup_logger(__name__)

BASE_WIDTH: int = 1920
BASE_HEIGHT:  int = 1080
TITLE: c_char_p = c_char_p(b"TTRPG System")
NET_SLEEP: float = 0.1
CHECK_INTERVAL: float = 2.0
NUMBER_OF_NET_FAILS: int = 5
TIME_TO_CONNECT: int = 4000  # 4 seconds
COMPENDIUM_SYSTEM: bool = True
LIGHTING_SYS: bool = True
GUI_SYS: bool = True
# Layout configuration - centered table with GUI panels on all sides
TABLE_AREA_PERCENT: float = 0.60   # 60% for centered table
GUI_PANEL_SIZE: int = 200           # Fixed size for GUI panels (pixels)
MARGIN_SIZE: int = 20               # Margin between table and GUI panels

if COMPENDIUM_SYSTEM:
    from CompendiumManager import CompendiumManager

from CharacterManager import CharacterManager



    

def sdl3_init() -> tuple[sdl3.SDL_Window, sdl3.SDL_Renderer, sdl3.SDL_GLContext]:
    sdl3.SDL_GL_SetAttribute(sdl3.SDL_GL_DOUBLEBUFFER, ctypes.c_int(1))
    sdl3.SDL_GL_SetAttribute(sdl3.SDL_GL_DEPTH_SIZE, ctypes.c_int(24))
    sdl3.SDL_GL_SetAttribute(sdl3.SDL_GL_STENCIL_SIZE, ctypes.c_int(8))
    sdl3.SDL_GL_SetAttribute(sdl3.SDL_GL_ACCELERATED_VISUAL, ctypes.c_int(1))
    sdl3.SDL_GL_SetAttribute(sdl3.SDL_GL_MULTISAMPLEBUFFERS, ctypes.c_int(1))
    sdl3.SDL_GL_SetAttribute(sdl3.SDL_GL_MULTISAMPLESAMPLES, ctypes.c_int(8))
    sdl3.SDL_GL_SetAttribute(sdl3.SDL_GL_CONTEXT_FLAGS, ctypes.c_int(sdl3.SDL_GL_CONTEXT_FORWARD_COMPATIBLE_FLAG))
    sdl3.SDL_GL_SetAttribute(sdl3.SDL_GL_CONTEXT_MAJOR_VERSION, ctypes.c_int(4))
    sdl3.SDL_GL_SetAttribute(sdl3.SDL_GL_CONTEXT_MINOR_VERSION, ctypes.c_int(1))
    sdl3.SDL_GL_SetAttribute(sdl3.SDL_GL_CONTEXT_PROFILE_MASK, ctypes.c_int(sdl3.SDL_GL_CONTEXT_PROFILE_CORE))
    
    # Create window with OpenGL support
    window = sdl3.SDL_CreateWindow(
        TITLE, c_int(BASE_WIDTH), c_int(BASE_HEIGHT), 
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

    
    render_drivers = [sdl3.SDL_GetRenderDriver(i).decode() for i in range(sdl3.SDL_GetNumRenderDrivers())]
    #render_driver = next((d for d in ["vulkan", "opengl", "software"] if d in render_drivers), None)
    render_driver = next((d for d in [ "opengl", "software"] if d in render_drivers), None)
    if not render_driver:
        logger.error("No suitable render driver found.")
        sys.exit(1)
    logger.info(f"Renderer {render_driver} initialized.")
    
    renderer = sdl3.SDL_CreateRenderer(window, render_driver.encode())
    if not renderer:
        logger.critical("Failed to create renderer: %s", sdl3.SDL_GetError().decode())
        sys.exit(1)    
    return window, renderer, gl_context

    
def SDL_AppInit_func(args: argparse.Namespace) -> Context:
    """Initialize SDL window, renderer, and network client."""
    
    # if sdl dont init, exit
    try:
        window, renderer, gl_context = sdl3_init()
        
    except Exception as e:        
        logger.exception(f'SDL initialization failed: {e}')
        sdl3.SDL_Quit()
        sys.exit(1)
    
    test_context = Context(renderer, window, base_width=BASE_WIDTH, base_height=BASE_HEIGHT)
    test_context.gl_context = gl_context
    
    # Set user mode based on command line arguments
    test_context.is_gm = (args.mode == "master")
    logger.info(f"User mode set: {'GM' if test_context.is_gm else 'Player'}")

    
    # Initialize D&D 5e Compendiums
    if COMPENDIUM_SYSTEM:
        logger.info("Loading D&D 5e compendiums...")
        try:
            test_context.CompendiumManager = CompendiumManager()
            compendium_results = test_context.CompendiumManager.load_all_systems()
            
            loaded_systems = sum(compendium_results.values())
            logger.info(f"Loaded {loaded_systems}/4 compendium systems: {compendium_results}")
            
            # Log system status
            status = test_context.CompendiumManager.get_system_status()
            if status['data_counts']:
                logger.info(f"Compendium data loaded: {status['data_counts']}")
        except Exception as e:
            logger.error(f"Failed to load compendiums: {e}")
            test_context.CompendiumManager = None
    
    # Initialize Character Manager
    logger.info("Loading Character Manager...")
    try:
        test_context.CharacterManager = CharacterManager()
        test_context.CharacterManager.set_context(test_context)  # Set context reference for sprite creation
        char_stats = test_context.CharacterManager.get_stats()
        logger.info(f"CharacterManager loaded: {char_stats['current_characters']} characters")
    except Exception as e:
        logger.error(f"Failed to load CharacterManager: {e}")
        test_context.CharacterManager = None
    
    
    logger.info("Context initialized.")
    # Initialize OpenGL context
    #test_context.gl_context = sdl3.SDL_GL_CreateContext(window)
    
    
    # Initialize Layout_manager
    try:
        logger.info("Initializing LayoutManager...")
        test_context.LayoutManager = LayoutManager()
        test_context.LayoutManager.update_layout(window)
        logger.info("LayoutManager initialized.")
    except Exception as e:
        logger.error(f"Failed to initialize LayoutManager: {e}")
        test_context.LayoutManager = None    # Initialize AssetManager (now owns StorageManager and DownloadManager)
    try:
        logger.info("Initializing AssetManager with owned StorageManager and DownloadManager...")
        test_context.AssetManager = ClientAssetManager(
            cache_dir=None,  # Uses settings default
            storage_root=settings.DEFAULT_STORAGE_PATH
        )
        logger.info("AssetManager initialized with owned managers.")
    except Exception as e:
        logger.error(f"Failed to initialize AssetManager: {e}")
        test_context.AssetManager = None
    # Initialize GeometryManager
    try:
        logger.info("Initializing GeometryManager...")
        test_context.GeometryManager = GeometricManager()       
        logger.info("GeometryManager initialized.")
    except Exception as e:
        logger.error(f"Failed to initialize GeometryManager: {e}")
        test_context.GeometryManager = None
    # Initialize Actions
    try:
        logger.info("Initializing Actions system...")
        test_context.Actions = Actions(test_context)
        test_context.Actions.AssetManager = test_context.AssetManager
        logger.info("Actions system initialized.")
    except Exception as e:
        logger.error(f"Failed to initialize Actions system: {e}")
        test_context.Actions = None
    # Init GUI system
    if GUI_SYS:
        try:            
            simplified_gui = gui_imgui.create_gui(test_context)
            logger.info("Simplified GUI system initialized.")
            test_context.imgui = simplified_gui
            
            # Connect Actions system to GUI actions bridge
            if test_context.Actions and hasattr(simplified_gui, 'actions_bridge'):
                test_context.Actions.actions_bridge = simplified_gui.actions_bridge
                logger.info("Connected Actions system to GUI actions bridge.")
            
        except Exception as e:
            logger.exception(f"Error initializing Simplified GUI: {e}")
            test_context.imgui = None

    # Initialie lighting system
    if LIGHTING_SYS:
        logger.info("Initializing lighting system...")
        try:
            test_context.LightingManager = LightManager(test_context, name ="default_lighting_manager") 
            default_light = Light('default_light')
            test_context.LightingManager.create_light_texture(default_light, path_to_image=b"resources/light.png")
            test_context.light_on= True
            logger.info("Lighting system initialized.")
        except Exception as e:
            logger.error(f"Failed to initialize lighting system: {e}")
            test_context.LightingManager = None
   
    # Initialize paint system
    PaintManager.init_paint_system(test_context)
    logger.info("Paint system initialized.")
    logger.info("Start to initialize network client.")
    # Initialize network client
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
      # Setup net protocol
    def send_to_server(msg: str):
        test_context.queue_to_send.put(msg)
    
    #test_context.net = False
    
    if test_context.net is True:
        # if args and args.connection == 'webhook':
        #     protocol = client_webhook_protocol.setup_webhook_protocol(test_context, test_context.net_socket)
        # elif args and args.connection == 'websocket':
        #     session_code = getattr(test_context, 'session_code', None)
        #     protocol = client_websocket_protocol.setup_websocket_protocol(test_context, test_context.net_socket, session_code)
        # else:
        #     protocol = test_context.setup_protocol(send_to_server)
        
        # protocol.request_table()  # Request default table
        def send_message(msg_str: str):
            test_context.queue_to_send.put(msg_str)
        
        if test_context.Actions:
            protocol = ClientProtocol(test_context.Actions, send_message)
            test_context.protocol = protocol

        else:
            logger.error("Actions system is not initialized, cannot setup protocol.")
        
    # Setup test table
    # Initialize table, spell and character
    test_spell = core_table.entities.Spell(
        name="test", description="test", level=1, sprite="resources/magic_projectile.gif"
    )
    test_table = test_context.add_table("test_table", BASE_WIDTH, BASE_HEIGHT)
    test_character = core_table.Character.Character(
        name="test_name", level=1
    )
    # Set hit points manually since we don't have a character class
    test_character.hit_points = 10
    test_character.max_hit_points = 10
   
    test_character.add_spell(test_spell)
    
    # Add test character through CharacterManager for testing (delete old and create new)
    if test_context.CharacterManager:
        try:
            existing_chars = test_context.CharacterManager.list_characters()
            test_char_names = ["Test Character", "Test Warrior"]
            
            # Find and delete existing test characters
            chars_to_delete = []
            for char_id, char_data in existing_chars.items():
                if char_data.get('name', '') in test_char_names:
                    chars_to_delete.append((char_id, char_data.get('name', 'Unknown')))
            
            if chars_to_delete:
                logger.info(f"Deleting existing test characters: {[name for _, name in chars_to_delete]}")
                for char_id, char_name in chars_to_delete:
                    success = test_context.CharacterManager.delete_character(char_id)
                    if success:
                        logger.info(f"Deleted test character: {char_name} (ID: {char_id})")
                    else:
                        logger.warning(f"Failed to delete test character: {char_name} (ID: {char_id})")
            
            # Create fresh test characters
            logger.info("Creating fresh test characters...")
            
            # Create Test Character
            test_char_id = test_context.CharacterManager.create_character(
                name="Test Character", 
                is_player=True, 
                player_name="Test Player"
            )
            logger.info(f"Test character created with ID: {test_char_id}")
            
            # Create Test Warrior
            test_char_2 = core_table.Character.Character(name="Test Warrior", level=2)
            test_char_2.hit_points = 20
            test_char_2.max_hit_points = 20
            test_char_2_id = test_context.CharacterManager.add_character(test_char_2)
            logger.info(f"Test character 2 created with ID: {test_char_2_id}")
            
            # Log character manager stats
            stats = test_context.CharacterManager.get_stats()
            logger.info(f"CharacterManager stats: {stats}")
            
        except Exception as e:
            logger.error(f"Error managing test characters: {e}")
    
    result1=test_context.Actions.create_sprite( test_table.table_id, "sprite_map", Position(0, 0), image_path="resources/map.jpg", scale_x=0.5, scale_y=0.5, layer='map')
    result2=test_context.Actions.create_sprite( test_table.table_id, "sprite_woman", Position(0, 0), image_path="resources/woman.png", scale_x=0.5, scale_y=0.5, character=test_character)
    result3=test_context.Actions.create_sprite( test_table.table_id, "sprite_token1", Position(100, 100), image_path="resources/token_1.png", scale_x=0.5, scale_y=0.5, collidable=True)
    result4=test_context.Actions.create_sprite( test_table.table_id, "sprite_test", Position(200, 200), image_path="resources/test.gif", scale_x=0.5, scale_y=0.5)
    result5=test_context.Actions.create_sprite( test_table.table_id, "sprite_wall", Position(300, 300), image_path="resources/wall1.png", scale_x=0.1, scale_y=0.1, collidable=True, layer='obstacles')
    logger.info(f"Created sprites: {result1}, {result2}, {result3}, {result4}, {result5}")
     # Initialize RenderManager
    try:
        logger.info("Initializing RenderManager...")
        test_context.RenderManager = RenderManager(renderer, window)
        test_context.RenderManager.dict_of_sprites_list = test_context.current_table.dict_of_sprites_list
        test_context.RenderManager.configure_layers()
        test_context.RenderManager.LightManager= test_context.LightingManager
        test_context.RenderManager.GeometricManager = test_context.GeometryManager
        logger.info("RenderManager initialized.")
    except Exception as e:
        logger.error(f"Failed to initialize RenderManager: {e}")
        test_context.RenderManager = None
    return test_context

def SDL_AppIterate(context):
    """This function runs every frame."""    
    now = sdl3.SDL_GetTicks()
    delta_time = now - context.last_time
    context.last_time = now
    table = context.current_table
    # Get current window size
    sdl3.SDL_GetWindowSize(context.window, context.window_width, context.window_height)
    window_width = context.window_width.value
    window_height = context.window_height.value
    
    # Get viewport from LayoutManager (updated by ImGui)
    if hasattr(context, 'LayoutManager'):
        table_x, table_y, table_width, table_height = context.LayoutManager.table_area
    else:
        # Fallback to default values if LayoutManager not available
        table_x, table_y, table_width, table_height = 0, 0, window_width, window_height
    # Store layout info in context for other systems to use
    context.layout = {
        'table_area': (table_x, table_y, table_width, table_height),
        'window_size': (window_width, window_height)
    }
    
    if table:
        # Set the table's screen area for coordinate transformation
        table.set_screen_area(table_x, table_y, table_width, table_height)
        
    # Movement 
    MovementManager.move_sprites(context, delta_time)
    # Render all sdl content
    context.RenderManager.iterate_draw(table, context.light_on, context)

    # Render paint system if active (in table area)
    if PaintManager.is_paint_mode_active():
        PaintManager.render_paint_system()    # Handle network messages
    if not context.queue_to_read.empty():
        data = context.queue_to_read.get()
        handle_information(data, context)
          # Handle unified I/O operations - Process async storage and download operations
    if context.AssetManager and context.Actions:
        completed = context.AssetManager.process_all_completed_operations()
        
        # Process completed operations through Actions
        for op in completed:
            success = op.get('success', False)
            
            if success:
                context.Actions.handle_completed_operation(op)
            else:
                context.Actions.handle_operation_error(op)

    return sdl3.SDL_APP_CONTINUE

def handle_information(msg, context):
    """Handle incoming network messages."""
    try:      
        context.protocol.handle_message(msg)
    except Exception as e:
        logger.error(f"Error handling message: {e}")
        logger.debug(f"Problematic message: {msg[:200] if isinstance(msg, str) else str(msg)[:200]}...")

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


def start_websocket_connection_thread(context, server_url:str, session_code:str, jwt_token:str):
    """Start the WebSocket connection with authentication."""
    logger.info("Starting WebSocket connection thread...")
    print(f"Server URL: {server_url}")
    while True:
        try:
            logger.info("Creating WebSocket client...")
            websocket_client = WebSocketClient(uri=server_url, queue_to_send=context.queue_to_send, 
                                               queue_to_read=context.queue_to_read,
                                               session_code=session_code, jwt_token=jwt_token)
        except Exception as e:
            logger.error("Error creating WebSocket client: %s", e)
            time.sleep(1)
            continue
            
        try:
            logger.info("Initialise WebSocket connection...")
            websocket_client.start_from_sync_func()
        except Exception as e:
            logger.error("Error connecting WebSocket client: %s", e)           
            time.sleep(5)
            continue
                   





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
                       help='Connection type: sdl for TCP socket, webhook for HTTP/webhooks, or websocket for WebSocket connection (default: websocket)')
    parser.add_argument('--webhook-port', default='8080',
                       help='Local webhook server port (default: 8080)')    
    parser.add_argument('--server-url', default='http://127.0.0.1:12345',
                       help='Server URL for webhook/websocket connection (default: http://127.0.0.1:12345)')
    # Authentication parameters for WebSocket connections
    parser.add_argument('--session-code', default='WBCHCY',
                       help='Game session code for WebSocket connection')
    parser.add_argument('--jwt-token', default='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0IiwiZXhwIjoxNzUxMzE5Nzk0fQ.wc7q5rJul7LoELCO0B9H-KPobRA4KQDoxZqB3UIP0KI',
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
            gui_consumed = False
            if context.gui:
                gui_consumed = context.imgui.process_event(event)
            
            # if ctx.imgui.io.want_capture_mouse or ctx.imgui.io.want_capture_keyboard:
            #     gui_consumed = ctx.imgui.process_event(event)
            
            # Only process game events if ImGui didn't consume them
            if context.gui:
                if not gui_consumed:
                # Handle paint events
                    if PaintManager.handle_paint_events(event):
                        continue  # Paint system consumed the event
                
                # Handle normal game events
                    running = event_sys.handle_event(context, event)
            else:
                if PaintManager.handle_paint_events(event):
                        continue 
                running = event_sys.handle_event(context, event)
        # Render SDL content first (SDL handles its own clearing)
        SDL_AppIterate(context)
        #context.LightingManager.iterate()
        # Then render ImGui over the SDL content
        sdl3.SDL_FlushRenderer(context.renderer)
        if context.gui:
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