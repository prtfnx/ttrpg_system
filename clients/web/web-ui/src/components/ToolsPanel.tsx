import { useState } from 'react';
import { useGameStore } from '../store';
import { useWebSocket } from '../hooks/useWebSocket';

export function ToolsPanel() {
  const { isConnected, sessionId, sprites, camera } = useGameStore();
  const { sendSpriteCreate, sendSpriteRemove } = useWebSocket('ws://localhost:8000/ws');
  const [newSpriteName, setNewSpriteName] = useState('');

  const handleAddSprite = () => {
    const sprite = {
      id: `sprite_${Date.now()}`,
      name: newSpriteName || `Sprite ${Date.now()}`,
      x: camera.x + Math.random() * 200,
      y: camera.y + Math.random() * 200,
      width: 50,
      height: 50,
      imageUrl: '',
      layer: 0,
      isSelected: false,
      isVisible: true
    };
    
    sendSpriteCreate(sprite);
    setNewSpriteName('');
  };

  const removeSprite = (spriteId: string) => {
    sendSpriteRemove(spriteId);
  };

  return (
    <div className="game-panel">
      <h2>Tools</h2>
      
      <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
        {isConnected ? `Connected: ${sessionId}` : 'Disconnected'}
      </div>

      <div className="sprite-creation">
        <h3>Create Sprite</h3>
        <input
          type="text"
          placeholder="Sprite name"
          value={newSpriteName}
          onChange={(e) => setNewSpriteName(e.target.value)}
          style={{
            width: '100%',
            padding: '8px',
            marginBottom: '8px',
            border: '1px solid #ccc',
            borderRadius: '4px'
          }}
        />
        <button onClick={handleAddSprite} style={{
          width: '100%',
          padding: '8px',
          backgroundColor: '#4ade80',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}>
          Add Sprite
        </button>
      </div>

      <div className="sprite-list">
        <h3>Sprites ({sprites.length})</h3>
        {sprites.map((sprite) => (
          <div key={sprite.id} style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '4px 0',
            borderBottom: '1px solid #eee'
          }}>
            <div>
              <div style={{ fontWeight: 'bold' }}>{sprite.name}</div>
              <div style={{ fontSize: '12px', color: '#666' }}>
                ({Math.round(sprite.x)}, {Math.round(sprite.y)})
              </div>
            </div>
            <button 
              onClick={() => removeSprite(sprite.id)}
              style={{
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 8px',
                cursor: 'pointer'
              }}
            >
              Remove
            </button>
          </div>
        ))}
        {sprites.length === 0 && (
          <div style={{ color: '#666', fontStyle: 'italic' }}>
            No sprites on table
          </div>
        )}
      </div>

      <div className="toolbar">
        <button className="active">
          Select Tool
        </button>
        <button>
          Move Tool
        </button>
        <button>
          Measure Tool
        </button>
        <button>
          Paint Tool
        </button>
      </div>

      <div className="controls-help">
        <h3>Controls</h3>
        <ul style={{ fontSize: '12px', color: '#666' }}>
          <li>Click & drag sprites to move</li>
          <li>Drag empty space to pan camera</li>
          <li>Mouse wheel to zoom in/out</li>
        </ul>
      </div>
    </div>
  )
}
