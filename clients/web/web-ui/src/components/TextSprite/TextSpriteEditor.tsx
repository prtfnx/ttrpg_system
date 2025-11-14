import { useEffect, useRef, useState } from 'react';
import './TextSpriteEditor.css';

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

  // Convert world coordinates to screen coordinates
  useEffect(() => {
    if (!position) {
      setScreenPos(null);
      return;
    }

    const rustManager = (window as any).rustRenderManager;
    if (!rustManager) {
      console.error('[TextSpriteEditor] Rust render manager not available');
      return;
    }

    try {
      const canvas = document.getElementById('gameCanvas');
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const screenCoords = rustManager.world_to_screen(position.x, position.y);
      
      setScreenPos({
        x: rect.left + screenCoords.x,
        y: rect.top + screenCoords.y
      });
    } catch (error) {
      console.error('[TextSpriteEditor] Error converting world to screen coords:', error);
    }
  }, [position]);

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

  if (!screenPos) return null;

  return (
    <>
      {/* Text input cursor on canvas */}
      <div
        className="text-sprite-input"
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
        className="text-sprite-toolbar"
        style={{
          position: 'fixed',
          left: `${screenPos.x}px`,
          top: `${screenPos.y - 60}px`,
          zIndex: 10000,
        }}
      >
        <div className="toolbar-container">
          {/* Font size */}
          <div className="toolbar-group">
            <label>Size</label>
            <select 
              value={fontSize} 
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="toolbar-select"
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
          <div className="toolbar-group">
            <label>Color</label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="toolbar-color"
            />
          </div>

          {/* Bold toggle */}
          <button
            className={`toolbar-button ${bold ? 'active' : ''}`}
            onClick={() => setBold(!bold)}
            title="Bold (Ctrl+B)"
          >
            <strong>B</strong>
          </button>

          {/* Divider */}
          <div className="toolbar-divider"></div>

          {/* Finish button */}
          <button
            className="toolbar-button finish"
            onClick={handleFinish}
            disabled={!text.trim()}
            title="Finish (Ctrl+Enter)"
          >
            ✓
          </button>

          {/* Cancel button */}
          <button
            className="toolbar-button cancel"
            onClick={handleCancel}
            title="Cancel (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Hint text */}
        <div className="toolbar-hint">
          Press Enter to add line · Ctrl+Enter to finish · Esc to cancel
        </div>
      </div>
    </>
  );
}

export default TextSpriteEditor;
