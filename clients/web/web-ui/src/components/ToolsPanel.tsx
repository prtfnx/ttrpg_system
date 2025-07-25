import { useState } from 'react';
import { useGameStore } from '../store';
import { useCharacterStore } from '../store/characterStore';

// Global type declarations
declare global {
  interface Window {
    gameAPI?: {
      sendMessage: (type: string, data: any) => void;
      renderManager: () => any;
    };
  }
}

// Integration mode detection
const isIntegrationMode = !document.getElementById('root');

export function ToolsPanel() {
  console.log('[ToolsPanel] Component mounted');
  // Sprite and test handlers (stub implementations)
  const handleAddSprite = () => {
    console.log('[ToolsPanel] Add Sprite button pressed');
    if (window.gameAPI && window.gameAPI.sendMessage) {
      const spriteData = {
        id: `sprite_${Date.now()}`,
        x: Math.floor(Math.random() * 800),
        y: Math.floor(Math.random() * 600),
        width: 40,
        height: 40,
        layer: 'tokens',
        texture_path: 'hero.png',
        color: '#00CC33',
      };
      console.log('[ToolsPanel] Sending sprite_create:', spriteData);
      window.gameAPI.sendMessage('sprite_create', spriteData);
    } else {
      console.warn('[ToolsPanel] window.gameAPI.sendMessage not available');
    }
  };
  const handleAddCharacter = () => {
    if (window.gameAPI && window.gameAPI.sendMessage) {
      window.gameAPI.sendMessage('character_create', {
        id: `char_${Date.now()}`,
        name: 'Test Character',
        class: 'Fighter',
        stats: {
          strength: 15,
          dexterity: 12,
          constitution: 14,
          intelligence: 10,
          wisdom: 10,
          charisma: 8,
        },
      });
    }
  };
  const handleAddTestSprites = () => {
    if (window.gameAPI && window.gameAPI.sendMessage) {
      // Preload textures before creating sprites
      const preloadTexture = (name: string, src: string, callback: () => void) => {
        const img = new window.Image();
        img.onload = () => {
          if (window.rustRenderManager && window.rustRenderManager.load_texture) {
            window.rustRenderManager.load_texture(name, img);
          }
          callback();
        };
        img.onerror = () => {
          console.warn(`[ToolsPanel] Failed to load texture: ${src}`);
          callback();
        };
        img.src = src;
      };

      // Load both textures, then create sprites
      preloadTexture('Hero.png', '/static/resources/Hero.png', () => {
        preloadTexture('treasure.png', '/static/resources/treasure.png', () => {
          if (window.gameAPI && window.gameAPI.sendMessage) {
            window.gameAPI.sendMessage('sprite_create', {
              id: `sprite_test_1`,
              x: 100,
              y: 100,
              width: 40,
              height: 40,
              layer: 'tokens',
              texture_path: 'Hero.png',
              color: '#00CC33',
            });
            window.gameAPI.sendMessage('sprite_create', {
              id: `sprite_test_2`,
              x: 200,
              y: 150,
              width: 35,
              height: 35,
              layer: 'tokens',
              texture_path: 'treasure.png',
              color: '#CC3300',
            });
          }
        });
      });
    }
  };
  const { isConnected, sessionId } = useGameStore();
  // Character creation state
  const [charName, setCharName] = useState('');
  const [charClass, setCharClass] = useState('');
  const [charStats, setCharStats] = useState({
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
  });
  const { characters, addCharacter, removeCharacter } = useCharacterStore();

  // Use different WebSocket approaches based on mode
  return (
    <div className="game-panel">
      {/* Quick Test Buttons */}
      <div className="quick-test-buttons" style={{ marginBottom: '16px' }}>
        <button onClick={handleAddSprite} style={{ marginRight: '8px' }}>Add Sprite</button>
        <button onClick={handleAddCharacter} style={{ marginRight: '8px' }}>Add Character</button>
        <button onClick={handleAddTestSprites}>Add Test Sprites</button>
      </div>
      <h2>Tools</h2>
      <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
        {isConnected ? `Connected: ${sessionId}` : 'Disconnected'}
        {isIntegrationMode && <span> (Integration Mode)</span>}
      </div>

      {/* Character Creation Section */}
      <div className="character-creation">
        <h3>Create Character</h3>
        <input
          type="text"
          placeholder="Name"
          value={charName}
          onChange={e => setCharName(e.target.value)}
          style={{ width: '100%', padding: '8px', marginBottom: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
        />
        <input
          type="text"
          placeholder="Class"
          value={charClass}
          onChange={e => setCharClass(e.target.value)}
          style={{ width: '100%', padding: '8px', marginBottom: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '8px' }}>
          {Object.entries(charStats).map(([stat, value]) => (
            <div key={stat} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <label style={{ fontSize: '12px' }}>{stat.charAt(0).toUpperCase() + stat.slice(1)}</label>
              <input
                type="number"
                min={1}
                max={20}
                value={value}
                onChange={e => setCharStats(s => ({ ...s, [stat]: Number(e.target.value) }))}
                style={{ width: '40px', textAlign: 'center' }}
              />
            </div>
          ))}
        </div>
        <button
          onClick={() => {
            if (!charName || !charClass) return;
            addCharacter({
              name: charName,
              class: charClass,
              stats: charStats,
              inventory: [],
              conditions: [],
            });
            setCharName('');
            setCharClass('');
            setCharStats({ strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 });
          }}
          style={{ width: '100%', padding: '8px', backgroundColor: '#6366f1', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginBottom: '8px' }}
        >
          Add Character
        </button>
      </div>

      {/* Character List Section */}
      <div className="character-list">
        <h3>Characters ({characters.length})</h3>
        {characters.map(char => (
          <div key={char.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #eee' }}>
            <div>
              <div style={{ fontWeight: 'bold' }}>{char.name} <span style={{ fontSize: '12px', color: '#666' }}>({char.class})</span></div>
              <div style={{ fontSize: '12px', color: '#666' }}>
                STR:{char.stats.strength} DEX:{char.stats.dexterity} CON:{char.stats.constitution} INT:{char.stats.intelligence} WIS:{char.stats.wisdom} CHA:{char.stats.charisma}
              </div>
            </div>
            <button
              onClick={() => removeCharacter(char.id)}
              style={{ backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer' }}
            >
              Remove
            </button>
          </div>
        ))}
        {characters.length === 0 && (
          <div style={{ color: '#666', fontStyle: 'italic' }}>No characters created</div>
        )}
      </div>

      {/* Toolbar Section */}
      <div className="toolbar">
        <button className="active">Select Tool</button>
        <button>Move Tool</button>
        <button>Measure Tool</button>
        <button>Paint Tool</button>
      </div>

      {/* Controls Help Section */}
      <div className="controls-help">
        <h3>Controls</h3>
        <ul style={{ fontSize: '12px', color: '#666' }}>
          <li>Click & drag sprites to move</li>
          <li>Drag empty space to pan camera</li>
          <li>Mouse wheel to zoom in/out</li>
        </ul>
      </div>
    </div>
  );
}
