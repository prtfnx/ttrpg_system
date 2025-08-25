// import { useState } from 'react';
import { useEffect, useState } from 'react';
import { useGameStore } from '../store';
import DiceRoller from '../tools/DiceRoller';
import type { GameAPI } from '../types';
import { AlignmentHelper } from './AlignmentHelper';
import { AssetManager } from './AssetManager';
import { GridControls } from './GridControls';
import { LayerPanel } from './LayerPanel';
import { MeasurementTool } from './MeasurementTool';
import { PaintPanel } from './PaintPanel';

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
  const [assetManagerVisible, setAssetManagerVisible] = useState(false);
  const [paintPanelVisible, setPaintPanelVisible] = useState(false);
  
  // Shape creation settings
  const [shapeColor, setShapeColor] = useState('#0080ff'); // Default blue
  const [shapeOpacity, setShapeOpacity] = useState(1.0); // Default fully opaque
  const [shapeFilled, setShapeFilled] = useState(false); // Default outline only
  
  const { 
    isConnected, 
    sessionId, 
    activeLayer, 
    activeTool, 
    measurementActive, 
    alignmentActive, 
    setActiveTool 
  } = useGameStore();
  
  // Handle tool changes and communicate with Rust backend
  useEffect(() => {
    if (window.rustRenderManager) {
      console.log(`[ToolsPanel] Tool changed to: ${activeTool}`);
      
      // Exit paint mode when switching away from paint tool
      if (activeTool !== 'paint' && window.rustRenderManager.paint_is_mode()) {
        window.rustRenderManager.paint_exit_mode();
        setPaintPanelVisible(false); // Hide paint panel
        console.log('[ToolsPanel] Exited paint mode and hid paint panel');
      }
      
      // Store shape settings in window for access by shape creation
      (window as any).shapeSettings = {
        color: shapeColor,
        opacity: shapeOpacity,
        filled: shapeFilled
      };
      
      // Handle specific tool activations
      switch (activeTool) {
        case 'measure':
          window.rustRenderManager.set_input_mode_measurement();
          console.log('[ToolsPanel] Measurement tool activated');
          break;
        case 'rectangle':
          window.rustRenderManager.set_input_mode_create_rectangle();
          console.log('[ToolsPanel] Rectangle creation tool activated');
          break;
        case 'circle':
          window.rustRenderManager.set_input_mode_create_circle();
          console.log('[ToolsPanel] Circle creation tool activated');
          break;
        case 'line':
          window.rustRenderManager.set_input_mode_create_line();
          console.log('[ToolsPanel] Line creation tool activated');
          break;
        case 'text':
          window.rustRenderManager.set_input_mode_create_text();
          console.log('[ToolsPanel] Text creation tool activated');
          break;
        case 'paint':
          window.rustRenderManager.set_input_mode_paint();
          window.rustRenderManager.paint_enter_mode(800, 600); // Also enter paint mode
          console.log('[ToolsPanel] Paint tool activated');
          break;
        case 'select':
        case 'move':
        default:
          window.rustRenderManager.set_input_mode_select();
          console.log(`[ToolsPanel] ${activeTool} tool activated`);
          break;
      }
    }
  }, [activeTool, shapeColor, shapeOpacity, shapeFilled]); // Add shape settings as dependencies
  
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
      
      // Trigger sprite sync event
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('spriteAdded'));
      }, 500);
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
            
            // Trigger sprite sync event
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('spriteAdded'));
            }, 1000); // Wait a bit for sprites to be processed
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






      {/* Enhanced Toolbar Section */}
      <div className="toolbar">
        <button 
          className={activeTool === 'select' ? 'active' : ''} 
          onClick={() => setActiveTool('select')}
          title="Select Tool"
        >
          🔍 Select
        </button>
        <button 
          className={activeTool === 'move' ? 'active' : ''} 
          onClick={() => setActiveTool('move')}
          title="Move Tool"
        >
          ✋ Move
        </button>
        <button 
          className={activeTool === 'measure' ? 'active' : ''} 
          onClick={() => setActiveTool('measure')}
          title="Measurement Tool"
        >
          📏 Measure
        </button>
        <button 
          className={activeTool === 'align' ? 'active' : ''} 
          onClick={() => setActiveTool('align')}
          title="Alignment Helper"
        >
          📐 Align
        </button>
      </div>

      {/* Sprite Creation Tools */}
      <div className="creation-toolbar">
        <h4>Create Sprites</h4>
        <div className="creation-buttons">
          <button 
            className={activeTool === 'rectangle' ? 'active' : ''} 
            onClick={() => setActiveTool('rectangle')}
            title="Create Rectangle"
          >
            ⬛ Rectangle
          </button>
          <button 
            className={activeTool === 'circle' ? 'active' : ''} 
            onClick={() => setActiveTool('circle')}
            title="Create Circle"
          >
            ⭕ Circle
          </button>
          <button 
            className={activeTool === 'line' ? 'active' : ''} 
            onClick={() => setActiveTool('line')}
            title="Create Line"
          >
            📏 Line
          </button>
          <button 
            className={activeTool === 'text' ? 'active' : ''} 
            onClick={() => setActiveTool('text')}
            title="Create Text"
          >
            🔤 Text
          </button>
        </div>
        
        {/* Shape Creation Settings */}
        {(['rectangle', 'circle', 'line'].includes(activeTool)) && (
          <div className="shape-settings">
            <h5>Shape Settings</h5>
            <div className="setting-row">
              <label htmlFor="shape-color">Color:</label>
              <input
                id="shape-color"
                type="color"
                value={shapeColor}
                onChange={(e) => setShapeColor(e.target.value)}
              />
            </div>
            <div className="setting-row">
              <label htmlFor="shape-opacity">Opacity:</label>
              <input
                id="shape-opacity"
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={shapeOpacity}
                onChange={(e) => setShapeOpacity(parseFloat(e.target.value))}
              />
              <span>{Math.round(shapeOpacity * 100)}%</span>
            </div>
            <div className="setting-row">
              <label htmlFor="shape-filled">
                <input
                  id="shape-filled"
                  type="checkbox"
                  checked={shapeFilled}
                  onChange={(e) => setShapeFilled(e.target.checked)}
                />
                Filled
              </label>
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="creation-buttons">
          <button
            className="tool-button"
            onClick={() => setAssetManagerVisible(true)}
            title="Asset Manager"
          >
            📁 Assets
          </button>
          <button
            className={`tool-button ${activeTool === 'paint' ? 'active' : ''}`}
            onClick={() => {
              if (window.rustRenderManager) {
                console.log('[ToolsPanel] Activating paint tool');
                window.rustRenderManager.set_input_mode_paint();
                setActiveTool('paint');
                setPaintPanelVisible(true);
              } else {
                console.warn('[ToolsPanel] Cannot activate paint tool: render manager not available');
              }
            }}
            title="Paint System"
          >
            🎨 Paint
          </button>
        </div>
      </div>

      {/* Paint Panel */}
      {paintPanelVisible && (
        <PaintPanel 
          renderEngine={window.rustRenderManager as any || null}
          isVisible={paintPanelVisible} 
          onClose={() => setPaintPanelVisible(false)} 
        />
      )}

      {/* Layer Management Panel */}
      <LayerPanel />

      {/* Grid Controls */}
      <GridControls />

      {/* Dice Roller Tool */}
      <DiceRoller />

      {/* Controls Help Section */}
      <div className="game-panel">
        <h3 className="panel-title">Controls</h3>
        <ul className="controls-list">
          <li>Click & drag sprites to move</li>
          <li>Drag empty space to pan camera</li>
          <li>Mouse wheel to zoom in/out</li>
          <li>Ctrl+click for multi-select</li>
          <li>Drag rectangle to area select</li>
        </ul>
      </div>

      {/* Tool Overlays */}
      <MeasurementTool isActive={measurementActive} />
      <AlignmentHelper isActive={alignmentActive} />
      
      {/* Asset Manager */}
      <AssetManager 
        isVisible={assetManagerVisible} 
        onClose={() => setAssetManagerVisible(false)} 
        sessionCode={sessionId}
        userInfo={{ username: window.gameAPI?.user?.username || 'unknown', role: window.gameAPI?.user?.role || 'player' }}
      />
    </div>
  );
}
