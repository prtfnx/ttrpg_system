// Types for our TTRPG game state
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
  sprite: Sprite;
  stats: {
    hp: number;
    maxHp: number;
    ac: number;
    speed: number;
  };
  conditions: string[];
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
  sessionId?: string;
}

export interface GameAction {
  type: 'MOVE_SPRITE' | 'SELECT_SPRITE' | 'UPDATE_CAMERA' | 'SET_CONNECTION';
  payload: any;
}

// WebSocket message types
export interface WSMessage {
  type: string;
  data: any;
  timestamp: number;
}

export interface NetworkState {
  isConnected: boolean;
  sessionId?: string;
  lastPing?: number;
}
