import type { TextSpriteConfig } from './TextSpriteCreator';

/**
 * Utility functions for creating and managing text sprites in the game
 */

export interface TextSpriteData {
  id: string;
  type: 'text';
  [key: string]: unknown;
  text: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  color: string;
  backgroundColor?: string;
  hasBackground: boolean;
  textAlign: 'left' | 'center' | 'right';
  opacity: number;
  rotation: number;
  borderWidth?: number;
  borderColor?: string;
  hasBorder: boolean;
  padding: number;
  lineHeight: number;
  letterSpacing: number;
  textShadow: boolean;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  layer: string;
  textureId: string;
}

export interface RenderResult {
  canvas: HTMLCanvasElement;
  textureId: string;
  width: number;
  height: number;
}

/**
 * Renders text sprite to a canvas and returns rendering data
 */
export function renderTextSprite(
  config: TextSpriteConfig,
  spriteId: string
): Promise<RenderResult> {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Failed to get 2D rendering context'));
        return;
      }

      // Calculate text metrics
      const font = `${config.fontWeight} ${config.fontSize}px ${config.fontFamily}`;
      ctx.font = font;
      
      const lines = config.text.split('\n');
      const lineHeight = config.fontSize * config.lineHeight;
      const textMetrics = lines.map((line: string) => ctx.measureText(line));
      const maxWidth = Math.max(...textMetrics.map((m: TextMetrics) => m.width));
      const textHeight = lines.length * lineHeight;

      // Calculate canvas dimensions with padding
      const totalPadding = config.padding * 2;
      const borderOffset = config.hasBorder ? config.borderWidth * 2 : 0;
      const canvasWidth = Math.max(50, maxWidth + totalPadding + borderOffset);
      const canvasHeight = Math.max(30, textHeight + totalPadding + borderOffset);

      // Set canvas size with device pixel ratio for crisp rendering
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvasWidth * dpr;
      canvas.height = canvasHeight * dpr;
      canvas.style.width = `${canvasWidth}px`;
      canvas.style.height = `${canvasHeight}px`;
      
      // Scale context for high DPI displays
      ctx.scale(dpr, dpr);

      // Clear canvas
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      // Apply rotation transform
      if (config.rotation !== 0) {
        ctx.save();
        ctx.translate(canvasWidth / 2, canvasHeight / 2);
        ctx.rotate((config.rotation * Math.PI) / 180);
        ctx.translate(-canvasWidth / 2, -canvasHeight / 2);
      }

      // Draw background
      if (config.hasBackground) {
        ctx.fillStyle = config.backgroundColor;
        ctx.globalAlpha = config.opacity;
        const bgX = config.hasBorder ? config.borderWidth : 0;
        const bgY = config.hasBorder ? config.borderWidth : 0;
        const bgWidth = canvasWidth - (config.hasBorder ? config.borderWidth * 2 : 0);
        const bgHeight = canvasHeight - (config.hasBorder ? config.borderWidth * 2 : 0);
        ctx.fillRect(bgX, bgY, bgWidth, bgHeight);
      }

      // Draw border
      if (config.hasBorder) {
        ctx.strokeStyle = config.borderColor;
        ctx.lineWidth = config.borderWidth;
        ctx.globalAlpha = config.opacity;
        ctx.strokeRect(
          config.borderWidth / 2, 
          config.borderWidth / 2, 
          canvasWidth - config.borderWidth, 
          canvasHeight - config.borderWidth
        );
      }

      // Configure text rendering
      ctx.font = font;
      ctx.fillStyle = config.color;
      ctx.globalAlpha = config.opacity;
      ctx.textBaseline = 'top';

      // Apply text shadow
      if (config.textShadow) {
        ctx.shadowColor = config.shadowColor;
        ctx.shadowBlur = config.shadowBlur;
        ctx.shadowOffsetX = config.shadowOffsetX;
        ctx.shadowOffsetY = config.shadowOffsetY;
      } else {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }

      // Apply letter spacing if supported
      if (config.letterSpacing !== 0 && 'letterSpacing' in ctx) {
        (ctx as any).letterSpacing = `${config.letterSpacing}px`;
      }

      // Draw text lines
      const startX = config.padding + (config.hasBorder ? config.borderWidth : 0);
      const startY = config.padding + (config.hasBorder ? config.borderWidth : 0);

      lines.forEach((line: string, index: number) => {
        let x = startX;
        const y = startY + (index * lineHeight);

        // Apply text alignment
        if (config.textAlign === 'center') {
          x = (canvasWidth - ctx.measureText(line).width) / 2;
        } else if (config.textAlign === 'right') {
          x = canvasWidth - startX - ctx.measureText(line).width;
        }

        ctx.fillText(line, x, y);
      });

      // Restore transformation if rotation was applied
      if (config.rotation !== 0) {
        ctx.restore();
      }

      const textureId = `text_${spriteId}_${Date.now()}`;
      
      resolve({
        canvas,
        textureId,
        width: canvasWidth,
        height: canvasHeight
      });

    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Creates a text sprite and adds it to the game
 */
