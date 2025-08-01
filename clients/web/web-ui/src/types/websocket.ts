// Modern WebSocket message types using discriminated unions
// Following modern TypeScript best practices with strict typing

import type { Sprite } from '../types';

// Base message structure
interface BaseMessage {
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

interface TableData {
  sprites: Partial<Sprite>[];
}

interface WelcomeData {
  session_id: string;
}

// Discriminated union of all possible WebSocket messages
export type WebSocketMessage = 
  | (BaseMessage & { type: 'sprite_add'; data: SpriteAddData })
  | (BaseMessage & { type: 'sprite_remove'; data: { id: string } })
  | (BaseMessage & { type: 'sprite_move'; data: SpriteMoveData })
  | (BaseMessage & { type: 'sprite_update'; data: SpriteUpdateData })
  | (BaseMessage & { type: 'table_data'; data: TableData })
  | (BaseMessage & { type: 'welcome'; data: WelcomeData })
  | (BaseMessage & { type: 'chat'; data: { message: string; user: string } })
  | (BaseMessage & { type: string; data?: Record<string, unknown> }); // fallback for unknown messages

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
