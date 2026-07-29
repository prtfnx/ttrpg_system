import { useGameStore } from '@/store';
import type { RenderEngine } from '@lib/wasm/runtime';
import { useRenderEngine } from '@lib/wasm/runtime';
import { logger } from '@shared/utils/logger';
import { Check, X } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import styles from './TextSpriteTool.module.css';

interface TextSpriteToolProps {
  activeLayer: string;
  activeTool: string | null;
  onSpriteCreated?: (spriteId: string) => void;
  onError?: (error: Error) => void;
}

interface InlineTextEditorProps {
  worldPosition: { x: number; y: number };
  renderEngine: RenderEngine;
  onComplete: (text: string, fontSize: number, color: string) => void;
  onCancel: () => void;
}

function InlineTextEditor({ worldPosition, renderEngine, onComplete, onCancel }: InlineTextEditorProps) {
  const [text, setText] = useState('');
  const [fontSize, setFontSize] = useState(16);  // Default 16px (0.5 multiplier)
  const [color, setColor] = useState('#ffffff');
  const [screenPos, setScreenPos] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Convert world coords to screen coords — retry until rustRenderManager is ready
  useEffect(() => {
    let cancelled = false;
    let retryId: ReturnType<typeof setTimeout> | null = null;

    const tryConvert = () => {
      const canvas = document.querySelector('.game-canvas') as HTMLCanvasElement;

      if (!canvas) {
        if (!cancelled) retryId = setTimeout(tryConvert, 100);
        return;
      }

      try {
        const rect = canvas.getBoundingClientRect();
        const screenCoords = renderEngine.world_to_screen(worldPosition.x, worldPosition.y);

        logger.debug('[InlineTextEditor] Converting coords', {
          world: worldPosition,
          screen: screenCoords,
          canvasRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
        });

        // Validate screen coordinates
        if (screenCoords && screenCoords.length >= 2 &&
            !isNaN(screenCoords[0]) && !isNaN(screenCoords[1])) {
          const finalX = rect.left + screenCoords[0];
          const finalY = rect.top + screenCoords[1];

          logger.debug('[InlineTextEditor] Final screen position', { x: finalX, y: finalY });

          if (!cancelled) setScreenPos({ x: finalX, y: finalY });
        } else {
          logger.error('[InlineTextEditor] Invalid screen coords', { screenCoords });
        }
      } catch (error) {
        logger.error('[InlineTextEditor] Error converting coords', error);
      }
    };

    tryConvert();
    return () => {
      cancelled = true;
      if (retryId !== null) clearTimeout(retryId);
    };
  }, [renderEngine, worldPosition]);

  // Auto-focus input
  useEffect(() => {
    if (screenPos && inputRef.current) {
      inputRef.current.focus();
    }
  }, [screenPos]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (text.trim()) {
          onComplete(text.trim(), fontSize, color);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [text, fontSize, color, onComplete, onCancel]);

  if (!screenPos) return null;

  return (
    <>
      {/* Floating toolbar above input - centered */}
      <div
        className={styles.toolbar}
        style={{
          '--editor-x': `${screenPos.x}px`,
          '--toolbar-y': `${screenPos.y - 50}px`,
        } as CSSProperties}
      >
        <label className={styles.controlLabel}>
          Size:
          <input
            type="range"
            min="12"
            max="48"
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            className={styles.sizeSlider}
          />
          <span className={styles.sizeValue}>{fontSize}px</span>
        </label>
        
        <label className={styles.controlLabel}>
          Color:
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className={styles.colorInput}
          />
        </label>
        
        <button
          onClick={() => text.trim() && onComplete(text.trim(), fontSize, color)}
          aria-label="Confirm"
          className={`${styles.toolbarButton} ${styles.confirmButton}`}
        >
          <Check size={14} aria-hidden />
        </button>
        <button
          onClick={onCancel}
          aria-label="Cancel"
          className={`${styles.toolbarButton} ${styles.cancelButton}`}
        >
          <X size={14} aria-hidden />
        </button>
      </div>

      {/* Inline text input - centered to match Rust text rendering */}
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type text..."
        className={styles.textInput}
        style={{
          '--editor-x': `${screenPos.x}px`,
          '--editor-y': `${screenPos.y}px`,
          '--editor-font-size': `${fontSize}px`,
          '--editor-color': color,
        } as CSSProperties}
      />
    </>
  );
}

export function TextSpriteTool({ 
  activeLayer,
  activeTool,
  onSpriteCreated,
  onError 
}: TextSpriteToolProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [clickPosition, setClickPosition] = useState<{ x: number; y: number } | null>(null);
  const { setActiveTool } = useGameStore();
  const renderEngine = useRenderEngine();

  // Listen for map clicks when text tool is active
  useEffect(() => {
    if (activeTool !== 'text') {
      setShowDialog(false);
      setClickPosition(null);
      return;
    }

    const handleMapClick = (event: CustomEvent) => {
      const { x, y } = event.detail;
      logger.debug('[TextSpriteTool] Received textSpriteClick event', { x, y });
      setClickPosition({ x, y });
      setShowDialog(true);
    };

    logger.debug('[TextSpriteTool] Registering textSpriteClick event listener');
    window.addEventListener('textSpriteClick' as keyof WindowEventMap, handleMapClick as EventListener);

    return () => {
      logger.debug('[TextSpriteTool] Removing textSpriteClick event listener');
      window.removeEventListener('textSpriteClick' as keyof WindowEventMap, handleMapClick as EventListener);
    };
  }, [activeTool]);

  const handleComplete = (text: string, fontSize: number, color: string) => {
    if (!clickPosition) {
      logger.error('[TextSpriteTool] No click position available');
      return;
    }

    try {
      if (!renderEngine) {
        throw new Error('Rust render manager not available');
      }

      // Convert font size from pixels to multiplier for Rust renderer
      // The bitmap font atlas has 32px base size, so:
      // 16px = 0.5, 24px = 0.75, 32px = 1.0, 48px = 1.5
      const sizeMultiplier = fontSize / 32.0;

      logger.debug('[TextSpriteTool] Creating text sprite', {
        text,
        position: clickPosition,
        fontSize,
        sizeMultiplier,
        color,
        layer: activeLayer
      });

      // Call Rust function to create text sprite directly in WebGL
      const rm = renderEngine as unknown as { create_text_sprite: (text: string, x: number, y: number, size: number, color: string, layer: string) => string };
      const spriteId = rm.create_text_sprite(
        text,
        clickPosition.x,
        clickPosition.y,
        sizeMultiplier,  // Use multiplier, not pixel size
        color,
        activeLayer || 'tokens'
      );

      logger.info('[TextSpriteTool] Successfully created text sprite', { spriteId });
      onSpriteCreated?.(spriteId);
      
      // Auto-switch to select tool after creating text
      setActiveTool('select');
      
      setShowDialog(false);
      setClickPosition(null);
    } catch (error) {
      logger.error('[TextSpriteTool] Error creating text sprite', error);
      const err = error instanceof Error ? error : new Error('Unknown error');
      onError?.(err);
    }
  };

  const handleCancel = () => {
    setShowDialog(false);
    setClickPosition(null);
  };

  return showDialog && clickPosition && renderEngine ? (
    <InlineTextEditor
      worldPosition={clickPosition}
      renderEngine={renderEngine}
      onComplete={handleComplete}
      onCancel={handleCancel}
    />
  ) : null;
}

export default TextSpriteTool;
