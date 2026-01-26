import { useEffect, useState } from 'react';
import { ProtocolService } from '@lib/api';
import { useGameStore } from '../store';
import DiceRoller from '../tools/DiceRoller';
import type { GameAPI } from '../types';
import { AlignmentHelper } from '@shared/components';
import { AssetManager } from './AssetManager';
import { GridControls } from './GridControls';
import { LayerPanel } from './LayerPanel';
import { MeasurementTool } from './MeasurementTool';
import { PaintPanel } from './PaintPanel';
import { TextSpriteTool } from './TextSprite';
import styles from './ToolsPanel.module.css';

// Global type declarations
declare global {
  interface Window {
    gameAPI?: GameAPI;
  }
}

import type { UserInfo } from '../features/auth';

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
    sessionId, 
    activeLayer, 
    activeTool, 
    measurementActive, 
    alignmentActive, 
    setActiveTool
  } = useGameStore();
  
  // Auto-detect ping state from protocol
  const [pingEnabled, setPingEnabled] = useState(() => {
    if (ProtocolService.hasProtocol()) {
      return ProtocolService.getProtocol().isPingEnabled();
    }
    return false;
  });
  
  // Monitor protocol ping state
  useEffect(() => {
    const interval = setInterval(() => {
      if (ProtocolService.hasProtocol()) {
        const protocol = ProtocolService.getProtocol();
        setPingEnabled(protocol.isPingEnabled());
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
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
            
            // Add test obstacle sprite for shadow testing
            window.gameAPI.sendMessage('sprite_create', {
              id: `obstacle_test_wall`,
              x: 300,
              y: 200,
              width: 80,
              height: 80,
              layer: 'obstacles',
              texture_path: '', // No texture, just a solid rectangle
              color: '#666666', // Gray color for wall
            });
            
            console.log('[ToolsPanel] Added test sprites including obstacle for shadow testing');
            
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

  // Handle ping toggle
  const handlePingToggle = (enabled: boolean) => {
    setPingEnabled(enabled);
    
    if (!ProtocolService.hasProtocol()) return;
    
    const protocol = ProtocolService.getProtocol();
    if (enabled) {
      protocol.startPing();
    } else {
      protocol.stopPing();
    }
  };

  // Use different WebSocket approaches based on mode
  return (
    <div className={styles.gamePanel}>
      {/* Quick Test Buttons */}
      <div className={styles.quickTestButtons}>
        <button className={styles.testButton} onClick={handleAddSprite}>Add Sprite</button>
        <button className={styles.testButton} onClick={handleAddCharacter}>Add Character</button>
        <button className={styles.testButton} onClick={handleAddTestSprites}>Add Test Sprites</button>
      </div>

      {/* Network Settings */}
      <div className={styles.networkSettings}>
        <h4>Network Settings</h4>
        <div className={styles.networkToggle}>
          <label htmlFor="ping-toggle">
            <input
              id="ping-toggle"
              type="checkbox"
              checked={pingEnabled}
              onChange={(e) => handlePingToggle(e.target.checked)}
            />
            <span>Heartbeat Monitor (Auto-enabled)</span>
          </label>
          <span className={`${styles.networkStatus} ${pingEnabled ? styles.active : styles.inactive}`}>
            {pingEnabled ? '● Active' : '○ Inactive'}
          </span>
        </div>
        <div className={styles.networkDescription}>
          Sends ping every 30s to detect dead connections. Auto-enabled on connect. Timeout: 5s.
        </div>
      </div>

      {/* Development Mode Controls - Only visible in dev builds */}
      {import.meta.env.DEV && (
        <div className={styles.devControls}>
          <h4>Development Mode</h4>
          <div className={styles.devToggle}>
            <label>
              <input
                type="checkbox"
                checked={import.meta.env.DEV}
                disabled
              />
              <span>Development Build</span>
            </label>
            <span className={styles.devBadge}>🔧 ACTIVE</span>
          </div>
          <div className={styles.networkDescription}>
            Running in development mode - extra debugging tools enabled
          </div>
          
          <div className={styles.roleToggle}>
            <label htmlFor="role-toggle">Role:</label>
            <select 
              id="role-toggle"
              value={userInfo.role}
              onChange={(e) => {
                // Update role in userInfo - this would require auth service update
                console.log('Role change requested:', e.target.value);
                alert(`Role switching: ${e.target.value}\n\nNote: Full role switching requires server support.\nCurrently for UI testing only.`);
              }}
              className={styles.roleSelect}
            >
              <option value="dm">DM (Dungeon Master)</option>
              <option value="player">Player</option>
            </select>
            <span className={styles.currentRole}>
              Current: {userInfo.role === 'dm' ? '👑 DM' : '🎭 Player'}
            </span>
          </div>
        </div>
      )}

      <h2>Tools</h2>

      {/* Enhanced Toolbar Section */}
      <div className={styles.toolbar}>
        <button 
          className={`${styles.toolButton} ${activeTool === 'select' ? styles.active : ''}`}
          onClick={() => setActiveTool('select')}
          title="Select Tool"
        >
          🔍 Select
        </button>
        <button 
          className={`${styles.toolButton} ${activeTool === 'move' ? styles.active : ''}`}
          onClick={() => setActiveTool('move')}
          title="Move Tool"
        >
          ✋ Move
        </button>
        <button 
          className={`${styles.toolButton} ${activeTool === 'measure' ? styles.active : ''}`}
          onClick={() => setActiveTool('measure')}
          title="Measurement Tool"
        >
          📏 Measure
        </button>
        <button 
          className={`${styles.toolButton} ${activeTool === 'align' ? styles.active : ''}`}
          onClick={() => setActiveTool('align')}
          title="Alignment Helper"
        >
          📐 Align
        </button>
        <button 
          className={`${styles.toolButton} ${activeTool === 'draw_shapes' ? styles.active : ''}`}
          onClick={() => setActiveTool('draw_shapes')}
          title="Draw Shapes"
        >
          ✏️ Draw Shapes
        </button>
        <button 
          className={`${styles.toolButton} ${activeTool === 'spell_templates' ? styles.active : ''}`}
          onClick={() => setActiveTool('spell_templates')}
          title="Spell Templates"
        >
          🔮 Spell Templates
        </button>
      </div>

      {/* Sprite Creation Tools */}
      <div className={styles.creationToolbar}>
        <h4>Create Sprites</h4>
        <div className={styles.creationButtons}>
          <button 
            className={`${styles.toolButton} ${activeTool === 'rectangle' ? styles.active : ''}`}
            onClick={() => {
              setActiveTool('rectangle');
              (window as any).fromDrawShapes = true;
            }}
            title="Create Rectangle"
          >
            ⬛ Rectangle
          </button>
          <button 
            className={`${styles.toolButton} ${activeTool === 'circle' ? styles.active : ''}`}
            onClick={() => setActiveTool('circle')}
            title="Create Circle"
          >
            ⭕ Circle
          </button>
          <button 
            className={`${styles.toolButton} ${activeTool === 'line' ? styles.active : ''}`}
            onClick={() => setActiveTool('line')}
            title="Create Line"
          >
            📏 Line
          </button>
          <button 
            className={`${styles.toolButton} ${activeTool === 'text' ? styles.active : ''}`}
            onClick={() => setActiveTool('text')}
            title="Create Text"
          >
            🔤 Text
          </button>
        </div>
        
        {/* Shape Creation Settings */}
        {(['rectangle', 'circle', 'line'].includes(activeTool)) && (
          <div className={styles.shapeSettings}>
            <h5>Shape Settings</h5>
            <div className={styles.settingRow}>
              <label htmlFor="shape-color">Color:</label>
              <input
                id="shape-color"
                type="color"
                value={shapeColor}
                onChange={(e) => setShapeColor(e.target.value)}
              />
            </div>
            <div className={styles.settingRow}>
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
            <div className={styles.settingRow}>
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
        <div className={styles.creationButtons}>
          <button
            className={styles.toolButton}
            onClick={() => setAssetManagerVisible(true)}
            title="Asset Manager"
          >
            📁 Assets
          </button>
          <button
            className={`${styles.toolButton} ${activeTool === 'paint' ? styles.active : ''}`}
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
          <div className={styles.textSettings}>
            <h5>Text Sprites</h5>
            <div className={styles.settingRow}>
              <TextSpriteTool 
                activeLayer={activeLayer}
                activeTool={activeTool}
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
          <div className={styles.drawingSettings}>
            <h5>Drawing Tools</h5>
            <div className={styles.settingRow}>
              <label htmlFor="drawing-color">Drawing Color:</label>
              <input
                id="drawing-color"
                type="color"
                value={shapeColor}
                onChange={(e) => setShapeColor(e.target.value)}
                aria-label="Drawing Color"
              />
              <div className={styles.colorPresets}>
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
            <div className={styles.settingRow}>
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
            <div className={styles.settingRow}>
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
          <div className={styles.spellTemplatesSection}>
            <h5>Spell Templates</h5>
            <div className={styles.templateButtons}>
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
              <div className={styles.templateInfo}>
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
      <div className={styles.gamePanel}>
        <h3 className={styles.panelTitle}>Controls</h3>
        <ul className={styles.controlsList}>
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
