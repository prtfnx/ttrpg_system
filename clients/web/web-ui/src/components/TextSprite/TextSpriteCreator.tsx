import { useCallback, useEffect, useRef, useState } from 'react';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { Modal } from '../common/Modal';
import '../common/Modal.css';
import './TextSpriteCreator.css';

// Font families available for text sprites
const FONT_FAMILIES = [
  'Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana',
  'Trebuchet MS', 'Comic Sans MS', 'Impact', 'Lucida Console',
  'Tahoma', 'Courier New', 'serif', 'sans-serif', 'monospace'
] as const;

// Font weights
const FONT_WEIGHTS = [
  { value: 'normal', label: 'Normal' },
  { value: 'bold', label: 'Bold' },
  { value: '100', label: 'Thin' },
  { value: '300', label: 'Light' },
  { value: '500', label: 'Medium' },
  { value: '700', label: 'Bold' },
  { value: '900', label: 'Black' }
] as const;

// Text alignment options
const TEXT_ALIGNMENTS = [
  { value: 'left', label: 'Left', icon: '⬅' },
  { value: 'center', label: 'Center', icon: '⬌' },
  { value: 'right', label: 'Right', icon: '➡' }
] as const;

export interface TextSpriteConfig {
  text: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  color: string;
  backgroundColor: string;
  hasBackground: boolean;
  textAlign: 'left' | 'center' | 'right';
  opacity: number;
  rotation: number;
  borderWidth: number;
  borderColor: string;
  hasBorder: boolean;
  padding: number;
  lineHeight: number;
  letterSpacing: number;
  textShadow: boolean;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
}

interface TextSpriteCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateSprite: (config: TextSpriteConfig, position: { x: number; y: number }) => void;
  activeLayer: string;
  initialPosition?: { x: number; y: number };
  initialConfig?: TextSpriteConfig;
  title?: string;
  createButtonText?: string;
  showDeleteButton?: boolean;
  onDelete?: () => void;
  isDeleting?: boolean;
}

