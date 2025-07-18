// Core game types
export interface Position {
  x: number;
  y: number;
}

export interface Sprite {
  id: string;
  name: string;
  position: Position;
  width: number;
  height: number;
  imageUrl: string;
  layer: number;
  visible: boolean;
}

export interface GameState {
  sprites: Sprite[];
  selectedSpriteId: string | null;
  cameraPosition: Position;
  cameraZoom: number;
  gridSize: number;
  gridVisible: boolean;
}

export interface WebSocketMessage {
  type: string;
  data: any;
}

export interface GameSettings {
  serverUrl: string;
  gameId: string;
  playerId: string;
}
