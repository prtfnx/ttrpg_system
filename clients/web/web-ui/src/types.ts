// Types for our TTRPG game state
export interface Position {
  x: number;
  y: number;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Sprite {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  imageUrl?: string;
  isSelected: boolean;
  isVisible: boolean;
  layer: string;
}

export interface Character {
  id: string;
  name: string;
  race: string;
  class: string;
  level: number;
  sprite: Sprite;
  stats: {
    hp: number;
    maxHp: number;
    ac: number;
    speed: number;
  };
  conditions: string[];
  inventory: string[];
}

export interface GameState {
  sprites: Sprite[];
  characters: Character[];
  selectedSprites: string[];
  camera: {
    x: number;
    y: number;
    zoom: number;
  };
  isConnected: boolean;
  connectionState: ConnectionState;
  sessionId?: string;
}

export interface GameAction {
  type: 'MOVE_SPRITE' | 'SELECT_SPRITE' | 'UPDATE_CAMERA' | 'SET_CONNECTION';
  payload: Record<string, unknown>;
}

// WebSocket message types
export interface WSMessage {
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export interface NetworkState {
  isConnected: boolean;
  sessionId?: string;
  lastPing?: number;
}

// Enhanced Character interface with all D&D 5e properties
export interface CharacterStats {
  hp: number;
  maxHp: number;
  ac: number;
  speed: number;
}

export interface CharacterAbilities {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

export interface DetailedCharacter extends Character {
  background?: string;
  abilities?: CharacterAbilities;
  skills?: string[];
  languages?: string[];
  personality?: string;
  bio?: string;
  image?: string;
  actions?: string[];
}

// Game API interface for window object
export interface GameAPI {
  sendMessage: (type: string, data: Record<string, unknown>) => void;
  renderManager: () => RenderEngine | null;
}

// WASM Bridge interface for bidirectional communication
export interface WasmBridge {
  onSpriteOperationComplete: (operation: string, spriteId: string, data: any) => void;
  sendNetworkUpdate: (updateType: string, data: any) => void;
  onError: (operation: string, error: string) => void;
}

export interface RenderEngine {
  // Core rendering
  render: () => void;
  resize: (width: number, height: number) => void;
  
  // Camera control
  set_camera: (world_x: number, world_y: number, zoom: number) => void;
  screen_to_world: (screen_x: number, screen_y: number) => number[];
  
  // Sprite management
  add_sprite_to_layer: (layer: string, sprite_data: Record<string, unknown>) => string;
  delete_sprite: (sprite_id: string) => boolean;
  remove_sprite_from_layer: (layer: string, sprite_id: string) => boolean;
  copy_sprite: (sprite_id: string) => string | undefined;
  paste_sprite: (layer: string, sprite_json: string, offset_x: number, offset_y: number) => string;
  resize_sprite: (sprite_id: string, new_width: number, new_height: number) => boolean;
  rotate_sprite: (sprite_id: string, rotation_degrees: number) => boolean;
  load_texture: (name: string, image: HTMLImageElement) => void;
  
  // Network synchronization (table sync)
  send_sprite_move: (sprite_id: string, x: number, y: number) => string;
  send_sprite_scale: (sprite_id: string, scale_x: number, scale_y: number) => string;
  send_sprite_rotate: (sprite_id: string, rotation: number) => string;
  
  // Layer management
  set_layer_opacity: (layer: string, opacity: number) => void;
  set_layer_visible: (layer: string, visible: boolean) => void;
  toggle_grid: () => void;
  
  // Grid system
  set_grid_enabled: (enabled: boolean) => void;
  set_grid_snapping: (enabled: boolean) => void;
  set_grid_size: (size: number) => void;
  toggle_grid_snapping: () => void;
  get_grid_size: () => number;
  is_grid_snapping_enabled: () => boolean;
  
  // Input handling
  handle_mouse_down: (screen_x: number, screen_y: number) => void;
  handle_mouse_move: (screen_x: number, screen_y: number) => void;
  handle_mouse_up: (screen_x: number, screen_y: number) => void;
  handle_wheel: (screen_x: number, screen_y: number, delta: number) => void;
  handle_right_click: (screen_x: number, screen_y: number) => string | undefined;
  
  // Cursor management
  get_cursor_type: (screen_x: number, screen_y: number) => string;
  
  // Lighting system
  add_light: (id: string, x: number, y: number) => void;
  remove_light: (id: string) => void;
  set_light_color: (id: string, r: number, g: number, b: number, a: number) => void;
  set_light_intensity: (id: string, intensity: number) => void;
  set_light_radius: (id: string, radius: number) => void;
  toggle_light: (id: string) => void;
  update_light_position: (id: string, x: number, y: number) => void;
  turn_on_all_lights: () => void;
  turn_off_all_lights: () => void;
  get_light_count: () => number;
  clear_lights: () => void;
  
  // Fog of War system
  set_gm_mode: (is_gm: boolean) => void;
  add_fog_rectangle: (id: string, start_x: number, start_y: number, end_x: number, end_y: number, mode: string) => void;
  remove_fog_rectangle: (id: string) => void;
  clear_fog: () => void;
  hide_entire_table: (table_width: number, table_height: number) => void;
  is_point_in_fog: (x: number, y: number) => boolean;
  get_fog_count: () => number;
  
  // Paint system
  paint_enter_mode: (width: number, height: number) => void;
  paint_exit_mode: () => void;
  paint_is_mode: () => boolean;
  paint_set_brush_color: (r: number, g: number, b: number, a: number) => void;
  paint_set_brush_size: (size: number) => void;
  paint_start_stroke: (x: number, y: number) => void;
  paint_continue_stroke: (x: number, y: number) => void;
  paint_end_stroke: () => void;
  paint_undo: () => void;
  paint_redo: () => void;
  paint_clear: () => void;
  paint_save_strokes_as_sprites: (layerName: string) => string[];
  
  // Input mode control
  set_input_mode_measurement: () => void;
  set_input_mode_create_rectangle: () => void;
  set_input_mode_create_circle: () => void;
  set_input_mode_create_line: () => void;
  set_input_mode_create_text: () => void;
  set_input_mode_select: () => void;
  set_input_mode_paint: () => void;
  get_current_input_mode: () => string;
  
  // Sprite information
  get_all_sprites_network_data: () => any[];
  get_sprites_by_layer: (layer: string) => any;
  get_sprite_info: (sprite_id: string) => any;
}

// Window interface extensions
declare global {
  interface Window {
    gameAPI?: GameAPI;
    rustRenderManager?: RenderEngine;
    wasmBridge?: WasmBridge;
    // ttrpg_rust_core type is defined in wasmManager.ts
  }
}