export function TextSpriteCreator({ 
  isOpen, 
  onClose, 
  onCreateSprite, 
  activeLayer,
  initialPosition = { x: 100, y: 100 },
  initialConfig,
  title = "Create Text Sprite",
  createButtonText = "Create Text Sprite",
  showDeleteButton = false,
  onDelete,
  isDeleting = false
}: TextSpriteCreatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [config, setConfig] = useState<TextSpriteConfig>(initialConfig || {
    text: 'Sample Text',
    fontSize: 24,
    fontFamily: 'Arial',
    fontWeight: 'normal',
    color: '#000000',
    backgroundColor: '#ffffff',
    hasBackground: false,
    textAlign: 'left',
    opacity: 1.0,
    rotation: 0,
    borderWidth: 1,
    borderColor: '#000000',
    hasBorder: false,
    padding: 8,
    lineHeight: 1.2,
    letterSpacing: 0,
    textShadow: false,
    shadowColor: '#000000',
    shadowBlur: 2,
    shadowOffsetX: 1,
    shadowOffsetY: 1,
  });

  const [position, setPosition] = useState(initialPosition);

  // Update preview when config changes
  useEffect(() => {
    updatePreview();
  }, [config]);

  const updatePreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Calculate text metrics
    const font = `${config.fontWeight} ${config.fontSize}px ${config.fontFamily}`;
    ctx.font = font;
    
    const lines = config.text.split('\n');
    const lineHeight = config.fontSize * config.lineHeight;
    const textMetrics = lines.map(line => ctx.measureText(line));
    const maxWidth = Math.max(...textMetrics.map(m => m.width));
    const textHeight = lines.length * lineHeight;

    // Calculate canvas dimensions with padding
    const totalPadding = config.padding * 2;
    const canvasWidth = Math.max(50, maxWidth + totalPadding + (config.hasBorder ? config.borderWidth * 2 : 0));
    const canvasHeight = Math.max(30, textHeight + totalPadding + (config.hasBorder ? config.borderWidth * 2 : 0));

    // Set canvas size
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

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
      ctx.strokeRect(config.borderWidth / 2, config.borderWidth / 2, 
                    canvasWidth - config.borderWidth, canvasHeight - config.borderWidth);
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

    // Apply letter spacing (if supported)
    if (config.letterSpacing !== 0) {
      ctx.letterSpacing = `${config.letterSpacing}px`;
    }

    // Draw text lines
    const startX = config.padding + (config.hasBorder ? config.borderWidth : 0);
    const startY = config.padding + (config.hasBorder ? config.borderWidth : 0);

    lines.forEach((line, index) => {
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
  }, [config]);

  const handleCreate = useCallback(() => {
    onCreateSprite(config, position);
    onClose();
  }, [config, position, onCreateSprite, onClose]);

  const updateConfig = <K extends keyof TextSpriteConfig>(
    key: K, 
    value: TextSpriteConfig[K]
  ) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="large"
      closeOnEscape={true}
    >
      <ErrorBoundary>
        <div className="text-sprite-creator">
          <div className="creator-layout">
            {/* Left panel - Controls */}
            <div className="controls-panel">
              <div className="control-section">
                <h3>Text Content</h3>
                <div className="control-group">
                  <label htmlFor="text-content">Text:</label>
                  <textarea
                    id="text-content"
                    value={config.text}
                    onChange={(e) => updateConfig('text', e.target.value)}
                    placeholder="Enter your text..."
                    rows={3}
                    className="text-input"
                  />
                </div>
              </div>

              <div className="control-section">
                <h3>Typography</h3>
                <div className="control-row">
                  <div className="control-group">
                    <label htmlFor="font-family">Font:</label>
                    <select
                      id="font-family"
                      value={config.fontFamily}
                      onChange={(e) => updateConfig('fontFamily', e.target.value)}
                    >
                      {FONT_FAMILIES.map(font => (
                        <option key={font} value={font}>{font}</option>
                      ))}
                    </select>
                  </div>
                  <div className="control-group">
                    <label htmlFor="font-weight">Weight:</label>
                    <select
                      id="font-weight"
                      value={config.fontWeight}
                      onChange={(e) => updateConfig('fontWeight', e.target.value)}
                    >
                      {FONT_WEIGHTS.map(weight => (
                        <option key={weight.value} value={weight.value}>
                          {weight.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                
                <div className="control-row">
                  <div className="control-group">
                    <label htmlFor="font-size">Size: {config.fontSize}px</label>
                    <input
                      id="font-size"
                      type="range"
                      min="8"
                      max="128"
                      step="1"
                      value={config.fontSize}
                      onChange={(e) => updateConfig('fontSize', parseInt(e.target.value))}
                    />
                  </div>
                  <div className="control-group">
                    <label htmlFor="line-height">Line Height: {config.lineHeight}x</label>
                    <input
                      id="line-height"
                      type="range"
                      min="0.5"
                      max="3"
                      step="0.1"
                      value={config.lineHeight}
                      onChange={(e) => updateConfig('lineHeight', parseFloat(e.target.value))}
                    />
                  </div>
                </div>

                <div className="control-group">
                  <label>Alignment:</label>
                  <div className="alignment-buttons">
                    {TEXT_ALIGNMENTS.map(align => (
                      <button
                        key={align.value}
                        type="button"
                        className={`align-btn ${config.textAlign === align.value ? 'active' : ''}`}
                        onClick={() => updateConfig('textAlign', align.value)}
                        title={align.label}
                      >
                        {align.icon}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="control-section">
                <h3>Colors & Effects</h3>
                <div className="control-row">
                  <div className="control-group">
                    <label htmlFor="text-color">Text Color:</label>
                    <input
                      id="text-color"
                      type="color"
                      value={config.color}
                      onChange={(e) => updateConfig('color', e.target.value)}
                    />
                  </div>
                  <div className="control-group">
                    <label htmlFor="opacity">Opacity: {Math.round(config.opacity * 100)}%</label>
                    <input
                      id="opacity"
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={config.opacity}
                      onChange={(e) => updateConfig('opacity', parseFloat(e.target.value))}
                    />
                  </div>
                </div>

                <div className="control-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={config.hasBackground}
                      onChange={(e) => updateConfig('hasBackground', e.target.checked)}
                    />
                    Background
                  </label>
                  {config.hasBackground && (
                    <input
                      type="color"
                      value={config.backgroundColor}
                      onChange={(e) => updateConfig('backgroundColor', e.target.value)}
                      className="color-input"
                    />
                  )}
                </div>

                <div className="control-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={config.hasBorder}
                      onChange={(e) => updateConfig('hasBorder', e.target.checked)}
                    />
                    Border
                  </label>
                  {config.hasBorder && (
                    <div className="control-row">
                      <input
                        type="color"
                        value={config.borderColor}
                        onChange={(e) => updateConfig('borderColor', e.target.value)}
                        className="color-input"
                      />
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={config.borderWidth}
                        onChange={(e) => updateConfig('borderWidth', parseInt(e.target.value))}
                        title={`Width: ${config.borderWidth}px`}
                      />
                    </div>
                  )}
                </div>

                <div className="control-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={config.textShadow}
                      onChange={(e) => updateConfig('textShadow', e.target.checked)}
                    />
                    Text Shadow
                  </label>
                  {config.textShadow && (
                    <div className="shadow-controls">
                      <input
                        type="color"
                        value={config.shadowColor}
                        onChange={(e) => updateConfig('shadowColor', e.target.value)}
                        title="Shadow Color"
                      />
                      <input
                        type="range"
                        min="0"
                        max="10"
                        value={config.shadowBlur}
                        onChange={(e) => updateConfig('shadowBlur', parseInt(e.target.value))}
                        title={`Blur: ${config.shadowBlur}px`}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="control-section">
                <h3>Transform</h3>
                <div className="control-group">
                  <label htmlFor="rotation">Rotation: {config.rotation}°</label>
                  <input
                    id="rotation"
                    type="range"
                    min="-180"
                    max="180"
                    step="5"
                    value={config.rotation}
                    onChange={(e) => updateConfig('rotation', parseInt(e.target.value))}
                  />
                </div>
                <div className="control-group">
                  <label htmlFor="padding">Padding: {config.padding}px</label>
                  <input
                    id="padding"
                    type="range"
                    min="0"
                    max="50"
                    step="1"
                    value={config.padding}
                    onChange={(e) => updateConfig('padding', parseInt(e.target.value))}
                  />
                </div>
              </div>

              <div className="control-section">
                <h3>Position</h3>
                <div className="control-row">
                  <div className="control-group">
                    <label htmlFor="pos-x">X:</label>
                    <input
                      id="pos-x"
                      type="number"
                      value={position.x}
                      onChange={(e) => setPosition(prev => ({ ...prev, x: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                  <div className="control-group">
                    <label htmlFor="pos-y">Y:</label>
                    <input
                      id="pos-y"
                      type="number"
                      value={position.y}
                      onChange={(e) => setPosition(prev => ({ ...prev, y: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Right panel - Preview */}
            <div className="preview-panel">
              <h3>Preview</h3>
              <div className="preview-container">
                <canvas
                  ref={canvasRef}
                  className="text-preview"
                  style={{
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    maxWidth: '100%',
                    maxHeight: '300px'
                  }}
                />
              </div>
              <div className="preview-info">
                <small>Layer: <strong>{activeLayer}</strong></small>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="creator-actions">
            {showDeleteButton && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="btn-delete"
                disabled={isDeleting}
                style={{
                  background: '#dc3545',
                  color: 'white',
                  padding: '0.75rem 1.5rem',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  cursor: isDeleting ? 'wait' : 'pointer',
                  opacity: isDeleting ? 0.6 : 1
                }}
              >
                {isDeleting ? 'Deleting...' : 'Delete Sprite'}
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button
              type="button"
              onClick={onClose}
              className="btn-cancel"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              className="btn-create"
              disabled={!config.text.trim()}
            >
              {createButtonText}
            </button>
          </div>
        </div>
      </ErrorBoundary>
    </Modal>
  );
}