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
  layer: number;
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
  renderManager: () => RenderManager | null;
}

export interface RenderManager {
  resize: (width: number, height: number) => void;
  handle_mouse_down: (x: number, y: number) => void;
  handle_mouse_move: (x: number, y: number) => void;
  handle_mouse_up: (x: number, y: number) => void;
  handle_wheel: (x: number, y: number, delta: number) => void;
  screen_to_world: (x: number, y: number) => number[];
  get_drag_mode: () => string;
  add_sprite: (data: Record<string, unknown>) => void;
  render: () => void;
  center_camera_on: (x: number, y: number) => void;
  load_texture: (name: string, image: HTMLImageElement) => void;
  get_cursor_coords?: () => {
    screen: { x: number; y: number };
    world: { x: number; y: number };
  };
}

// Window interface extensions
declare global {
  interface Window {
    gameAPI?: GameAPI;
    rustRenderManager?: RenderManager;
    ttrpg_rust_core?: Record<string, unknown>;
  }
}
