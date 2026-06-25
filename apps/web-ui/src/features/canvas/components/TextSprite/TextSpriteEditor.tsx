import { useRenderEngine } from '@lib/wasm/runtime';
import { logger } from '@shared/utils/logger';
import clsx from 'clsx';
import { Check, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import styles from './TextSpriteEditor.module.css';

interface TextSpriteEditorProps {
  position: { x: number; y: number } | null;
  onComplete: (config: TextSpriteConfig) => void;
  onCancel: () => void;
}

export interface TextSpriteConfig {
  text: string;
  fontSize: number;
  color: string;
  bold: boolean;
}

export function TextSpriteEditor({ position, onComplete, onCancel }: TextSpriteEditorProps) {
  const [text, setText] = useState('');
  const [fontSize, setFontSize] = useState(24);
  const [color, setColor] = useState('#ffffff');
  const [bold, setBold] = useState(false);
  const [screenPos, setScreenPos] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const renderEngine = useRenderEngine();

  // Convert world coordinates to screen coordinates
  useEffect(() => {
    if (!position) {
      setScreenPos(null);
      return;
    }

    if (!renderEngine) {
      logger.error('[TextSpriteEditor] Rust render manager not available');
      return;
    }

    try {
      const canvas = document.querySelector('.game-canvas') as HTMLCanvasElement;
      if (!canvas) {
        logger.error('[TextSpriteEditor] Canvas not found');
        return;
      }

      const rect = canvas.getBoundingClientRect();
      
      const screenCoords = renderEngine.world_to_screen(position.x, position.y);
      
      const finalPos = {
        x: rect.left + (screenCoords[0] ?? 0),
        y: rect.top + (screenCoords[1] ?? 0)
      };
      logger.debug('[TextSpriteEditor] Converted world position to screen position', {
        position,
        screenCoords,
        finalPos,
      });
      
      setScreenPos(finalPos);
    } catch (error) {
      logger.error('[TextSpriteEditor] Error converting world to screen coords', error);
    }
  }, [position, renderEngine]);

  // Auto-focus input when editor appears
  useEffect(() => {
    if (screenPos && inputRef.current) {
      inputRef.current.focus();
    }
  }, [screenPos]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        handleFinish();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: handlers recreated only when needed
  }, [text]);

  const handleFinish = () => {
    if (text.trim()) {
      onComplete({ text: text.trim(), fontSize, color, bold });
    }
  };

  const handleCancel = () => {
    setText('');
    onCancel();
  };

  if (!screenPos) {
    return null;
  }

  return (
    <>
      {/* Text input cursor on canvas */}
      <div
        className={styles.textSpriteInput}
        style={{
          position: 'fixed',
          left: `${screenPos.x}px`,
          top: `${screenPos.y}px`,
          zIndex: 9999,
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type text..."
          style={{
            fontSize: `${fontSize}px`,
            color: color,
            fontWeight: bold ? 'bold' : 'normal',
            fontFamily: 'Consolas, monospace',
            background: 'rgba(0, 0, 0, 0.8)',
            border: '2px solid #4299e1',
            padding: '4px 8px',
            borderRadius: '4px',
            outline: 'none',
            minWidth: '200px',
          }}
        />
      </div>

      {/* Floating toolbar above text */}
      <div
        className={styles.textSpriteToolbar}
        style={{
          position: 'fixed',
          left: `${screenPos.x}px`,
          top: `${screenPos.y - 60}px`,
          zIndex: 10000,
        }}
      >
        <div className={styles.toolbarContainer}>
          {/* Font size */}
          <div className={styles.toolbarGroup}>
            <label>Size</label>
            <select 
              value={fontSize} 
              onChange={(e) => setFontSize(Number(e.target.value))}
              className={styles.toolbarSelect}
            >
              <option value={12}>12</option>
              <option value={16}>16</option>
              <option value={20}>20</option>
              <option value={24}>24</option>
              <option value={32}>32</option>
              <option value={48}>48</option>
              <option value={64}>64</option>
            </select>
          </div>

          {/* Color picker */}
          <div className={styles.toolbarGroup}>
            <label>Color</label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className={styles.toolbarColor}
            />
          </div>

          {/* Bold toggle */}
          <button
            className={clsx(styles.toolbarButton, {[styles.active]: bold})}
            onClick={() => setBold(!bold)}
            title="Bold (Ctrl+B)"
          >
            <strong>B</strong>
          </button>

          {/* Divider */}
          <div className={styles.toolbarDivider}></div>

          {/* Finish button */}
          <button
            className={clsx(styles.toolbarButton, styles.finish)}
            onClick={handleFinish}
            disabled={!text.trim()}
            title="Finish (Ctrl+Enter)"
          >
            <Check size={16} aria-hidden />
          </button>

          {/* Cancel button */}
          <button
            className={clsx(styles.toolbarButton, styles.cancel)}
            onClick={handleCancel}
            title="Cancel (Esc)"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        {/* Hint text */}
        <div className={styles.toolbarHint}>
          Press Enter to add line · Ctrl+Enter to finish · Esc to cancel
        </div>
      </div>
    </>
  );
}

export default TextSpriteEditor;
