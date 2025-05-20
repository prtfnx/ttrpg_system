import sys
import sdl3
import sdl3_ttf

# Initialize SDL and TTF
sdl3.init(sdl3.InitFlags.VIDEO)
sdl3_ttf.init()

# Window settings
WIDTH, HEIGHT = 800, 600
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
RED = (220, 0, 0)
GRAY = (200, 200, 200)

window = sdl3.create_window(b"D&D Character Screen", WIDTH, HEIGHT, sdl3.WindowFlags.SHOWN)
renderer = window.create_renderer()

# Load font
FONT_PATH = sdl3_ttf.get_default_font_path()
font = sdl3_ttf.open_font(FONT_PATH, 24)

# Character fields
fields = [
    {"label": "Name", "value": "", "rect": sdl3.Rect(150, 50, 500, 40)},
    {"label": "Class", "value": "", "rect": sdl3.Rect(150, 110, 500, 40)},
    {"label": "Race", "value": "", "rect": sdl3.Rect(150, 170, 500, 40)},
    {"label": "Level", "value": "", "rect": sdl3.Rect(150, 230, 500, 40)},
    {"label": "HP", "value": "", "rect": sdl3.Rect(150, 290, 500, 40)},
]
active_field = 0

def render_text(text, color, rect):
    surf = sdl3_ttf.render_utf8_solid(font, text, color)
    tex = renderer.create_texture_from_surface(surf)
    tex_w, tex_h = surf.w, surf.h
    dst = sdl3.Rect(rect.x + 10, rect.y + (rect.h - tex_h)//2, tex_w, tex_h)
    renderer.copy(tex, None, dst)
    tex.destroy()
    surf.destroy()

def draw_screen():
    renderer.set_draw_color(*WHITE)
    renderer.clear()
    for idx, field in enumerate(fields):
        # Draw field box
        color = RED if idx == active_field else GRAY
        renderer.set_draw_color(*color)
        renderer.fill_rect(field["rect"])
        renderer.set_draw_color(*BLACK)
        renderer.draw_rect(field["rect"])
        # Draw label
        render_text(field["label"] + ":", BLACK, sdl3.Rect(field["rect"].x - 120, field["rect"].y, 110, field["rect"].h))
        # Draw value
        render_text(field["value"], BLACK, field["rect"])
    renderer.present()

def handle_event(event):
    global active_field
    if event.type == sdl3.SDL_EVENT_KEY_DOWN:
        key = event.key.keysym.sym
        if key == sdl3.SDLK_TAB:
            active_field = (active_field + 1) % len(fields)
        elif key == sdl3.SDLK_BACKSPACE:
            fields[active_field]["value"] = fields[active_field]["value"][:-1]
        elif key == sdl3.SDLK_RETURN:
            active_field = (active_field + 1) % len(fields)
        elif 32 <= key <= 126:  # Printable ASCII
            fields[active_field]["value"] += chr(key)
    elif event.type == sdl3.SDL_EVENT_QUIT:
        return False
    return True

def main():
    running = True
    while running:
        for event in sdl3.poll_events():
            if not handle_event(event):
                running = False
        draw_screen()
        sdl3.delay(16)
    font.close()
    sdl3_ttf.quit()
    sdl3.quit()
    sys.exit()

if __name__ == "__main__":
    main()