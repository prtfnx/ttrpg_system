// Type declarations for WASM RenderEngine - Updated from generated bindings
export class RenderEngine {
  free(): void;
  constructor(canvas: HTMLCanvasElement);
  render(): void;
  resize_canvas(width: number, height: number): void;
  handle_wheel(screen_x: number, screen_y: number, delta_y: number): void;
  set_zoom(zoom: number): void;
  center_camera(world_x: number, world_y: number): void;
  set_camera(world_x: number, world_y: number, zoom: number): void;
  screen_to_world(screen_x: number, screen_y: number): Float64Array;
  get_cursor_type(screen_x: number, screen_y: number): string;
  handle_mouse_down(screen_x: number, screen_y: number): void;
  handle_mouse_down_with_ctrl(screen_x: number, screen_y: number, ctrl_pressed: boolean): void;
  handle_mouse_move(screen_x: number, screen_y: number): void;
  handle_mouse_up(screen_x: number, screen_y: number): void;
  add_sprite_to_layer(layer_name: string, sprite_data: any): string;
  remove_sprite(sprite_id: string): boolean;
  rotate_sprite(sprite_id: string, rotation_degrees: number): boolean;
  toggle_grid(): void;
  set_grid_enabled(enabled: boolean): void;
  toggle_grid_snapping(): void;
  set_grid_snapping(enabled: boolean): void;
  set_grid_size(size: number): void;
  get_grid_size(): number;
  is_grid_snapping_enabled(): boolean;
  load_texture(name: string, image: HTMLImageElement): void;
  set_layer_opacity(layer_name: string, opacity: number): void;
  set_layer_visible(layer_name: string, visible: boolean): void;
  handle_right_click(screen_x: number, screen_y: number): string | undefined;
  delete_sprite(sprite_id: string): boolean;
  copy_sprite(sprite_id: string): string | undefined;
  paste_sprite(layer_name: string, sprite_json: string, offset_x: number, offset_y: number): string;
  resize_sprite(sprite_id: string, new_width: number, new_height: number): boolean;
  resize(width: number, height: number): void;
  
  // Lighting system
  add_light(id: string, x: number, y: number): void;
  remove_light(id: string): void;
  set_light_color(id: string, r: number, g: number, b: number, a: number): void;
  set_light_intensity(id: string, intensity: number): void;
  set_light_radius(id: string, radius: number): void;
  toggle_light(id: string): void;
  update_light_position(id: string, x: number, y: number): void;
  turn_on_all_lights(): void;
  turn_off_all_lights(): void;
  get_light_count(): number;
  clear_lights(): void;
  
  // Fog of war system
  set_gm_mode(is_gm: boolean): void;
  add_fog_rectangle(id: string, start_x: number, start_y: number, end_x: number, end_y: number, mode: string): void;
  remove_fog_rectangle(id: string): void;
  clear_fog(): void;
  hide_entire_table(table_width: number, table_height: number): void;
  is_point_in_fog(x: number, y: number): boolean;
  get_fog_count(): number;
}

export function init_game_renderer(canvas: HTMLCanvasElement): RenderEngine;

declare global {
  interface Window {
    rustRenderManager?: RenderEngine;
    gameAPI?: {
      sendMessage: (type: string, data: any) => void;
    };
  }
}

export { };

