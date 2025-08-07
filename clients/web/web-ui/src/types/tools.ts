// Enhanced tool system types for the TTRPG client

export type ToolType = 
  | 'select'      // Default selection tool
  | 'move'        // Move tool for panning
  | 'measure'     // Measurement tool
  | 'paint'       // Drawing/painting tool
  | 'rectangle'   // Create rectangle sprites
  | 'circle'      // Create circle sprites
  | 'line'        // Create line sprites
  | 'text'        // Create text sprites
  | 'align';      // Alignment helper tool

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
