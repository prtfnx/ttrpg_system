import { useState } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { useGameStore } from '../store';

export function ToolsPanel() {
  const { isConnected, sessionId, sprites, camera } = useGameStore();
  const { sendSpriteCreate, sendMessage } = useWebSocket('ws://127.0.0.1:12345/ws');
  const [newSpriteName, setNewSpriteName] = useState('');

  const handleAddSprite = () => {
    const sprite = {
      name: newSpriteName || `Sprite ${Date.now()}`,
      x: camera.x + Math.random() * 200,
      y: camera.y + Math.random() * 200,
      width: 50,
      height: 50,
      layer: 0
    };
    
    sendSpriteCreate(sprite);
    setNewSpriteName('');
  };

  const addTestSprites = () => {
    const testSprites = [
      { name: 'Hero', x: 100, y: 100, width: 40, height: 40, layer: 1 },
      { name: 'Enemy', x: 200, y: 150, width: 35, height: 35, layer: 1 },
      { name: 'Chest', x: 300, y: 200, width: 30, height: 25, layer: 0 }
    ];
    
    testSprites.forEach(sprite => sendSpriteCreate(sprite));
  };

  const removeSprite = (spriteId: string) => {
    sendMessage('sprite_remove', { id: spriteId });
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
          cursor: 'pointer',
          marginBottom: '8px'
        }}>
          Add Sprite
        </button>
        
        <button onClick={addTestSprites} style={{
          width: '100%',
          padding: '8px',
          backgroundColor: '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}>
          Add Test Sprites
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
