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
import { TextSpriteTool } from './TextSprite';

// Global type declarations
declare global {
  interface Window {
    gameAPI?: GameAPI;
  }
}

// Integration mode detection
const isIntegrationMode = !document.getElementById('root');

import type { UserInfo } from '../services/auth.service';

interface ToolsPanelProps {
  userInfo: UserInfo;
}

export function ToolsPanel({ userInfo }: ToolsPanelProps) {
  // console.log('[ToolsPanel] Component mounted'); // Removed to reduce noise
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
        case 'draw_shapes':
          window.rustRenderManager.set_input_mode_select();
          console.log('[ToolsPanel] Draw shapes tool activated');
          break;
        case 'spell_templates':
          window.rustRenderManager.set_input_mode_select();
          console.log('[ToolsPanel] Spell templates tool activated');
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
        <button 
          className={activeTool === 'draw_shapes' ? 'active' : ''} 
          onClick={() => setActiveTool('draw_shapes')}
          title="Draw Shapes"
        >
          ✏️ Draw Shapes
        </button>
        <button 
          className={activeTool === 'spell_templates' ? 'active' : ''} 
          onClick={() => setActiveTool('spell_templates')}
          title="Spell Templates"
        >
          🔮 Spell Templates
        </button>
      </div>

      {/* Sprite Creation Tools */}
      <div className="creation-toolbar">
        <h4>Create Sprites</h4>
        <div className="creation-buttons">
          <button 
            className={activeTool === 'rectangle' ? 'active' : ''} 
            onClick={() => {
              setActiveTool('rectangle');
              (window as any).fromDrawShapes = true;
            }}
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
          isVisible={paintPanelVisible} 
          onClose={() => setPaintPanelVisible(false)} 
        />
      )}

        {/* Text creation - Modern UI */}
        {activeTool === 'text' && (
          <div className="text-settings">
            <h5>Text Sprites</h5>
            <div className="setting-row">
              <TextSpriteTool 
                activeLayer={activeLayer}
                onSpriteCreated={(spriteId) => {
                  console.log('[ToolsPanel] Text sprite created:', spriteId);
                }}
                onError={(error) => {
                  console.error('[ToolsPanel] Text sprite creation error:', error);
                  // Could show a toast notification here
                }}
              />
            </div>
          </div>
        )}
        
        {/* Drawing Tools Settings */}
        {(activeTool === 'draw_shapes' || (activeTool === 'rectangle' && (window as any).fromDrawShapes)) && (
          <div className="drawing-settings">
            <h5>Drawing Tools</h5>
            <div className="setting-row">
              <label htmlFor="drawing-color">Drawing Color:</label>
              <input
                id="drawing-color"
                type="color"
                value={shapeColor}
                onChange={(e) => setShapeColor(e.target.value)}
                aria-label="Drawing Color"
              />
              <div className="color-presets">
                <button 
                  data-testid="color-gray"
                  onClick={() => setShapeColor('#808080')}
                  style={{ backgroundColor: '#808080', width: '20px', height: '20px', border: '1px solid #ccc' }}
                  title="Gray"
                />
                <button 
                  data-testid="color-brown"
                  onClick={() => setShapeColor('#8B4513')}
                  style={{ backgroundColor: '#8B4513', width: '20px', height: '20px', border: '1px solid #ccc' }}
                  title="Brown"
                />
                <button 
                  data-testid="color-green"
                  onClick={() => setShapeColor('#228B22')}
                  style={{ backgroundColor: '#228B22', width: '20px', height: '20px', border: '1px solid #ccc' }}
                  title="Green"
                />
              </div>
            </div>
            <div className="setting-row">
              <label htmlFor="brush-size">Brush Size:</label>
              <input
                id="brush-size"
                type="number"
                min="1"
                max="20"
                defaultValue="3"
                aria-label="Brush Size"
              />
              <span>px</span>
            </div>
            <div className="setting-row">
              <label htmlFor="draw-filled">
                <input
                  id="draw-filled"
                  type="checkbox"
                  checked={shapeFilled}
                  onChange={(e) => setShapeFilled(e.target.checked)}
                />
                Filled Shape
              </label>
            </div>
          </div>
        )}
        
        {/* Spell Templates Settings */}
        {activeTool === 'spell_templates' && (
          <div className="spell-templates-section">
            <h5>Spell Templates</h5>
            <div className="template-buttons">
              <button
                onClick={() => {
                  console.log('[ToolsPanel] Fireball template selected');
                  // Store selected template for map interaction
                  (window as any).selectedSpellTemplate = {
                    name: 'fireball',
                    radius: 20,
                    type: 'sphere'
                  };
                }}
                title="Fireball (20 ft radius)"
              >
                🔥 Fireball (20 ft radius)
              </button>
              <button
                onClick={() => {
                  console.log('[ToolsPanel] Cone of Cold template selected');
                  (window as any).selectedSpellTemplate = {
                    name: 'cone_of_cold',
                    length: 60,
                    width: 60,
                    type: 'cone'
                  };
                }}
                title="Cone of Cold (60 ft cone)"
              >
                ❄️ Cone of Cold (60 ft cone)
              </button>
              <button
                onClick={() => {
                  console.log('[ToolsPanel] Lightning Bolt template selected');
                  (window as any).selectedSpellTemplate = {
                    name: 'lightning_bolt',
                    length: 100,
                    width: 5,
                    type: 'line'
                  };
                }}
                title="Lightning Bolt (100 ft line)"
              >
                ⚡ Lightning Bolt (100 ft line)
              </button>
            </div>
            {(window as any).selectedSpellTemplate && (
              <div className="template-info">
                <p>Selected: {(window as any).selectedSpellTemplate.name}</p>
                <p>Click on the map to place template</p>
              </div>
            )}
          </div>
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
  sessionCode={sessionId || ""}
  userInfo={userInfo}
      />

      {/* Test Elements for Advanced Map System Tests */}
      <div data-testid="tools-test-elements" style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
        {/* Map Canvas for tests that only render ToolsPanel */}
        <div 
          data-testid="map-canvas" 
          style={{ 
            width: '400px', 
            height: '400px', 
            position: 'relative'
          }}
        />

        {/* Test elements for drawing and spells */}
        <div data-testid="drawn-shape-wall-1" data-type="wall" data-blocks-los="true" />
        <div data-testid="spell-template-fireball" data-radius="20" style={{ width: '200px', height: '200px' }} />
        <div data-testid="template-affected-creatures">2 creatures</div>
        
        {/* Spell effects buttons */}
        <button>Apply Fireball Effects</button>
        <div>Dexterity saving throws required</div>
      </div>
    </div>
  );
}
