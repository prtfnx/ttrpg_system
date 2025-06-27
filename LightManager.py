from logger import setup_logger
import ctypes
import sdl3

logger = setup_logger(__name__)

class LightManager:
    def __init__(self, context, name="Default Light Manager"):
        self.name = name
        self.context = context
        self.lights = []
        self.dict_of_light_sprites = {}
        self.frectLight_x = context.cursor_position_x - 360.0
        self.frectLight_y = context.cursor_position_y - 360.0

    def add_light_sprite(self, light, sprite):
        """Add a sprite to a light"""
        light.set_sprite(sprite)
        self.dict_of_light_sprites[light.name] = sprite
        logger.info(f"Sprite added to light {light.name}")

    def add_light(self, light):
        self.lights.append(light)

    def remove_light(self, light):
        self.lights.remove(light)

    def turn_on_all(self):
        for light in self.lights:
            light.turn_on()

    def turn_off_all(self):
        for light in self.lights:
            light.turn_off()

    def __str__(self):
        return f"LightManager: {self.name}, Lights: {len(self.lights)}"

    def set_draw_method(self, draw_method):
        """Set a custom draw method for the lights"""
        self.draw_method = draw_method

    def draw_all_lights(self):
        """Draw all lights using the custom draw method if set"""
        try:
            if hasattr(self, 'draw_method'):
                for light in self.lights:
                    self.draw_method(light)
            else:
                for light in self.lights:
                    logger.info(f"Drawing light: {light.name}")
        except Exception as e:
            logger.error(f"Error during drawing lights: {e}")
    def clear_lights(self):
        """Clear all lights from the manager"""
        self.lights.clear()
        logger.info(f"All lights cleared from {self.name}")
    def get_light_count(self):
        """Get the current count of lights managed"""
        return len(self.lights)
    def iterate(self):
        """Iterate through all lights and perform an action"""
        try:
            for light in self.lights:
                logger.info(f"Iterating over light: {light}")
                sprite= self.dict_of_light_sprites.get(light.name)
                if sprite is None:
                    logger.warning(f"No sprite found for light: {light.name}")
                    continue

                sdl3.SDL_RenderTexture(sprite.renderer, light.sprite.texture, None, ctypes.byref(light.sprite.frect))
                # Here you can add any action you want to perform on each light
        except Exception as e:
            logger.error(f"Error during light iteration: {e}")
            raise
    def create_light_texture(self, light, path_to_image=b"resources/light.png",width=1920, height=1080):
        """test purpose: create a texture for a light"""
        renderer= self.context.renderer
        logger.info(f"Creating light texture for {light.name}")
        surface = sdl3.IMG_Load(path_to_image)
        light_texture = sdl3.SDL_CreateTextureFromSurface(renderer, surface)
        
        sdl3.SDL_SetTextureBlendMode(light_texture, sdl3.SDL_BLENDMODE_ADD)
        render_texture_light = sdl3.SDL_CreateTexture(
            renderer, sdl3.SDL_PIXELFORMAT_RGBA8888, 
            sdl3.SDL_TEXTUREACCESS_TARGET, width, height
        )
        sdl3.SDL_SetTextureBlendMode(render_texture_light, sdl3.SDL_BLENDMODE_MOD)
        render_texture= sdl3.SDL_CreateTexture(
            renderer, sdl3.SDL_PIXELFORMAT_RGBA8888, sdl3.SDL_TEXTUREACCESS_TARGET, width, height
        )
        sdl3.SDL_SetTextureBlendMode(render_texture, sdl3.SDL_BLENDMODE_MOD)
        sdl3.SDL_DestroySurface(surface)
        logger.info(f"Texture created for light {light.name} with size {width}x{height}")
        self.texture_light = light_texture
        self.render_texture_light = render_texture_light
        self.render_texture = render_texture
        self.frect_light= sdl3.SDL_FRect(
            x=self.frectLight_x, y=self.frectLight_y, 
            w=width, h=height
        )

class Light:
    def __init__(self, name):
        self.name = name
        self.is_on = False

    def turn_on(self):
        self.is_on = True
        logger.info(f"Light {self.name} turned on")

    def turn_off(self):
        self.is_on = False
        logger.info(f"Light {self.name} turned off")

    def __str__(self):
        return f"Light: {self.name}, Status: {'On' if self.is_on else 'Off'}"
    def toggle(self):
        """Toggle the light's state"""
        if self.is_on:
            self.turn_off()
        else:
            self.turn_on()
        logger.info(f"Light {self.name} toggled to {'On' if self.is_on else 'Off'}")
    def set_color(self, color):
        """Set the color of the light"""
        self.color = color
        logger.info(f"Light {self.name} color set to {color}")
    def get_color(self):
        """Get the current color of the light"""
        return getattr(self, 'color', 'No color set')
    def blink(self, times=3, interval=0.5):
        """Blink the light a specified number of times"""
        import time
        for _ in range(times):
            self.turn_on()
            time.sleep(interval)
            self.turn_off()
            time.sleep(interval)
        logger.info(f"Light {self.name} blinked {times} times")
    def fade(self, duration=1.0):
        """Fade the light in and out over a specified duration"""
        import time
        steps = 10
        interval = duration / (steps * 2)
        
        for i in range(steps):
            self.set_brightness(i / steps)
            time.sleep(interval)
        
        for i in range(steps, -1, -1):
            self.set_brightness(i / steps)
            time.sleep(interval)
        logger.info(f"Light {self.name} faded over {duration} seconds")
    def set_brightness(self, brightness):
        """Set the brightness of the light (0.0 to 1.0)"""
        self.brightness = max(0.0, min(1.0, brightness))
        logger.info(f"Light {self.name} brightness set to {self.brightness:.2f}")
    def get_brightness(self):
        """Get the current brightness of the light"""
        return getattr(self, 'brightness', 1.0)
    def is_on(self):
        """Check if the light is currently on"""
        return self.is_on
    def set_sprite(self, sprite):
        """Set a sprite for the light"""
        self.sprite = sprite
        logger.info(f"Light {self.name} sprite set to {sprite}")
