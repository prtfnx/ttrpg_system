// Types for our TTRPG game state
export interface Position {
  x: number;
  y: number;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

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
  copy_sprite: (sprite_id: string) => string | undefined;
  paste_sprite: (layer: string, sprite_json: string, offset_x: number, offset_y: number) => string;
  resize_sprite: (sprite_id: string, new_width: number, new_height: number) => boolean;
  rotate_sprite: (sprite_id: string, rotation_degrees: number) => boolean;
  load_texture: (name: string, image: HTMLImageElement) => void;
  
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
}

// Window interface extensions
declare global {
  interface Window {
    gameAPI?: GameAPI;
    rustRenderManager?: RenderEngine;
    ttrpg_rust_core?: Record<string, unknown>;
  }
}
