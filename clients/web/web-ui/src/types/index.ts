export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface Sprite {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  texture_path: string;
  layer: string;
}

export interface Light {
  id: string;
  x: number;
  y: number;
  color: Color;
  intensity: number;
  radius: number;
  isOn: boolean;
}

export interface FogRectangle {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  mode: 'hide' | 'reveal';
}

// Re-export WASM types
export * from './wasm';
