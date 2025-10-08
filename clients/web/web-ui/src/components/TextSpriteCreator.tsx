/**
 * Production Text Sprite Creation System
 * - Rich text editor with comprehensive formatting options
 * - Real-time canvas rendering with proper font handling
 * - Text sprite positioning and transformation system
 * - Undo/redo functionality
 * - Text persistence in backend
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRenderEngine } from '../hooks/useRenderEngine';
import { ErrorBoundary } from './common/ErrorBoundary';
import { LoadingSpinner } from './common/LoadingSpinner';
import { useGameStore } from '../stores/gameStore';
import './TextSpriteCreator.css';

// Text formatting options
export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  color: string;
  backgroundColor?: string;
  textAlign: 'left' | 'center' | 'right';
  lineHeight: number;
  letterSpacing: number;
  textShadow?: {
    offsetX: number;
    offsetY: number;
    blur: number;
    color: string;
  };
  strokeWidth?: number;
  strokeColor?: string;
}

export interface TextSprite {
  id: string;
  text: string;
  style: TextStyle;
  position: {
    x: number;
    y: number;
  };
  dimensions: {
    width: number;
    height: number;
  };
  rotation: number;
  opacity: number;
  visible: boolean;
  layer: number;
  createdAt: Date;
  updatedAt: Date;
}

interface TextSpriteCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (textSprite: TextSprite) => Promise<void>;
  initialSprite?: TextSprite;
  canvasWidth: number;
  canvasHeight: number;
  onPreview?: (sprite: TextSprite) => void;
}

// Default text style
const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: 'Arial, sans-serif',
  fontSize: 24,
  fontWeight: 'normal',
  fontStyle: 'normal',
  color: '#000000',
  backgroundColor: 'transparent',
  textAlign: 'left',
  lineHeight: 1.2,
  letterSpacing: 0,
  strokeWidth: 0,
  strokeColor: '#000000'
};

// Available font families
const FONT_FAMILIES = [
  { name: 'Arial', value: 'Arial, sans-serif' },
  { name: 'Helvetica', value: 'Helvetica, sans-serif' },
  { name: 'Times New Roman', value: 'Times, serif' },
  { name: 'Georgia', value: 'Georgia, serif' },
  { name: 'Verdana', value: 'Verdana, sans-serif' },
  { name: 'Courier New', value: 'Courier, monospace' },
  { name: 'Impact', value: 'Impact, sans-serif' },
  { name: 'Comic Sans MS', value: 'Comic Sans MS, cursive' },
  { name: 'Trebuchet MS', value: 'Trebuchet MS, sans-serif' },
  { name: 'Lucida Console', value: 'Lucida Console, monospace' }
];

// Predefined colors
const PRESET_COLORS = [
  '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF',
  '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080',
  '#FFC0CB', '#A52A2A', '#808080', '#000080', '#008000'
];

export const TextSpriteCreator: React.FC<TextSpriteCreatorProps> = ({
  isOpen,
  onClose,
  onSave,
  initialSprite,
  canvasWidth,
  canvasHeight,
  onPreview
}) => {
  // WASM Engine Integration
  const engine = useRenderEngine();
  const { activeLayer } = useGameStore();
  
  // State
  const [text, setText] = useState(initialSprite?.text || 'Sample Text');
  const [textStyle, setTextStyle] = useState<TextStyle>(initialSprite?.style || DEFAULT_TEXT_STYLE);
  const [position, setPosition] = useState(initialSprite?.position || { x: 100, y: 100 });
  const [rotation, setRotation] = useState(initialSprite?.rotation || 0);
  const [opacity, setOpacity] = useState(initialSprite?.opacity || 1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [history, setHistory] = useState<Array<{ text: string; style: TextStyle; position: typeof position; rotation: number; opacity: number }>>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // WASM Integration State
  const [textSprites, setTextSprites] = useState<TextSprite[]>([]);
  const [spritePositions, setSpritePositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [wasmSpriteId, setWasmSpriteId] = useState<string | null>(initialSprite?.id || null);
  const [isWasmIntegrated, setIsWasmIntegrated] = useState(false);

  // Refs
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  // Generate unique ID
  const generateId = useCallback(() => {
    return `text-sprite-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Add to history for undo/redo
  const addToHistory = useCallback(() => {
    const newState = { text, style: textStyle, position, rotation, opacity };
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newState);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [text, textStyle, position, rotation, opacity, history, historyIndex]);

  // Undo/Redo functionality
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const prevState = history[historyIndex - 1];
      setText(prevState.text);
      setTextStyle(prevState.style);
      setPosition(prevState.position);
      setRotation(prevState.rotation);
      setOpacity(prevState.opacity);
      setHistoryIndex(historyIndex - 1);
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      setText(nextState.text);
      setTextStyle(nextState.style);
      setPosition(nextState.position);
      setRotation(nextState.rotation);
      setOpacity(nextState.opacity);
      setHistoryIndex(historyIndex + 1);
    }
  }, [history, historyIndex]);

  // Calculate text metrics for proper rendering
  const calculateTextMetrics = useCallback((ctx: CanvasRenderingContext2D, text: string, style: TextStyle) => {
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
    
    const lines = text.split('\n');
    const lineHeights = style.fontSize * style.lineHeight;
    const maxWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
    const totalHeight = lines.length * lineHeights;
    
    return {
      width: maxWidth + (style.strokeWidth || 0) * 2,
      height: totalHeight + (style.strokeWidth || 0) * 2,
      lines,
      lineHeight: lineHeights
    };
  }, []);

  // WASM Integration Functions
  const createMovableTextSprite = useCallback(async (textSprite: TextSprite): Promise<string | null> => {
    if (!engine) {
      console.warn('WASM engine not available, text sprite will not be movable');
      return null;
    }

    try {
      // Convert text sprite to WASM-compatible format
      const wasmTextSprite = {
        id: textSprite.id,
        text: textSprite.text,
        world_x: textSprite.position.x,
        world_y: textSprite.position.y,
        width: textSprite.dimensions.width,
        height: textSprite.dimensions.height,
        rotation: textSprite.rotation,
        opacity: textSprite.opacity,
        layer: activeLayer || 'text',
        font_family: textSprite.style.fontFamily,
        font_size: textSprite.style.fontSize,
        font_weight: textSprite.style.fontWeight,
        font_style: textSprite.style.fontStyle,
        color: textSprite.style.color,
        background_color: textSprite.style.backgroundColor || 'transparent',
        text_align: textSprite.style.textAlign,
        line_height: textSprite.style.lineHeight,
        letter_spacing: textSprite.style.letterSpacing,
        stroke_width: textSprite.style.strokeWidth || 0,
        stroke_color: textSprite.style.strokeColor || '#000000'
      };

      // Create sprite using available WASM API
      const spriteData = {
        id: textSprite.id,
        x: wasmTextSprite.world_x,
        y: wasmTextSprite.world_y,
        width: wasmTextSprite.width,
        height: wasmTextSprite.height,
        texture: '', // Text will be rendered as canvas texture
        layer: activeLayer || 'text'
      };

      const spriteId = engine.add_sprite_to_layer && engine.add_sprite_to_layer(activeLayer || 'text', spriteData);
      
      if (spriteId) {
        // Store sprite for management
        setTextSprites(prev => [...prev, textSprite]);
        
        // Store sprite mapping for position updates
        setSpritePositions(prev => new Map(prev.set(spriteId, {
          x: wasmTextSprite.world_x,
          y: wasmTextSprite.world_y
        })));
        
        console.log('✅ Text sprite created and added to layer:', spriteId);
        return spriteId;
      } else {
        console.warn('Failed to create text sprite in WASM engine');
        return null;
      }
    } catch (error) {
      console.error('Error creating movable text sprite:', error);
      setError(`Failed to create movable text: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }, [engine, activeLayer]);

  const updateTextSpritePosition = useCallback(async (spriteId: string, newPosition: { x: number; y: number }) => {
    if (!engine || !spriteId) return;

    try {
      // Update position in our tracking map
      setSpritePositions(prev => new Map(prev.set(spriteId, newPosition)));
      
      // Since WASM doesn't have direct position update, we need to recreate the sprite
      // First, get the sprite data
      const currentSprite = textSprites.find(sprite => sprite.id === spriteId);
      if (!currentSprite) {
        console.warn('Sprite not found for position update:', spriteId);
        return;
      }
      
      // Remove old sprite
      if (engine.remove_sprite) {
        engine.remove_sprite(spriteId);
      }
      
      // Create new sprite at new position
      const updatedSprite = {
        ...currentSprite,
        position: newPosition
      };
      
      const newSpriteId = await createMovableTextSprite(updatedSprite);
      
      // Update textSprites array
      setTextSprites(prev => prev.map(sprite => 
        sprite.id === spriteId 
          ? { ...sprite, id: newSpriteId || spriteId, position: newPosition }
          : sprite
      ));
      
      console.log('✅ Text sprite position updated:', spriteId, '->', newSpriteId);
    } catch (error) {
      console.error('Error updating text sprite position:', error);
    }
  }, [engine, textSprites]);

  const removeTextSpriteFromWasm = useCallback(async (spriteId: string) => {
    if (!engine || !spriteId) return;

    try {
      // Remove sprite using available API
      if (engine.remove_sprite) {
        const removed = engine.remove_sprite(spriteId);
        if (removed) {
          // Remove from our tracking
          setSpritePositions(prev => {
            const newMap = new Map(prev);
            newMap.delete(spriteId);
            return newMap;
          });
          
          // Remove from textSprites array
          setTextSprites(prev => prev.filter(sprite => sprite.id !== spriteId));
          
          console.log('✅ Text sprite removed from WASM system:', spriteId);
        } else {
          console.warn('Failed to remove sprite from WASM:', spriteId);
        }
      }
    } catch (error) {
      console.error('Error removing text sprite from WASM:', error);
    }
  }, [engine]);

  // Render text on canvas
  const renderText = useCallback((canvas: HTMLCanvasElement, currentText: string, currentStyle: TextStyle, currentPosition: { x: number; y: number }, currentRotation: number, currentOpacity: number) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply global settings
    ctx.globalAlpha = currentOpacity;
    
    // Calculate text metrics
    const metrics = calculateTextMetrics(ctx, currentText, currentStyle);
    
    // Save context for transformations
    ctx.save();
    
    // Apply transformations
    ctx.translate(currentPosition.x, currentPosition.y);
    ctx.rotate((currentRotation * Math.PI) / 180);
    
    // Set font and text properties
    ctx.font = `${currentStyle.fontStyle} ${currentStyle.fontWeight} ${currentStyle.fontSize}px ${currentStyle.fontFamily}`;
    ctx.fillStyle = currentStyle.color;
    ctx.textBaseline = 'top';
    
    // Set text alignment
    let textAlign: CanvasTextAlign = 'left';
    let alignmentOffset = 0;
    
    switch (currentStyle.textAlign) {
      case 'center':
        textAlign = 'center';
        alignmentOffset = metrics.width / 2;
        break;
      case 'right':
        textAlign = 'right';
        alignmentOffset = metrics.width;
        break;
    }
    
    ctx.textAlign = textAlign;
    
    // Apply letter spacing if specified
    if (currentStyle.letterSpacing !== 0) {
      // Manual letter spacing implementation
      const originalFillText = ctx.fillText.bind(ctx);
      ctx.fillText = (text: string, x: number, y: number) => {
        for (let i = 0; i < text.length; i++) {
          originalFillText(text[i], x + i * currentStyle.letterSpacing, y);
        }
      };
    }
    
    // Draw background if specified
    if (currentStyle.backgroundColor && currentStyle.backgroundColor !== 'transparent') {
      ctx.fillStyle = currentStyle.backgroundColor;
      ctx.fillRect(-alignmentOffset, 0, metrics.width, metrics.height);
    }
    
    // Apply text shadow
    if (currentStyle.textShadow) {
      ctx.save();
      ctx.shadowOffsetX = currentStyle.textShadow.offsetX;
      ctx.shadowOffsetY = currentStyle.textShadow.offsetY;
      ctx.shadowBlur = currentStyle.textShadow.blur;
      ctx.shadowColor = currentStyle.textShadow.color;
    }
    
    // Draw text stroke if specified
    if (currentStyle.strokeWidth && currentStyle.strokeWidth > 0) {
      ctx.strokeStyle = currentStyle.strokeColor || '#000000';
      ctx.lineWidth = currentStyle.strokeWidth;
      
      metrics.lines.forEach((line, index) => {
        const y = index * metrics.lineHeight;
        ctx.strokeText(line, alignmentOffset, y);
      });
    }
    
    // Draw text fill
    ctx.fillStyle = currentStyle.color;
    metrics.lines.forEach((line, index) => {
      const y = index * metrics.lineHeight;
      ctx.fillText(line, alignmentOffset, y);
    });
    
    // Restore shadow context if applied
    if (currentStyle.textShadow) {
      ctx.restore();
    }
    
    // Restore transformation context
    ctx.restore();
    
    return metrics;
  }, [calculateTextMetrics]);

  // Update preview canvas
  useEffect(() => {
    if (previewCanvasRef.current) {
      const metrics = renderText(previewCanvasRef.current, text, textStyle, position, rotation, opacity);
      
      // Create preview sprite for callback
      if (onPreview && metrics) {
        const previewSprite: TextSprite = {
          id: initialSprite?.id || generateId(),
          text,
          style: textStyle,
          position,
          dimensions: {
            width: metrics.width,
            height: metrics.height
          },
          rotation,
          opacity,
          visible: true,
          layer: 0,
          createdAt: initialSprite?.createdAt || new Date(),
          updatedAt: new Date()
        };
        onPreview(previewSprite);
      }
    }
  }, [text, textStyle, position, rotation, opacity, renderText, onPreview, initialSprite?.id, initialSprite?.createdAt, generateId]);

  // Handle text change
  const handleTextChange = useCallback((newText: string) => {
    setText(newText);
    addToHistory();
  }, [addToHistory]);

  // Handle style change
  const handleStyleChange = useCallback((updates: Partial<TextStyle>) => {
    setTextStyle(prev => ({ ...prev, ...updates }));
    addToHistory();
  }, [addToHistory]);

  // Mouse handlers for dragging
  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Check if click is near text position
    const distance = Math.sqrt(Math.pow(x - position.x, 2) + Math.pow(y - position.y, 2));
    if (distance < 50) { // 50px tolerance
      setIsDragging(true);
      setDragOffset({
        x: x - position.x,
        y: y - position.y
      });
    }
  }, [position]);

  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    setPosition({
      x: Math.max(0, Math.min(canvasWidth, x - dragOffset.x)),
      y: Math.max(0, Math.min(canvasHeight, y - dragOffset.y))
    });
  }, [isDragging, dragOffset, canvasWidth, canvasHeight]);

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      addToHistory();
    }
  }, [isDragging, addToHistory]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return;
      
      if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
          case 'z':
            event.preventDefault();
            if (event.shiftKey) {
              redo();
            } else {
              undo();
            }
            break;
          case 'y':
            event.preventDefault();
            redo();
            break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, undo, redo]);

  // Cleanup WASM sprite on unmount or close
  useEffect(() => {
    return () => {
      if (wasmSpriteId && isWasmIntegrated) {
        removeTextSpriteFromWasm(wasmSpriteId);
      }
    };
  }, [wasmSpriteId, isWasmIntegrated, removeTextSpriteFromWasm]);

  // Sync position changes with WASM
  useEffect(() => {
    if (wasmSpriteId && isWasmIntegrated && !isDragging) {
      updateTextSpritePosition(wasmSpriteId, position);
    }
  }, [wasmSpriteId, isWasmIntegrated, position, isDragging, updateTextSpritePosition]);

  // Handle save with WASM integration
  const handleSave = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const canvas = previewCanvasRef.current;
      if (!canvas) throw new Error('Canvas not available');
      
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context not available');
      
      const metrics = calculateTextMetrics(ctx, text, textStyle);
      
      const textSprite: TextSprite = {
        id: initialSprite?.id || generateId(),
        text,
        style: textStyle,
        position,
        dimensions: {
          width: metrics.width,
          height: metrics.height
        },
        rotation,
        opacity,
        visible: true,
        layer: 0,
        createdAt: initialSprite?.createdAt || new Date(),
        updatedAt: new Date()
      };
      
      // Create movable text sprite in WASM if engine is available
      const wasmId = await createMovableTextSprite(textSprite);
      if (wasmId) {
        setWasmSpriteId(wasmId);
        setIsWasmIntegrated(true);
        console.log('✅ Text sprite integrated with WASM movement system');
      } else {
        console.warn('⚠️ Text sprite created without WASM integration - will not be movable');
      }
      
      // Save through the provided callback
      await onSave(textSprite);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save text sprite');
    } finally {
      setIsLoading(false);
    }
  }, [text, textStyle, position, rotation, opacity, initialSprite, onSave, onClose, calculateTextMetrics, generateId, createMovableTextSprite, setWasmSpriteId, setIsWasmIntegrated]);

  if (!isOpen) return null;

  return (
    <ErrorBoundary>
      <div className="text-sprite-creator-overlay">
        <div className="text-sprite-creator">
          {/* Header */}
          <div className="text-sprite-header">
            <div className="header-title">
              <h2>Text Sprite Creator</h2>
              {engine && (
                <div className={`wasm-status ${isWasmIntegrated ? 'integrated' : 'available'}`}>
                  <span className="status-icon">{isWasmIntegrated ? '✅' : '🔧'}</span>
                  <span className="status-text">
                    {isWasmIntegrated ? 'Movable' : 'WASM Ready'}
                  </span>
                </div>
              )}
              {!engine && (
                <div className="wasm-status unavailable">
                  <span className="status-icon">⚠️</span>
                  <span className="status-text">Static Only</span>
                </div>
              )}
            </div>
            <button className="close-btn" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>

          {error && (
            <div className="error-message" role="alert">
              <span className="error-icon">⚠️</span>
              {error}
            </div>
          )}

          <div className="text-sprite-content">
            {/* Text Input */}
            <div className="text-input-section">
              <label htmlFor="text-content">Text Content</label>
              <textarea
                ref={textInputRef}
                id="text-content"
                value={text}
                onChange={(e) => handleTextChange(e.target.value)}
                placeholder="Enter your text here..."
                rows={4}
                className="text-input"
              />
            </div>

            {/* Style Controls */}
            <div className="style-controls">
              <div className="control-group">
                <label htmlFor="font-family">Font Family</label>
                <select
                  id="font-family"
                  value={textStyle.fontFamily}
                  onChange={(e) => handleStyleChange({ fontFamily: e.target.value })}
                >
                  {FONT_FAMILIES.map(font => (
                    <option key={font.value} value={font.value}>
                      {font.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="control-group">
                <label htmlFor="font-size">Font Size</label>
                <input
                  id="font-size"
                  type="range"
                  min="8"
                  max="200"
                  value={textStyle.fontSize}
                  onChange={(e) => handleStyleChange({ fontSize: parseInt(e.target.value) })}
                />
                <span>{textStyle.fontSize}px</span>
              </div>

              <div className="control-group">
                <label>Font Style</label>
                <div className="button-group">
                  <button
                    className={textStyle.fontWeight === 'bold' ? 'active' : ''}
                    onClick={() => handleStyleChange({ fontWeight: textStyle.fontWeight === 'bold' ? 'normal' : 'bold' })}
                  >
                    <strong>B</strong>
                  </button>
                  <button
                    className={textStyle.fontStyle === 'italic' ? 'active' : ''}
                    onClick={() => handleStyleChange({ fontStyle: textStyle.fontStyle === 'italic' ? 'normal' : 'italic' })}
                  >
                    <em>I</em>
                  </button>
                </div>
              </div>

              <div className="control-group">
                <label htmlFor="text-color">Text Color</label>
                <div className="color-controls">
                  <input
                    id="text-color"
                    type="color"
                    value={textStyle.color}
                    onChange={(e) => handleStyleChange({ color: e.target.value })}
                  />
                  <div className="color-presets">
                    {PRESET_COLORS.map(color => (
                      <button
                        key={color}
                        className="color-preset"
                        style={{ backgroundColor: color }}
                        onClick={() => handleStyleChange({ color })}
                        aria-label={`Set color to ${color}`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="control-group">
                <label htmlFor="text-align">Text Alignment</label>
                <select
                  id="text-align"
                  value={textStyle.textAlign}
                  onChange={(e) => handleStyleChange({ textAlign: e.target.value as any })}
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </div>

              <div className="control-group">
                <label htmlFor="opacity">Opacity</label>
                <input
                  id="opacity"
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={opacity}
                  onChange={(e) => setOpacity(parseFloat(e.target.value))}
                />
                <span>{Math.round(opacity * 100)}%</span>
              </div>

              <div className="control-group">
                <label htmlFor="rotation">Rotation</label>
                <input
                  id="rotation"
                  type="range"
                  min="-180"
                  max="180"
                  value={rotation}
                  onChange={(e) => setRotation(parseInt(e.target.value))}
                />
                <span>{rotation}°</span>
              </div>
            </div>

            {/* Preview Canvas */}
            <div className="preview-section">
              <h3>Preview</h3>
              <div className="canvas-container">
                <canvas
                  ref={previewCanvasRef}
                  width={canvasWidth}
                  height={canvasHeight}
                  className="preview-canvas"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                />
                <div className="canvas-overlay">
                  <span>Drag text to reposition</span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-sprite-footer">
            <div className="undo-redo">
              <button
                onClick={undo}
                disabled={historyIndex <= 0}
                aria-label="Undo"
                title="Undo (Ctrl+Z)"
              >
                ↶ Undo
              </button>
              <button
                onClick={redo}
                disabled={historyIndex >= history.length - 1}
                aria-label="Redo"
                title="Redo (Ctrl+Y)"
              >
                ↷ Redo
              </button>
            </div>

            <div className="action-buttons">
              <button className="cancel-btn" onClick={onClose}>
                Cancel
              </button>
              <button
                className="save-btn"
                onClick={handleSave}
                disabled={isLoading || !text.trim()}
              >
                {isLoading ? <LoadingSpinner size="small" /> : 'Save Text Sprite'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};