export async function createTextSprite(
  config: TextSpriteConfig,
  position: { x: number; y: number },
  layer: string,
  onSuccess?: (spriteId: string) => void,
  onError?: (error: Error) => void
): Promise<string> {
  try {
    const spriteId = `text_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Render the text sprite to canvas
    const renderResult = await renderTextSprite(config, spriteId);

    // Create network payload for server synchronization
    const networkPayload: TextSpriteData = {
      id: spriteId,
      type: 'text',
      text: config.text,
      fontSize: config.fontSize,
      fontFamily: config.fontFamily,
      fontWeight: config.fontWeight,
      color: config.color,
      backgroundColor: config.hasBackground ? config.backgroundColor : undefined,
      hasBackground: config.hasBackground,
      textAlign: config.textAlign,
      opacity: config.opacity,
      rotation: config.rotation,
      borderWidth: config.hasBorder ? config.borderWidth : undefined,
      borderColor: config.hasBorder ? config.borderColor : undefined,
      hasBorder: config.hasBorder,
      padding: config.padding,
      lineHeight: config.lineHeight,
      letterSpacing: config.letterSpacing,
      textShadow: config.textShadow,
      shadowColor: config.textShadow ? config.shadowColor : undefined,
      shadowBlur: config.textShadow ? config.shadowBlur : undefined,
      shadowOffsetX: config.textShadow ? config.shadowOffsetX : undefined,
      shadowOffsetY: config.textShadow ? config.shadowOffsetY : undefined,
      x: position.x,
      y: position.y,
      width: renderResult.width,
      height: renderResult.height,
      layer,
      textureId: renderResult.textureId
    };

    // Send to server via protocol if available
    if (window.gameAPI && window.gameAPI.sendMessage) {
      console.log('[TextSprite] Sending sprite_create:', networkPayload);
      window.gameAPI.sendMessage('sprite_create', networkPayload);
    } else {
      console.warn('[TextSprite] window.gameAPI.sendMessage not available');
    }

    // Load texture into WASM renderer for immediate display
    const img = new Image();
    img.onload = () => {
      try {
        // Load texture into WASM texture manager
        if ((window as any).rustRenderManager && (window as any).rustRenderManager.load_texture) {
          (window as any).rustRenderManager.load_texture(renderResult.textureId, img);
        }

        // Create WASM sprite payload for local rendering
        const wasmSprite = {
          id: spriteId,
          world_x: position.x,
          world_y: position.y,
          width: renderResult.width,
          height: renderResult.height,
          scale_x: 1,
          scale_y: 1,
          rotation: config.rotation,
          layer,
          texture_id: renderResult.textureId,
          tint_color: [1, 1, 1, config.opacity],
        };

        // Add sprite to layer for immediate display
        if ((window as any).rustRenderManager && 
            typeof (window as any).rustRenderManager.add_sprite_to_layer === 'function') {
          (window as any).rustRenderManager.add_sprite_to_layer(layer, wasmSprite);
        }

        onSuccess?.(spriteId);
      } catch (error) {
        console.error('[TextSprite] Failed to load texture into WASM:', error);
        onError?.(error instanceof Error ? error : new Error('Unknown error'));
      }
    };

    img.onerror = (error) => {
      const err = new Error('Failed to load text sprite image');
      console.error('[TextSprite] Image load error:', error);
      onError?.(err);
    };

    // Convert canvas to data URL
    img.src = renderResult.canvas.toDataURL('image/png');

    return spriteId;

  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    console.error('[TextSprite] Failed to create text sprite:', err);
    onError?.(err);
    throw err;
  }
}

/**
 * Updates an existing text sprite
 */
export async function updateTextSprite(
  spriteId: string,
  config: TextSpriteConfig,
  position: { x: number; y: number },
  layer: string
): Promise<void> {
  try {
    // Remove existing sprite
    if ((window as any).rustRenderManager && (window as any).rustRenderManager.delete_sprite) {
      (window as any).rustRenderManager.delete_sprite(spriteId);
    }

    // Create updated sprite with same ID
    const renderResult = await renderTextSprite(config, spriteId);

    // Send update to server
    const updatePayload = {
      id: spriteId,
      type: 'sprite_update',
      x: position.x,
      y: position.y,
      width: renderResult.width,
      height: renderResult.height,
      textureId: renderResult.textureId,
      // Include all text-specific properties for full update
      text: config.text,
      fontSize: config.fontSize,
      fontFamily: config.fontFamily,
      color: config.color,
      rotation: config.rotation
    };

    if (window.gameAPI && window.gameAPI.sendMessage) {
      window.gameAPI.sendMessage('sprite_update', updatePayload);
    }

    // Re-add to local renderer
    const img = new Image();
    img.onload = () => {
      if ((window as any).rustRenderManager) {
        (window as any).rustRenderManager.load_texture(renderResult.textureId, img);
        
        const wasmSprite = {
          id: spriteId,
          world_x: position.x,
          world_y: position.y,
          width: renderResult.width,
          height: renderResult.height,
          scale_x: 1,
          scale_y: 1,
          rotation: config.rotation,
          layer,
          texture_id: renderResult.textureId,
          tint_color: [1, 1, 1, config.opacity],
        };

        (window as any).rustRenderManager.add_sprite_to_layer(layer, wasmSprite);
      }
    };

    img.src = renderResult.canvas.toDataURL('image/png');

  } catch (error) {
    console.error('[TextSprite] Failed to update text sprite:', error);
    throw error;
  }
}

/**
 * Deletes a text sprite from the game
 */
export function deleteTextSprite(spriteId: string): void {
  try {
    // Remove from local renderer
    if ((window as any).rustRenderManager && (window as any).rustRenderManager.delete_sprite) {
      (window as any).rustRenderManager.delete_sprite(spriteId);
    }

    // Send delete to server
    if (window.gameAPI && window.gameAPI.sendMessage) {
      window.gameAPI.sendMessage('sprite_delete', { id: spriteId });
    }
  } catch (error) {
    console.error('[TextSprite] Failed to delete text sprite:', error);
  }
}