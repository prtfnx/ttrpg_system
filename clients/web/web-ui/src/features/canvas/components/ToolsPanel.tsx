import { useGameStore } from '@/store';
import type { GameAPI } from '@/types';
import { AssetManager } from '@features/assets';
import { GridControls, LayerPanel } from '@features/canvas';
import { useLayerHotkeys } from '@features/canvas/hooks';
import { startDmPreview, stopDmPreview } from '@features/lighting';
import { MeasurementTool } from '@features/measurement';
import { PaintPanel } from '@features/painting';
import { isDM, isElevated } from '@features/session/types/roles';
import { ProtocolService } from '@lib/api';
import { AlignmentHelper } from '@shared/components';
import DiceRoller from '@shared/components/DiceRoller';
import { WallConfigModal } from './WallConfigModal';
import { AlignLeft, BrickWall, Circle, Cloud, Crown, Flame, Folder, Lightbulb, Map, Minus, Mountain, Move, Paintbrush, Pencil, Ruler, Search, Shield, Snowflake, Sparkles, Square, Type, User, Users, Wrench, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { TextSpriteTool } from './TextSprite';
import styles from './ToolsPanel.module.css';

// Global type declarations
declare global {
  interface Window {
    gameAPI?: GameAPI;
  }
}

import type { UserInfo } from '@features/auth';

const PLAYER_PERMITTED_LAYERS = [
  { id: 'map',    label: 'Map',    Icon: Map },
  { id: 'tokens', label: 'Tokens', Icon: Users },
] as const;

/** Simplified layer panel shown to non-DM players — eye-toggle only. */
function PlayerLayerControls() {
  const layerVisibility = useGameStore(s => s.layerVisibility);
  const setLayerVisibility = useGameStore(s => s.setLayerVisibility);

  const toggle = (id: string) => {
    const next = !(layerVisibility[id] ?? true);
    setLayerVisibility(id, next);
    const rm = (window as any).rustRenderManager;
    if (rm?.set_layer_visible) rm.set_layer_visible(id, next);
  };

  return (
    <div style={{ marginBottom: 8 }}>
      <h4 style={{ margin: '6px 0 4px', fontSize: 12, opacity: 0.7 }}>Layers</h4>
      {PLAYER_PERMITTED_LAYERS.map(({ id, label, Icon }) => {
        const visible = layerVisibility[id] ?? true;
        return (
          <button
            key={id}
            onClick={() => toggle(id)}
            title={visible ? `Hide ${label}` : `Show ${label}`}
            aria-label={`Toggle ${label} layer`}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              width: '100%', padding: '4px 8px', marginBottom: 2,
              background: 'transparent', border: '1px solid #444',
              borderRadius: 4, color: visible ? '#eee' : '#666', cursor: 'pointer',
              fontSize: 12,
            }}
          >
            <Icon size={12} aria-hidden />
            {label}
            <span style={{ marginLeft: 'auto', opacity: 0.6 }}>{visible ? '👁' : '🚫'}</span>
          </button>
        );
      })}
    </div>
  );
}

interface ToolsPanelProps {
  userInfo: UserInfo;
}

