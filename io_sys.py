import sdl3
import ctypes
import logging

logger = logging.getLogger(__name__)

def load_texture(sprite):
    """Load a texture for the given sprite."""
    surface = sdl3.IMG_Load(sprite.texture_path)
    logger.info("Loading texture: %s", sprite.texture_path)
    try:
        if not surface or not surface.contents:
            logger.error("Couldn't load bitmap: %s", sdl3.SDL_GetError())
            return None
    except ValueError as e:
        logger.error("Error loading surface: %s", e)
        return None
    sdl3.SDL_GetSurfaceClipRect(surface, ctypes.byref(sprite.rect))
    sdl3.SDL_RectToFRect(ctypes.byref(sprite.rect), ctypes.byref(sprite.frect))
    logger.debug("Sprite frect width: %s", sprite.frect.w)
    texture = sdl3.SDL_CreateTextureFromSurface(sprite.renderer, surface)
    sprite.set_original_size()
    sdl3.SDL_DestroySurface(surface)
    return texture
