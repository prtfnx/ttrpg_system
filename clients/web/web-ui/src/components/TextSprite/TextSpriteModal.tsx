import { useState } from 'react';
import './TextSpriteModal.css';

interface TextSpriteModalProps {
  isOpen: boolean;
  position: { x: number; y: number } | null;
  onConfirm: (config: TextSpriteConfig) => void;
  onCancel: () => void;
}

export interface TextSpriteConfig {
  text: string;
  fontSize: number;
  color: string;
}

export function TextSpriteModal({ isOpen, position, onConfirm, onCancel }: TextSpriteModalProps) {
  const [text, setText] = useState('Sample Text');
  const [fontSize, setFontSize] = useState(24);
  const [color, setColor] = useState('#ffffff');

  if (!isOpen || !position) return null;

  const handleConfirm = () => {
    if (text.trim()) {
      onConfirm({ text: text.trim(), fontSize, color });
      // Reset for next use
      setText('Sample Text');
      setFontSize(24);
      setColor('#ffffff');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="text-sprite-modal-overlay" onClick={onCancel}>
      <div className="text-sprite-modal" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="modal-header">
          <h3>Create Text Sprite</h3>
          <button className="close-btn" onClick={onCancel} title="Close (Esc)">×</button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="text-content">Text Content:</label>
            <textarea
              id="text-content"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter your text..."
              autoFocus
              rows={3}
              maxLength={200}
            />
            <div className="char-count">{text.length}/200</div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="font-size">Font Size:</label>
              <div className="slider-container">
                <input
                  type="range"
                  id="font-size"
                  min="12"
                  max="72"
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                />
                <span className="slider-value">{fontSize}px</span>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="text-color">Color:</label>
              <div className="color-picker-container">
                <input
                  type="color"
                  id="text-color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
                <span className="color-value">{color.toUpperCase()}</span>
              </div>
            </div>
          </div>

          <div className="preview-section">
            <label>Preview:</label>
            <div
              className="text-preview"
              style={{
                fontSize: `${fontSize}px`,
                color: color,
                backgroundColor: '#2d2d2d',
                padding: '16px',
                borderRadius: '4px',
                textAlign: 'center',
                fontFamily: 'Consolas, monospace',
                wordBreak: 'break-word'
              }}
            >
              {text || 'Sample Text'}
            </div>
          </div>

          <div className="info-box">
            <strong>Note:</strong> Text sprites use the WebGL bitmap font renderer.
            <br />
            • Consolas monospace font
            • ASCII characters only (32-127)
            • Rendered directly in WebGL (no Canvas2D)
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn btn-confirm"
            onClick={handleConfirm}
            disabled={!text.trim()}
          >
            Create Text Sprite
          </button>
        </div>
      </div>
    </div>
  );
}