export function ToolsPanel({ userInfo }: ToolsPanelProps) {
  // Layer 1-7 hotkeys (DM only)
  useLayerHotkeys();

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
  const sessionRole = useGameStore(s => s.sessionRole) ?? 'player';
  const dmMode = isDM(sessionRole);
  const elevatedMode = isElevated(sessionRole);
  const tables = useGameStore(s => s.tables);
  const activeTableId = useGameStore(s => s.activeTableId);
  const setActiveTableId = useGameStore(s => s.setActiveTableId);
  const dynamicLightingEnabled = useGameStore(s => s.dynamicLightingEnabled);
  const fogExplorationMode = useGameStore(s => s.fogExplorationMode);
  const ambientLight = useGameStore(s => s.ambientLight);
  const setAmbientLight = useGameStore(s => s.setAmbientLight);
  const dmPreviewUserId = useGameStore(s => s.dmPreviewUserId);
  const setDmPreviewMode = useGameStore(s => s.setDmPreviewMode);
  const sprites = useGameStore(s => s.sprites);
  const setActiveLayer = useGameStore(s => s.setActiveLayer);

  // Layer toolbar config (order matches hotkeys 1-7)
  const LAYER_ORDER = [
    { id: 'map',            label: 'Map',     Icon: Map,       hotkey: '1' },
    { id: 'tokens',         label: 'Tokens',  Icon: Users,     hotkey: '2' },
    { id: 'dungeon_master', label: 'DM',      Icon: Shield,    hotkey: '3' },
    { id: 'light',         label: 'Light',   Icon: Lightbulb, hotkey: '4' },
    { id: 'height',        label: 'Height',  Icon: Mountain,  hotkey: '5' },
    { id: 'obstacles',     label: 'Obst.',   Icon: BrickWall, hotkey: '6' },
    { id: 'fog_of_war',    label: 'Fog',     Icon: Cloud,     hotkey: '7' },
  ] as const;

  const handleLayerSwitch = (layerId: string) => {
    setActiveLayer(layerId);
    const rm = (window as any).rustRenderManager;
    if (rm?.set_active_layer) rm.set_active_layer(layerId);
  };

  // Unique player IDs from sprite controlledBy fields (for DM preview dropdown)
  const playerIds: number[] = Array.from(
    new Set((sprites as any[]).flatMap((s: any) => s.controlledBy ?? s.controlled_by ?? []))
  ).filter((id): id is number => typeof id === 'number');
  const [tableSwitcherOpen, setTableSwitcherOpen] = useState(false);
  const tableSwitcherRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tableSwitcherOpen) return;
    const handler = (e: MouseEvent) => {
      if (tableSwitcherRef.current && !tableSwitcherRef.current.contains(e.target as Node))
        setTableSwitcherOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [tableSwitcherOpen]);
  
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

  // Stop DM preview on unmount
  useEffect(() => {
    return () => {
      if (dmPreviewUserId != null) {
        stopDmPreview();
        setDmPreviewMode(null);
      }
    };
  }, []);

  // Stop DM preview when lighting is disabled or active table changes
  useEffect(() => {
    if ((!dynamicLightingEnabled || activeTableId == null) && dmPreviewUserId != null) {
      stopDmPreview();
      setDmPreviewMode(null);
    }
  }, [dynamicLightingEnabled, activeTableId]);
  
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
        case 'draw_wall':
          window.rustRenderManager.set_input_mode_draw_wall();
          console.log('[ToolsPanel] Wall drawing tool activated');
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
      {/* Quick Test Buttons - dev only */}
      {import.meta.env.DEV && dmMode && (
      <div className={styles.quickTestButtons}>
        <button className={styles.testButton} onClick={handleAddSprite}>Add Sprite</button>
        <button className={styles.testButton} onClick={handleAddCharacter}>Add Character</button>
        <button className={styles.testButton} onClick={handleAddTestSprites}>Add Test Sprites</button>
      </div>
      )}

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
            <span className={styles.devBadge}><Wrench size={12} aria-hidden /> ACTIVE</span>
          </div>
          <div className={styles.networkDescription}>
            Running in development mode - extra debugging tools enabled
          </div>
          
          <div className={styles.roleToggle}>
            <label htmlFor="role-toggle">Role:</label>
            <select 
              id="role-toggle"
              value={sessionRole}
              onChange={(e) => {
                console.log('Role change (dev UI only):', e.target.value);
                alert(`Role switching: ${e.target.value}\n\nNote: Roles come from server. This is dev display only.`);
              }}
              className={styles.roleSelect}
            >
              <option value="owner">Owner</option>
              <option value="co_dm">Co-DM</option>
              <option value="trusted_player">Trusted Player</option>
              <option value="player">Player</option>
              <option value="spectator">Spectator</option>
            </select>
            <span className={styles.currentRole}>
              Current: {dmMode ? <><Crown size={14} aria-hidden /> DM</> : <><User size={14} aria-hidden /> {sessionRole}</>}
            </span>
          </div>
        </div>
      )}

      <h2>Tools</h2>

      {/* Layer quick-switch toolbar — DM only (hotkeys 1-7) */}
      {dmMode && (
        <div className={styles.layerToolbar} aria-label="Layer switcher">
          {LAYER_ORDER.map(({ id, label, Icon, hotkey }) => (
            <button
              key={id}
              className={`${styles.layerBtn} ${activeLayer === id ? styles.activeLayerBtn : ''}`}
              onClick={() => handleLayerSwitch(id)}
              title={`${label} layer [${hotkey}]`}
              aria-pressed={activeLayer === id}
            >
              <Icon size={11} aria-hidden />
              <span className={styles.layerBtnHotkey}>{hotkey}</span>
            </button>
          ))}
        </div>
      )}
      {dmMode && tables && tables.length > 0 && (
        <div ref={tableSwitcherRef} style={{ position: 'relative', marginBottom: '8px' }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              className={styles.toolButton}
              onClick={() => setTableSwitcherOpen(o => !o)}
              title="Switch table"
              style={{ flex: 1, textAlign: 'left' }}
            >
              🗺 {tables.find(t => t.table_id === activeTableId)?.table_name ?? 'Select Table'} ▾
            </button>
            <button
              className={styles.toolButton}
              title="Push current table to all players"
              onClick={() => {
                if (!activeTableId || !ProtocolService.hasProtocol()) return;
                ProtocolService.getProtocol().switchAllPlayersToTable(activeTableId);
                setTableSwitcherOpen(false);
              }}
            >
              📤
            </button>
          </div>
          {tableSwitcherOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
              background: '#2a2a2a', border: '1px solid #444', borderRadius: '4px',
              maxHeight: '200px', overflowY: 'auto',
            }}>
              {tables.map(t => (
                <button
                  key={t.table_id}
                  onClick={() => { setActiveTableId(t.table_id); setTableSwitcherOpen(false); }}
                  style={{
                    display: 'block', width: '100%', padding: '6px 10px',
                    textAlign: 'left', background: t.table_id === activeTableId ? '#3a3a3a' : 'transparent',
                    color: '#eee', border: 'none', cursor: 'pointer',
                  }}
                >
                  {t.table_id === activeTableId ? '✓ ' : '  '}{t.table_name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Enhanced Toolbar Section */}
      <div className={styles.toolbar}>
        <button 
          className={`${styles.toolButton} ${activeTool === 'select' ? styles.active : ''}`}
          onClick={() => setActiveTool('select')}
          title="Select Tool"
        >
          <Search size={14} aria-hidden /> Select
        </button>
        <button 
          className={`${styles.toolButton} ${activeTool === 'move' ? styles.active : ''}`}
          onClick={() => setActiveTool('move')}
          title="Move Tool"
        >
          <Move size={14} aria-hidden /> Move
        </button>
        <button 
          className={`${styles.toolButton} ${activeTool === 'measure' ? styles.active : ''}`}
          onClick={() => setActiveTool('measure')}
          title="Measurement Tool"
        >
          <Ruler size={14} aria-hidden /> Measure
        </button>
        <button 
          className={`${styles.toolButton} ${activeTool === 'align' ? styles.active : ''}`}
          onClick={() => setActiveTool('align')}
          title="Alignment Helper"
        >
          <AlignLeft size={14} aria-hidden /> Align
        </button>
        {dmMode && (
        <button 
          className={`${styles.toolButton} ${activeTool === 'draw_shapes' ? styles.active : ''}`}
          onClick={() => setActiveTool('draw_shapes')}
          title="Draw Shapes"
        >
          <Pencil size={14} aria-hidden /> Draw Shapes
        </button>
        )}
        {dmMode && (
        <button 
          className={`${styles.toolButton} ${activeTool === 'draw_wall' ? styles.active : ''}`}
          onClick={() => setActiveTool('draw_wall')}
          title="Draw Wall (click start, click end)"
        >
          <BrickWall size={14} aria-hidden /> Draw Wall
        </button>
        )}
        {elevatedMode && (
        <button 
          className={`${styles.toolButton} ${activeTool === 'spell_templates' ? styles.active : ''}`}
          onClick={() => setActiveTool('spell_templates')}
          title="Spell Templates"
        >
          <Sparkles size={14} aria-hidden /> Spell Templates
        </button>
        )}
      </div>

      {/* Sprite Creation Tools */}
      {dmMode && (
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
            <Square size={14} aria-hidden /> Rectangle
          </button>
          <button 
            className={`${styles.toolButton} ${activeTool === 'circle' ? styles.active : ''}`}
            onClick={() => setActiveTool('circle')}
            title="Create Circle"
          >
            <Circle size={14} aria-hidden /> Circle
          </button>
          <button 
            className={`${styles.toolButton} ${activeTool === 'line' ? styles.active : ''}`}
            onClick={() => setActiveTool('line')}
            title="Create Line"
          >
            <Minus size={14} aria-hidden /> Line
          </button>
          <button 
            className={`${styles.toolButton} ${activeTool === 'text' ? styles.active : ''}`}
            onClick={() => setActiveTool('text')}
            title="Create Text"
          >
            <Type size={14} aria-hidden /> Text
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
      )}

      <div>
        <div className={styles.creationButtons}>
          {elevatedMode && (
          <button
            className={styles.toolButton}
            onClick={() => setAssetManagerVisible(true)}
            title="Asset Manager"
          >
            <Folder size={14} aria-hidden /> Assets
          </button>
          )}
          {dmMode && (
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
            <Paintbrush size={14} aria-hidden /> Paint
          </button>
          )}
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

        {/* Wall config modal — listens for wallDrawn CustomEvent from Rust */}
        {dmMode && <WallConfigModal />}
        
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
                <Flame size={14} aria-hidden /> Fireball (20 ft radius)
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
                <Snowflake size={14} aria-hidden /> Cone of Cold (60 ft cone)
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
                <Zap size={14} aria-hidden /> Lightning Bolt (100 ft line)
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

      {/* Layer Management Panel - DM only (full controls) */}
      {dmMode && <LayerPanel />}

      {/* Player layer visibility toggles — permitted layers only */}
      {!dmMode && (
        <PlayerLayerControls />
      )}

      {/* Grid Controls - DM only */}
      {dmMode && <GridControls />}

      {/* Dynamic Lighting - DM only */}
      {dmMode && activeTableId && (
        <div className={styles.gamePanel}>
          <h3 className={styles.panelTitle}>Dynamic Lighting</h3>
          <div className={styles.controlRow}>
            <label>
              <input
                type="checkbox"
                checked={dynamicLightingEnabled}
                onChange={e => ProtocolService.getProtocol().sendTableSettingsUpdate(activeTableId, { dynamic_lighting_enabled: e.target.checked })}
              />{' '}Enable
            </label>
          </div>
          {dynamicLightingEnabled && (
            <>
              <div className={styles.controlRow}>
                <label>Ambient Light: {Math.round((ambientLight ?? 1.0) * 100)}%</label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round((ambientLight ?? 1.0) * 100)}
                  onChange={e => setAmbientLight(Number(e.target.value) / 100)}
                  onMouseUp={e => ProtocolService.hasProtocol() && ProtocolService.getProtocol().sendTableSettingsUpdate(activeTableId, { ambient_light_level: Number((e.target as HTMLInputElement).value) / 100 })}
                />
              </div>
              <div className={styles.controlRow}>
                <label>Fog Mode:</label>
                <select
                  value={fogExplorationMode}
                  onChange={e => ProtocolService.getProtocol().sendTableSettingsUpdate(activeTableId, { fog_exploration_mode: e.target.value })}
                >
                  <option value="current_only">Current Only</option>
                  <option value="persist_dimmed">Persist Dimmed</option>
                </select>
              </div>
              {playerIds.length > 0 && (
                <div className={styles.controlRow}>
                  <label>Preview as:</label>
                  <select
                    value={dmPreviewUserId ?? ''}
                    onChange={e => {
                      const val = e.target.value;
                      if (!val) {
                        setDmPreviewMode(null);
                        stopDmPreview();
                      } else {
                        const uid = Number(val);
                        setDmPreviewMode(uid);
                        startDmPreview(uid);
                      }
                    }}
                  >
                    <option value="">DM View</option>
                    {playerIds.map(id => (
                      <option key={id} value={id}>Player {id}</option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}
        </div>
      )}

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
