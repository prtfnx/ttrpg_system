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
  id: string; // sprite_id
  name: string; // display name for the sprite
  tableId: string;
  characterId?: string; // References Character.id (optional)
  controlledBy?: string[]; // User IDs who can control this token
  x: number;
  y: number;
  layer: string;
  texture: string;
  scale: { x: number; y: number };
  rotation: number;
  // Token stats (independent of character)
  hp?: number;
  maxHp?: number;
  ac?: number;
  auraRadius?: number;
  syncStatus?: 'local' | 'syncing' | 'synced' | 'error';
}

export interface Character {
  id: string; // character_id
  sessionId: string;
  name: string;
  ownerId: number;
  controlledBy: number[];
  data: any; // D&D 5e structure, see architecture
  version: number;
  lastModifiedBy?: number;
  createdAt: string;
  updatedAt: string;
  syncStatus?: 'local' | 'syncing' | 'synced' | 'error';
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
  renderManager: () => import('@lib/wasm/wasm').RenderEngine | null;
}

// WASM Bridge interface for bidirectional communication
export interface WasmBridge {
  onSpriteOperationComplete: (operation: string, spriteId: string, data: any) => void;
  sendNetworkUpdate: (updateType: string, data: any) => void;
  onError: (operation: string, error: string) => void;
}

// Note: Window interface extensions are in types/index.ts

// =================================================================
// TOOL SYSTEM TYPES
// =================================================================

// Enhanced tool system types for the TTRPG client
export type ToolType = 
  | 'select'        // Default selection tool
  | 'move'          // Move tool for panning
  | 'measure'       // Measurement tool
  | 'paint'         // Drawing/painting tool
  | 'rectangle'     // Create rectangle sprites
  | 'circle'        // Create circle sprites
  | 'line'          // Create line sprites
  | 'text'          // Create text sprites
  | 'align'         // Alignment helper tool
  | 'draw_shapes'   // Drawing shapes tool
  | 'spell_templates'; // Spell templates tool

export interface ToolState {
  activeTool: ToolType;
  measurementActive: boolean;
  measurementStart?: { x: number; y: number };
  measurementEnd?: { x: number; y: number };
  
  // Creation tools state
  creationSize: { width: number; height: number };
  creationColor: string;
  creationOpacity: number;
  
  // Alignment helpers
  alignmentGuides: boolean;
  snapToSprites: boolean;
  
  // Paint tool
  brushSize: number;
  brushColor: string;
}

export interface MeasurementResult {
  distance: number;
  angle: number;
  gridUnits: number;
  screenPixels: number;
}

export interface AlignmentGuide {
  type: 'horizontal' | 'vertical';
  position: number;
  sprites: string[]; // IDs of sprites that create this guide
}

export interface SpriteCreationTemplate {
  type: 'rectangle' | 'circle' | 'line' | 'text';
  width: number;
  height: number;
  color: string;
  opacity: number;
  textContent?: string;
  fontSize?: number;
}

// =================================================================
// WEBSOCKET MESSAGE TYPES
// =================================================================

// Modern WebSocket message types using discriminated unions
// Following modern TypeScript best practices with strict typing

// Base message structure
interface BaseWSMessage {
  type: string;
  client_id?: string;
  timestamp?: number;
  version?: string;
  priority?: number;
  sequence_id?: number;
}

// Specific message data types
interface SpriteAddData {
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

interface SpriteMoveData {
  id: string;
  x: number;
  y: number;
}

interface SpriteUpdateData extends Partial<Sprite> {
  id: string;
}

interface TableWSData {
  sprites: Partial<Sprite>[];
}

interface WelcomeData {
  session_id: string;
}

// Discriminated union of all possible WebSocket messages
export type WebSocketMessage = 
  | (BaseWSMessage & { type: 'sprite_add'; data: SpriteAddData })
  | (BaseWSMessage & { type: 'sprite_remove'; data: { id: string } })
  | (BaseWSMessage & { type: 'sprite_move'; data: SpriteMoveData })
  | (BaseWSMessage & { type: 'sprite_update'; data: SpriteUpdateData })
  | (BaseWSMessage & { type: 'table_data'; data: TableWSData })
  | (BaseWSMessage & { type: 'welcome'; data: WelcomeData })
  | (BaseWSMessage & { type: 'chat'; data: { message: string; user: string } })
  | (BaseWSMessage & { type: string; data?: Record<string, unknown> }); // fallback for unknown messages

// Utility type to extract data type from message type
export type MessageData<T extends WebSocketMessage['type']> = 
  Extract<WebSocketMessage, { type: T }>['data'];

// Type guards for runtime type checking
export function isWebSocketMessage(obj: unknown): obj is WebSocketMessage {
  return (
    typeof obj === 'object' && 
    obj !== null && 
    'type' in obj && 
    typeof (obj as { type: unknown }).type === 'string'
  );
}

export function hasMessageData<T extends WebSocketMessage['type']>(
  message: WebSocketMessage,
  type: T
): message is Extract<WebSocketMessage, { type: T }> {
  return message.type === type && 'data' in message;
}

// =================================================================
// GLOBAL WINDOW EXTENSIONS
// =================================================================

declare global {
  interface Window {
    gameAPI?: GameAPI;
    rustRenderManager?: import('@lib/wasm/wasm').RenderEngine;
    wasmBridge?: WasmBridge;
    protocol?: any; // Protocol service instance
  }
}
