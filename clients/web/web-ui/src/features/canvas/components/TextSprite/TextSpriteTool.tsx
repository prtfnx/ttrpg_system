import { useGameStore } from '@/store';
import { useEffect, useRef, useState } from 'react';

interface TextSpriteToolProps {
  activeLayer: string;
  activeTool: string | null;
  onSpriteCreated?: (spriteId: string) => void;
  onError?: (error: Error) => void;
}

interface InlineTextEditorProps {
  worldPosition: { x: number; y: number };
  onComplete: (text: string, fontSize: number, color: string) => void;
  onCancel: () => void;
}

function InlineTextEditor({ worldPosition, onComplete, onCancel }: InlineTextEditorProps) {
  const [text, setText] = useState('');
  const [fontSize, setFontSize] = useState(16);  // Default 16px (0.5 multiplier)
  const [color, setColor] = useState('#ffffff');
  const [screenPos, setScreenPos] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Convert world coords to screen coords
  useEffect(() => {
    const rustManager = (window as any).rustRenderManager;
    const canvas = document.querySelector('.game-canvas') as HTMLCanvasElement;
    
    if (!rustManager || !canvas) {
      console.error('[InlineTextEditor] Missing rustManager or canvas');
      return;
    }

    try {
      const rect = canvas.getBoundingClientRect();
      const screenCoords = rustManager.world_to_screen(worldPosition.x, worldPosition.y);
      
      console.log('[InlineTextEditor] Converting coords:', {
        world: worldPosition,
        screen: screenCoords,
        canvasRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
      });
      
      // Validate screen coordinates
      if (screenCoords && screenCoords.length >= 2 && 
          !isNaN(screenCoords[0]) && !isNaN(screenCoords[1])) {
        const finalX = rect.left + screenCoords[0];
        const finalY = rect.top + screenCoords[1];
        
        console.log('[InlineTextEditor] Final screen position:', { x: finalX, y: finalY });
        
        setScreenPos({
          x: finalX,
          y: finalY
        });
      } else {
        console.error('[InlineTextEditor] Invalid screen coords:', screenCoords);
      }
    } catch (error) {
      console.error('[InlineTextEditor] Error converting coords:', error);
    }
  }, [worldPosition]);

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
        style={{
          position: 'fixed',
          left: `${screenPos.x}px`,
          top: `${screenPos.y - 50}px`,
          transform: 'translateX(-50%)',  // Center toolbar horizontally
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          background: 'rgba(30, 30, 30, 0.95)',
          padding: '6px 12px',
          borderRadius: '6px',
          border: '1px solid #4299e1',
          zIndex: 10000,
          fontSize: '12px',
          color: '#ccc',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          Size:
          <input
            type="range"
            min="12"
            max="48"
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            style={{ width: '80px' }}
          />
          <span style={{ minWidth: '30px', color: '#fff' }}>{fontSize}px</span>
        </label>
        
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          Color:
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            style={{ width: '30px', height: '20px', border: 'none', cursor: 'pointer' }}
          />
        </label>
        
        <button
          onClick={() => text.trim() && onComplete(text.trim(), fontSize, color)}
          style={{
            padding: '4px 12px',
            background: '#4299e1',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          ✓
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: '4px 12px',
            background: '#666',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          ✕
        </button>
      </div>

      {/* Inline text input - centered to match Rust text rendering */}
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type text..."
        style={{
          position: 'fixed',
          left: `${screenPos.x}px`,
          top: `${screenPos.y}px`,
          transform: 'translateX(-50%)',  // Center horizontally at the x position
          fontSize: `${fontSize}px`,
          color: color,
          fontFamily: 'Consolas, monospace',
          background: 'transparent',
          border: 'none',
          outline: '2px solid #4299e1',
          padding: '2px 4px',
          zIndex: 9999,
          minWidth: '100px',
        }}
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

  // Listen for map clicks when text tool is active
  useEffect(() => {
    if (activeTool !== 'text') {
      setShowDialog(false);
      setClickPosition(null);
      return;
    }

    const handleMapClick = (event: CustomEvent) => {
      const { x, y } = event.detail;
      console.log('[TextSpriteTool] Received textSpriteClick event at:', x, y);
      setClickPosition({ x, y });
      setShowDialog(true);
    };

    console.log('[TextSpriteTool] Registering textSpriteClick event listener');
    window.addEventListener('textSpriteClick' as any, handleMapClick);

    return () => {
      console.log('[TextSpriteTool] Removing textSpriteClick event listener');
      window.removeEventListener('textSpriteClick' as any, handleMapClick);
    };
  }, [activeTool]);

  const handleComplete = (text: string, fontSize: number, color: string) => {
    if (!clickPosition) {
      console.error('[TextSpriteTool] No click position available');
      return;
    }

    try {
      const rustManager = (window as any).rustRenderManager;
      if (!rustManager) {
        throw new Error('Rust render manager not available');
      }

      // Convert font size from pixels to multiplier for Rust renderer
      // The bitmap font atlas has 32px base size, so:
      // 16px = 0.5, 24px = 0.75, 32px = 1.0, 48px = 1.5
      const sizeMultiplier = fontSize / 32.0;

      console.log('[TextSpriteTool] Creating text sprite:', {
        text,
        position: clickPosition,
        fontSize,
        sizeMultiplier,
        color,
        layer: activeLayer
      });

      // Call Rust function to create text sprite directly in WebGL
      const spriteId = rustManager.create_text_sprite(
        text,
        clickPosition.x,
        clickPosition.y,
        sizeMultiplier,  // Use multiplier, not pixel size
        color,
        activeLayer || 'tokens'
      );

      console.log('[TextSpriteTool] Successfully created text sprite:', spriteId);
      onSpriteCreated?.(spriteId);
      
      // Auto-switch to select tool after creating text
      setActiveTool('select');
      
      setShowDialog(false);
      setClickPosition(null);
    } catch (error) {
      console.error('[TextSpriteTool] Error creating text sprite:', error);
      const err = error instanceof Error ? error : new Error('Unknown error');
      onError?.(err);
    }
  };

  const handleCancel = () => {
    setShowDialog(false);
    setClickPosition(null);
  };

  return showDialog && clickPosition ? (
    <InlineTextEditor
      worldPosition={clickPosition}
      onComplete={handleComplete}
      onCancel={handleCancel}
    />
  ) : null;
}

export default TextSpriteTool;
