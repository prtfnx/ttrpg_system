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
  
  // Interactive lighting controls
  get_light_at_position(x: number, y: number): string | undefined;
  start_light_drag(light_id: string, world_x: number, world_y: number): boolean;
  update_light_drag(world_x: number, world_y: number): boolean;
  end_light_drag(): string | undefined;
  get_light_radius(light_id: string): number;
  
  // Fog of war system
  set_gm_mode(is_gm: boolean): void;
  add_fog_rectangle(id: string, start_x: number, start_y: number, end_x: number, end_y: number, mode: string): void;
  remove_fog_rectangle(id: string): void;
  clear_fog(): void;
  hide_entire_table(table_width: number, table_height: number): void;
  is_point_in_fog(x: number, y: number): boolean;
  get_fog_count(): number;
  
  // Interactive fog controls
  start_fog_draw(world_x: number, world_y: number, mode: string): string;
  update_fog_draw(rect_id: string, world_x: number, world_y: number): boolean;
  finish_fog_draw(rect_id: string): boolean;
  cancel_fog_draw(rect_id: string): void;
  get_fog_at_position(x: number, y: number): string | undefined;
  
  // Tool mode management
  set_fog_draw_mode(enabled: boolean): void;
  set_fog_erase_mode(enabled: boolean): void;
  set_light_drag_mode(enabled: boolean): void;
  is_in_fog_draw_mode(): boolean;
  is_in_light_drag_mode(): boolean;
  get_current_input_mode(): string;

  // Network integration
  get_sprite_network_data(sprite_id: string): any;
  apply_network_sprite_update(sprite_data: any): void;
  apply_network_sprite_create(sprite_data: any): string;
  apply_network_sprite_remove(sprite_id: string): boolean;
  get_all_sprites_network_data(): any[];
}

export class NetworkClient {
  free(): void;
  constructor();
  
  // Connection management
  connect(url: string): void;
  disconnect(): void;
  is_connected(): boolean;
  get_connection_state(): string;
  get_client_id(): string;
  get_username(): string | undefined;
  get_session_code(): string | undefined;
  set_user_info(user_id: number, username: string, session_code?: string, jwt_token?: string): void;
  
  // Event handlers
  set_message_handler(callback: (messageType: string, data: any) => void): void;
  set_connection_handler(callback: (state: string, error?: string) => void): void;
  set_error_handler(callback: (error: string) => void): void;
  
  // Message sending
  send_message(message_type: string, data: any): void;
  send_sprite_update(sprite_data: any): void;
  send_sprite_create(sprite_data: any): void;
  send_sprite_remove(sprite_id: string): void;
  send_table_update(table_data: any): void;
  send_ping(): void;
  
  // Authentication and session management
  authenticate(username: string, password: string): void;
  join_session(session_code: string): void;
  request_table_list(): void;
  request_player_list(): void;
  
  // Asset management
  request_asset_upload(filename: string, file_hash: string, file_size: number): void;
  request_asset_download(asset_id: string): void;
  confirm_asset_upload(asset_id: string, upload_success: boolean): void;
}

export function init_game_renderer(canvas: HTMLCanvasElement): RenderEngine;

declare global {
  interface Window {
    rustRenderManager?: RenderEngine;
    rustNetworkClient?: NetworkClient;
    gameAPI?: {
      sendMessage: (type: string, data: any) => void;
    };
  }
}

export { };

