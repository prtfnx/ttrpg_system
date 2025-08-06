// Type declarations for WASM RenderEngine
interface RenderEngine {
  // Existing methods
  handle_mouse_down(x: number, y: number): void;
  handle_mouse_move(x: number, y: number): void;
  handle_mouse_up(x: number, y: number): void;
  handle_wheel(x: number, y: number, delta: number): void;
  get_cursor_type(x: number, y: number): string;
  
  // New multi-select methods
  handle_mouse_down_with_ctrl?(x: number, y: number, ctrlPressed: boolean): void;
  
  // Layer management
  set_layer_opacity(layerName: string, opacity: number): void;
  set_layer_visible(layerName: string, visible: boolean): void;
  
  // Sprite management
  add_sprite_to_layer(layerName: string, spriteData: any): string;
  remove_sprite(spriteId: string): boolean;
  
  // Camera controls
  set_camera(worldX: number, worldY: number, zoom: number): void;
  center_camera(worldX: number, worldY: number): void;
  resize_canvas(width: number, height: number): void;
  
  // Context menu
  handle_right_click(x: number, y: number): string | null;
  
  // Rendering
  render(): void;
}

declare global {
  interface Window {
    rustRenderManager?: RenderEngine;
    gameAPI?: {
      sendMessage: (type: string, data: any) => void;
    };
  }
}

export { };

