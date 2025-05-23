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

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s:%(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

BASE_WIDTH: int = 1600
BASE_HEIGHT: int = 900
NET_SLEEP: float = 0.1
CHECK_INTERVAL: float = 2.0

def SDL_AppInit_func():
    """Initialize SDL window, renderer, and network client."""
    window = sdl3.SDL_CreateWindow(
        b"examp wind", BASE_WIDTH, BASE_HEIGHT, sdl3.SDL_WINDOW_RESIZABLE
    )
    if not window:
        logger.critical("Failed to create SDL window: %s", sdl3.SDL_GetError().decode())
        sys.exit(1)

    render_drivers = [sdl3.SDL_GetRenderDriver(i).decode() for i in range(sdl3.SDL_GetNumRenderDrivers())]
    render_driver = next((d for d in ["opengl", "software"] if d in render_drivers), None)
    if not render_driver:
        logger.error("No suitable render driver found.")
        sys.exit(1)

    renderer = sdl3.SDL_CreateRenderer(window, render_driver.encode())
    if not renderer:
        logger.critical("Failed to create renderer: %s", sdl3.SDL_GetError().decode())
        sys.exit(1)

    test_spell = core_table.entities.Spell(
        name="test", description="test", level=1, sprite=b"resources/magic_projectile.gif"
    )
    test_context = context.Context(renderer, window, base_width=BASE_WIDTH, base_height=BASE_HEIGHT)
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

    def init_net_thread():
        socket = client_sdl.init_connection()
        test_context.net_socket = socket

    net_thread = threading.Thread(target=init_net_thread, daemon=True)
    net_thread.start()
    test_context.net_client_started = True
    logger.info("Network client initialized.")
    return test_context

def SDL_AppEvent(event):
    if event.type == sdl3.SDL_EVENT_QUIT:
        return sdl3.SDL_APP_SUCCESS
    return sdl3.SDL_APP_CONTINUE

def SDL_AppIterate(context):
    """This function runs every frame."""
    renderer = context.renderer
    now = sdl3.SDL_GetTicks()
    delta_time = now - context.last_time
    context.last_time = now

    sdl3.SDL_SetRenderDrawColorFloat(renderer, 0, 0, 0, sdl3.SDL_ALPHA_OPAQUE_FLOAT)
    sdl3.SDL_RenderClear(renderer)
    # /* put the newly-cleared rendering on the screen. */
    sdl3.SDL_GetWindowSize(context.window, context.window_width, context.window_height)

    movement_sys.move_sprites(context, delta_time)
    movement_sys.test_margin(context)

    sdl3.SDL_RenderPresent(context.renderer)

    if not context.queue_to_read.empty():
        data = context.queue_to_read.get()
        handle_information(data, context)
    return sdl3.SDL_APP_CONTINUE

def handle_information(msg,context):
    #TODO ugly, need to be fixed. possibly use a dict to map the message to the function
    #TODO add a check for the type of message
    
    if context.waiting_for_table:
        #TODO
        context.waiting_for_table = False
        msg = json.loads(msg)
        table = context.create_table_from_json(msg)
        context.list_of_tables.append(table)
        context.current_table = table
        logger.info("Table created and changed")
    logger.info("Received message: %s", msg)
    if msg == "INITIALIZE_TABLE":
        context.waiting_for_table = True

    if msg == "hello":
        event_sys.handle_key_event(context, sdl3.SDL_SCANCODE_SPACE)

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

def main():
    """Main entry point."""
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
        while sdl3.SDL_PollEvent(ctypes.byref(event)):
            running = event_sys.handle_event(ctx, event)
        SDL_AppIterate(ctx)

    # Cleanup
    sdl3.SDL_DestroyRenderer(ctx.renderer)
    sdl3.SDL_DestroyWindow(ctx.window)
    sdl3.SDL_Quit()

if __name__ == "__main__":
    main()