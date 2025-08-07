import { useState } from 'react';

interface SpriteCreationToolsProps {
  isActive: boolean;
}

type ShapeType = 'rectangle' | 'circle' | 'line' | 'text';

export function SpriteCreationTools({ isActive }: SpriteCreationToolsProps) {
  const [selectedShape, setSelectedShape] = useState<ShapeType>('rectangle');
  const [size, setSize] = useState({ width: 40, height: 40 });
  const [color, setColor] = useState('#4CAF50');
  const [opacity, setOpacity] = useState(1);
  const [textContent, setTextContent] = useState('Text');
  const [fontSize, setFontSize] = useState(16);

  const presetSizes = [
    { name: 'Tiny', width: 20, height: 20 },
    { name: 'Small', width: 30, height: 30 },
    { name: 'Medium', width: 40, height: 40 },
    { name: 'Large', width: 60, height: 60 },
    { name: 'Huge', width: 80, height: 80 }
  ];

  const presetColors = [
    '#4CAF50', // Green
    '#2196F3', // Blue  
    '#FF9800', // Orange
    '#F44336', // Red
    '#9C27B0', // Purple
    '#607D8B', // Blue Grey
    '#795548', // Brown
    '#000000'  // Black
  ];

  if (!isActive) return null;

  return (
    <div className="sprite-creation-tools">
      <div className="creation-panel">
        <h4>Create Sprites</h4>
        
        <div className="shape-selector">
          <label>Shape:</label>
          <div className="shape-buttons">
            {(['rectangle', 'circle', 'line', 'text'] as ShapeType[]).map(shape => (
              <button
                key={shape}
                className={selectedShape === shape ? 'active' : ''}
                onClick={() => setSelectedShape(shape)}
              >
                {shape === 'rectangle' && '⬛'}
                {shape === 'circle' && '⭕'}
                {shape === 'line' && '📏'}
                {shape === 'text' && '🔤'}
              </button>
            ))}
          </div>
        </div>

        <div className="size-controls">
          <label>Size:</label>
          <div className="preset-sizes">
            {presetSizes.map(preset => (
              <button
                key={preset.name}
                className={size.width === preset.width && size.height === preset.height ? 'active' : ''}
                onClick={() => setSize({ width: preset.width, height: preset.height })}
              >
                {preset.name}
              </button>
            ))}
          </div>
          
          <div className="custom-size">
            <div className="size-input">
              <label>W:</label>
              <input
                type="number"
                value={size.width}
                onChange={e => setSize(prev => ({ ...prev, width: parseInt(e.target.value) || 40 }))}
                min="1"
                max="200"
              />
            </div>
            {selectedShape !== 'circle' && (
              <div className="size-input">
                <label>H:</label>
                <input
                  type="number"
                  value={size.height}
                  onChange={e => setSize(prev => ({ ...prev, height: parseInt(e.target.value) || 40 }))}
                  min="1"
                  max="200"
                />
              </div>
            )}
          </div>
        </div>

        <div className="color-controls">
          <label>Color:</label>
          <div className="preset-colors">
            {presetColors.map(presetColor => (
              <button
                key={presetColor}
                className={`color-button ${color === presetColor ? 'active' : ''}`}
                style={{ backgroundColor: presetColor }}
                onClick={() => setColor(presetColor)}
              />
            ))}
          </div>
          <input
            type="color"
            value={color}
            onChange={e => setColor(e.target.value)}
            className="color-picker"
          />
        </div>

        <div className="opacity-control">
          <label>Opacity: {Math.round(opacity * 100)}%</label>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.1"
            value={opacity}
            onChange={e => setOpacity(parseFloat(e.target.value))}
            className="opacity-slider"
          />
        </div>

        {selectedShape === 'text' && (
          <div className="text-controls">
            <div className="text-input">
              <label>Text:</label>
              <input
                type="text"
                value={textContent}
                onChange={e => setTextContent(e.target.value)}
                placeholder="Enter text"
              />
            </div>
            <div className="font-size">
              <label>Font Size:</label>
              <input
                type="number"
                value={fontSize}
                onChange={e => setFontSize(parseInt(e.target.value) || 16)}
                min="8"
                max="72"
              />
            </div>
          </div>
        )}

        <div className="creation-instructions">
          Click on the canvas to create a {selectedShape}
        </div>
      </div>
      
      <style>{`
        .sprite-creation-tools {
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(55, 65, 81, 0.95);
          color: white;
          padding: 16px;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          max-width: 400px;
          z-index: 1000;
        }
        
        .creation-panel h4 {
          margin: 0 0 12px 0;
          color: #e5e7eb;
          font-size: 16px;
        }
        
        .shape-selector {
          margin-bottom: 12px;
        }
        
        .shape-selector label {
          display: block;
          font-size: 12px;
          color: #9ca3af;
          margin-bottom: 4px;
        }
        
        .shape-buttons {
          display: flex;
          gap: 4px;
        }
        
        .shape-buttons button {
          padding: 8px 12px;
          background: #4b5563;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 16px;
          transition: background-color 0.2s;
        }
        
        .shape-buttons button.active,
        .shape-buttons button:hover {
          background: #6b7280;
        }
        
        .size-controls {
          margin-bottom: 12px;
        }
        
        .size-controls label {
          display: block;
          font-size: 12px;
          color: #9ca3af;
          margin-bottom: 4px;
        }
        
        .preset-sizes {
          display: flex;
          gap: 4px;
          margin-bottom: 8px;
        }
        
        .preset-sizes button {
          padding: 4px 8px;
          background: #4b5563;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
          transition: background-color 0.2s;
        }
        
        .preset-sizes button.active,
        .preset-sizes button:hover {
          background: #6b7280;
        }
        
        .custom-size {
          display: flex;
          gap: 8px;
        }
        
        .size-input {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        
        .size-input label {
          font-size: 11px;
          margin: 0;
        }
        
        .size-input input {
          width: 60px;
          padding: 4px;
          background: #374151;
          color: white;
          border: 1px solid #4b5563;
          border-radius: 4px;
          font-size: 12px;
        }
        
        .color-controls {
          margin-bottom: 12px;
        }
        
        .color-controls label {
          display: block;
          font-size: 12px;
          color: #9ca3af;
          margin-bottom: 4px;
        }
        
        .preset-colors {
          display: flex;
          gap: 4px;
          margin-bottom: 8px;
        }
        
        .color-button {
          width: 24px;
          height: 24px;
          border: 2px solid transparent;
          border-radius: 4px;
          cursor: pointer;
          transition: border-color 0.2s;
        }
        
        .color-button.active {
          border-color: white;
        }
        
        .color-picker {
          width: 60px;
          height: 30px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        
        .opacity-control {
          margin-bottom: 12px;
        }
        
        .opacity-control label {
          display: block;
          font-size: 12px;
          color: #9ca3af;
          margin-bottom: 4px;
        }
        
        .opacity-slider {
          width: 100%;
          height: 6px;
          background: #374151;
          border-radius: 3px;
          outline: none;
          cursor: pointer;
        }
        
        .text-controls {
          margin-bottom: 12px;
        }
        
        .text-input,
        .font-size {
          margin-bottom: 8px;
        }
        
        .text-input label,
        .font-size label {
          display: block;
          font-size: 12px;
          color: #9ca3af;
          margin-bottom: 4px;
        }
        
        .text-input input,
        .font-size input {
          width: 100%;
          padding: 6px;
          background: #374151;
          color: white;
          border: 1px solid #4b5563;
          border-radius: 4px;
          font-size: 12px;
        }
        
        .font-size input {
          width: 80px;
        }
        
        .creation-instructions {
          font-size: 11px;
          color: #9ca3af;
          text-align: center;
          padding: 8px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 4px;
        }
      `}</style>
    </div>
  );
}
