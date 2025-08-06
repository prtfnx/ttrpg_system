// import { useState } from 'react';
import { useGameStore } from '../store';
import DiceRoller from '../tools/DiceRoller';
import type { GameAPI } from '../types';
import { LayerPanel } from './LayerPanel';

// Global type declarations
declare global {
  interface Window {
    gameAPI?: GameAPI;
  }
}

// Integration mode detection
const isIntegrationMode = !document.getElementById('root');

export function ToolsPanel() {
  console.log('[ToolsPanel] Component mounted');
  const { isConnected, sessionId, activeLayer } = useGameStore();
  
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
        layer: activeLayer, // Use the active layer
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
  // Character creation state


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






      {/* Toolbar Section */}
      <div className="toolbar">
        <button className="active">Select Tool</button>
        <button>Move Tool</button>
        <button>Measure Tool</button>
        <button>Paint Tool</button>
      </div>

      {/* Layer Management Panel */}
      <div style={{ margin: '24px 0' }}>
        <LayerPanel />
      </div>

      {/* Dice Roller Tool */}
      <div style={{ margin: '24px 0', padding: 16, background: '#f9fafb', borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <h3 style={{ marginBottom: 8 }}>Dice Roller</h3>
        <DiceRoller />
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
