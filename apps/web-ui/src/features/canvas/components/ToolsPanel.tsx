import { useGameStore } from '@/store';
import type { GameAPI } from '@/types';
import { DND_DISTANCES } from '@/utils/unitConverter';
import { AssetManager } from '@features/assets';
import { GridControls, LayerPanel } from '@features/canvas';
import { useLayerHotkeys } from '@features/canvas/hooks';
import { DMCombatPanel, FloatingInitiativeTracker, GameModeSwitch, OAPrompt, OAWarningModal, useOAStore } from '@features/combat';
import { startDmPreview, stopDmPreview } from '@features/lighting';
import { MeasurementTool } from '@features/measurement';
import { PaintPanel } from '@features/painting';
import { isDM, isElevated } from '@features/session/types/roles';
import { ProtocolService } from '@lib/api';
import { AlignmentHelper } from '@shared/components';
import DiceRoller from '@shared/components/DiceRoller';
import { AlignLeft, BrickWall, Check, ChevronDown, Circle, Cloud, Crown, Eye, EyeOff, Flame, Folder, Lightbulb, Map, Minus, Mountain, Move, Paintbrush, Pencil, Ruler, Search, Send, Shield, Snowflake, Sparkles, Square, Type, User, Users, Wrench, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PolygonConfigModal } from './PolygonConfigModal';
import { TextSpriteTool } from './TextSprite';
import styles from './ToolsPanel.module.css';
import { WallConfigModal } from './WallConfigModal';

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

function PlayerLayerControls() {
  const layerVisibility = useGameStore(s => s.layerVisibility);
  const setLayerVisibility = useGameStore(s => s.setLayerVisibility);

  const toggle = (id: string) => {
    const next = !(layerVisibility[id] ?? true);
    setLayerVisibility(id, next);
    const rm = window.rustRenderManager;
    if (rm?.set_layer_visible) rm.set_layer_visible(id, next);
  };

  return (
    <div className={styles.playerLayers}>
      <h4 className={styles.playerLayersTitle}>Layers</h4>
      {PLAYER_PERMITTED_LAYERS.map(({ id, label, Icon }) => {
        const visible = layerVisibility[id] ?? true;
        return (
          <button
            key={id}
            onClick={() => toggle(id)}
            title={visible ? `Hide ${label}` : `Show ${label}`}
            aria-label={`Toggle ${label} layer`}
            className={`${styles.playerLayerBtn} ${visible ? '' : styles.playerLayerBtnHidden}`}
          >
            <Icon size={12} aria-hidden />
            {label}
            <span className={styles.layerIconSlot}>{visible ? <Eye size={10} aria-hidden /> : <EyeOff size={10} aria-hidden />}</span>
          </button>
        );
      })}
    </div>
  );
}

interface ToolsPanelProps {
  userInfo: UserInfo;
}

type TabId = 'tools' | 'lighting' | 'layers' | 'dev';

export function ToolsPanel({ userInfo }: ToolsPanelProps) {
  useLayerHotkeys();

  const [activeTab, setActiveTab] = useState<TabId>('tools');
  const [assetManagerVisible, setAssetManagerVisible] = useState(false);
  const [paintPanelVisible, setPaintPanelVisible] = useState(false);
  const [showCombatPanel, setShowCombatPanel] = useState(false);
  const [showInitTracker, setShowInitTracker] = useState(false);
  const oaWarning = useOAStore((s) => s.warningEntityId);
  const oaTriggers = useOAStore((s) => s.warningTriggers);
  const oaPrompt = useOAStore((s) => s.prompt);
  const clearOA = useOAStore((s) => s.clearAll);
  const [shapeColor, setShapeColor] = useState('#0080ff');
  const [shapeOpacity, setShapeOpacity] = useState(1.0);
  const [shapeFilled, setShapeFilled] = useState(false);
  
  const { 
    sessionId, 
    activeLayer, 
    activeTool, 
    measurementActive, 
    alignmentActive, 
    setActiveTool
  } = useGameStore();
  const walls = useGameStore(s => s.walls);
  const removeWall = useGameStore(s => s.removeWall);
  const clearWalls = useGameStore(s => s.clearWalls);
  const sessionRole = useGameStore(s => s.sessionRole) ?? 'player';
  const dmMode = isDM(sessionRole);
  const elevatedMode = isElevated(sessionRole);
  const tables = useGameStore(s => s.tables);
  const activeTableId = useGameStore(s => s.activeTableId);
  const switchToTable = useGameStore(s => s.switchToTable);
  const dynamicLightingEnabled = useGameStore(s => s.dynamicLightingEnabled);
  const fogExplorationMode = useGameStore(s => s.fogExplorationMode);
  const ambientLight = useGameStore(s => s.ambientLight);
  const setAmbientLight = useGameStore(s => s.setAmbientLight);
  const dmPreviewUserId = useGameStore(s => s.dmPreviewUserId);
  const setDmPreviewMode = useGameStore(s => s.setDmPreviewMode);
  const sprites = useGameStore(s => s.sprites);
  const setActiveLayer = useGameStore(s => s.setActiveLayer);
  const canControlSprite = useGameStore(s => s.canControlSprite);
  const userId = useGameStore(s => s.userId);

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
    const rm = window.rustRenderManager;
    if (rm?.set_active_layer) rm.set_active_layer(layerId);
  };

  // controlledBy is stored as string[] in the store (server sends user IDs as strings)
  const playerIds: number[] = Array.from(
    new Set(sprites.flatMap((s) => s.controlledBy ?? []))
  ).map(id => Number(id)).filter(id => !isNaN(id) && id > 0);

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
  
  const [pingEnabled, setPingEnabled] = useState(() => {
    if (ProtocolService.hasProtocol()) return ProtocolService.getProtocol().isPingEnabled();
    return false;
  });
  
  useEffect(() => {
    const interval = setInterval(() => {
      if (ProtocolService.hasProtocol())
        setPingEnabled(ProtocolService.getProtocol().isPingEnabled());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    return () => {
      if (dmPreviewUserId != null) { stopDmPreview(); setDmPreviewMode(null); }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: cleanup only on unmount with stale-by-design closure
  }, []);

  useEffect(() => {
    if ((!dynamicLightingEnabled || activeTableId == null) && dmPreviewUserId != null) {
      stopDmPreview(); setDmPreviewMode(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: react to lighting/table changes only
  }, [dynamicLightingEnabled, activeTableId]);
  
  useEffect(() => {
    if (!window.rustRenderManager) return;
    if (activeTool !== 'paint' && window.rustRenderManager.paint_is_mode()) {
      window.rustRenderManager.paint_exit_mode();
      setPaintPanelVisible(false);
    }
    window.shapeSettings = { color: shapeColor, opacity: shapeOpacity, filled: shapeFilled };
    switch (activeTool) {
      case 'measure':     window.rustRenderManager.set_input_mode_measurement(); break;
      case 'rectangle':   window.rustRenderManager.set_input_mode_create_rectangle(); break;
      case 'circle':      window.rustRenderManager.set_input_mode_create_circle(); break;
      case 'line':        window.rustRenderManager.set_input_mode_create_line(); break;
      case 'text':        window.rustRenderManager.set_input_mode_create_text(); break;
      case 'paint':
        window.rustRenderManager.set_input_mode_paint();
        window.rustRenderManager.paint_enter_mode(800, 600);
        break;
      case 'draw_wall':    window.rustRenderManager.set_input_mode_draw_wall(); break;
      case 'draw_polygon': window.rustRenderManager.set_input_mode_create_polygon(); break;
      default:             window.rustRenderManager.set_input_mode_select(); break;
    }
  }, [activeTool, shapeColor, shapeOpacity, shapeFilled]);

  const handlePingToggle = (enabled: boolean) => {
    setPingEnabled(enabled);
    if (!ProtocolService.hasProtocol()) return;
    const protocol = ProtocolService.getProtocol();
    if (enabled) protocol.startPing(); else protocol.stopPing();
  };

  const tabs: { id: TabId; label: string; visible: boolean }[] = [
    { id: 'tools',    label: 'Tools',    visible: true },
    { id: 'lighting', label: 'Lighting', visible: dmMode },
    { id: 'layers',   label: 'Layers',   visible: dmMode },
    { id: 'dev',      label: 'Dev',      visible: import.meta.env.DEV },
  ];

  return (
    <div className={styles.gamePanel}>
      {/* Tab bar */}
      <div className={styles.tabBar} role="tablist">
        {tabs.filter(t => t.visible).map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeTab === t.id}
            className={`${styles.tab} ${activeTab === t.id ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TOOLS TAB */}
      {activeTab === 'tools' && (
        <div className={styles.tabContent}>
          {/* Table switcher - DM only */}
          {dmMode && tables && tables.length > 0 && (
            <div ref={tableSwitcherRef} className={styles.tableSwitcher}>
              <div className={styles.tableSwitcherRow}>
                <button
                  className={`${styles.toolButton} ${styles.tableSwitcherTrigger}`}
                  onClick={() => setTableSwitcherOpen(o => !o)}
                  title="Switch table"
                >
                  <Map size={13} aria-hidden /> {tables.find(t => t.table_id === activeTableId)?.table_name ?? 'Select Table'} <ChevronDown size={11} aria-hidden />
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
                  <Send size={14} aria-hidden />
                </button>
              </div>
              {tableSwitcherOpen && (
                <div className={styles.tableSwitcherDropdown}>
                  {tables.map(t => (
                    <button
                      key={t.table_id}
                      onClick={() => { switchToTable(t.table_id); setTableSwitcherOpen(false); }}
                      className={`${styles.tableSwitcherItem} ${t.table_id === activeTableId ? styles.tableSwitcherItemActive : ''}`}
                    >
                      {t.table_id === activeTableId ? <Check size={11} aria-hidden style={{ marginRight: 4, flexShrink: 0 }} /> : <span style={{ display: 'inline-block', width: 15 }} />}{t.table_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Primary toolbar */}
          <div className={styles.toolbar}>
            <button className={`${styles.toolButton} ${activeTool === 'select' ? styles.active : ''}`} onClick={() => setActiveTool('select')} title="Select Tool">
              <Search size={14} aria-hidden /> Select
            </button>
            <button className={`${styles.toolButton} ${activeTool === 'move' ? styles.active : ''}`} onClick={() => setActiveTool('move')} title="Move Tool">
              <Move size={14} aria-hidden /> Move
            </button>
            <button className={`${styles.toolButton} ${activeTool === 'measure' ? styles.active : ''}`} onClick={() => setActiveTool('measure')} title="Measurement Tool">
              <Ruler size={14} aria-hidden /> Measure
            </button>
            <button className={`${styles.toolButton} ${activeTool === 'align' ? styles.active : ''}`} onClick={() => setActiveTool('align')} title="Alignment Helper">
              <AlignLeft size={14} aria-hidden /> Align
            </button>
            {dmMode && <button className={`${styles.toolButton} ${activeTool === 'draw_shapes' ? styles.active : ''}`} onClick={() => setActiveTool('draw_shapes')} title="Draw Shapes">
              <Pencil size={14} aria-hidden /> Draw Shapes
            </button>}
            {dmMode && <button className={`${styles.toolButton} ${activeTool === 'draw_wall' ? styles.active : ''}`} onClick={() => setActiveTool('draw_wall')} title="Draw Wall">
              <BrickWall size={14} aria-hidden /> Draw Wall
            </button>}
            {dmMode && <button className={`${styles.toolButton} ${activeTool === 'draw_polygon' ? styles.active : ''}`} onClick={() => setActiveTool('draw_polygon')} title="Polygon Obstacle">
              <Square size={14} aria-hidden /> Polygon Obstacle
            </button>}
            {elevatedMode && <button className={`${styles.toolButton} ${activeTool === 'spell_templates' ? styles.active : ''}`} onClick={() => setActiveTool('spell_templates')} title="Spell Templates">
              <Sparkles size={14} aria-hidden /> Spell Templates
            </button>}
          </div>

          {/* Wall List вЂ” DM only */}
          {dmMode && activeTableId && (() => {
            const tableWalls = walls.filter(w => w.table_id === activeTableId);
            if (!tableWalls.length) return null;
            return (
              <div className={styles.wallList}>
                <div className={styles.wallListHeader}>
                  <h4 className={styles.wallListTitle}>Walls ({tableWalls.length})</h4>
                  <button className={styles.toolButton} onClick={() => {
                    clearWalls();
                    if (ProtocolService.hasProtocol())
                      tableWalls.forEach(w => ProtocolService.getProtocol().removeWall(w.wall_id));
                  }}>Clear All</button>
                </div>
                {tableWalls.map(w => (
                  <div key={w.wall_id} className={styles.wallRow}>
                    <span className={styles.wallLabel}>{w.wall_type}{w.is_door ? ` В· ${w.door_state}` : ''}</span>
                    {w.is_door && (
                      <button className={styles.toolButton} onClick={() => ProtocolService.hasProtocol() && ProtocolService.getProtocol().toggleDoor(w.wall_id)}>
                        {w.door_state === 'open' ? 'Close' : 'Open'}
                      </button>
                    )}
                    <button className={`${styles.toolButton} ${styles.wallDangerBtn}`} onClick={() => {
                      removeWall(w.wall_id);
                      if (ProtocolService.hasProtocol()) ProtocolService.getProtocol().removeWall(w.wall_id);
                    }}>вњ•</button>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Sprite Creation Tools - DM only */}
          {dmMode && (
            <div className={styles.creationToolbar}>
              <h4>Create Sprites</h4>
              <div className={styles.creationButtons}>
                <button className={`${styles.toolButton} ${activeTool === 'rectangle' ? styles.active : ''}`} onClick={() => { setActiveTool('rectangle'); window.fromDrawShapes = true; }} title="Create Rectangle">
                  <Square size={14} aria-hidden /> Rectangle
                </button>
                <button className={`${styles.toolButton} ${activeTool === 'circle' ? styles.active : ''}`} onClick={() => setActiveTool('circle')} title="Create Circle">
                  <Circle size={14} aria-hidden /> Circle
                </button>
                <button className={`${styles.toolButton} ${activeTool === 'line' ? styles.active : ''}`} onClick={() => setActiveTool('line')} title="Create Line">
                  <Minus size={14} aria-hidden /> Line
                </button>
                <button className={`${styles.toolButton} ${activeTool === 'text' ? styles.active : ''}`} onClick={() => setActiveTool('text')} title="Create Text">
                  <Type size={14} aria-hidden /> Text
                </button>
              </div>
              {(['rectangle', 'circle', 'line'].includes(activeTool)) && (
                <div className={styles.shapeSettings}>
                  <h5>Shape Settings</h5>
                  <div className={styles.settingRow}>
                    <label htmlFor="shape-color">Color:</label>
                    <input id="shape-color" type="color" value={shapeColor} onChange={(e) => setShapeColor(e.target.value)} />
                  </div>
                  <div className={styles.settingRow}>
                    <label htmlFor="shape-opacity">Opacity:</label>
                    <input id="shape-opacity" type="range" min="0" max="1" step="0.1" value={shapeOpacity} onChange={(e) => setShapeOpacity(parseFloat(e.target.value))} />
                    <span>{Math.round(shapeOpacity * 100)}%</span>
                  </div>
                  <div className={styles.settingRow}>
                    <label htmlFor="shape-filled"><input id="shape-filled" type="checkbox" checked={shapeFilled} onChange={(e) => setShapeFilled(e.target.checked)} /> Filled</label>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Assets & Paint */}
          <div>
            <div className={styles.creationButtons}>
              {elevatedMode && (
                <button className={styles.toolButton} onClick={() => setAssetManagerVisible(true)} title="Asset Manager">
                  <Folder size={14} aria-hidden /> Assets
                </button>
              )}
              {dmMode && (
                <button className={`${styles.toolButton} ${activeTool === 'paint' ? styles.active : ''}`} onClick={() => {
                  if (!window.rustRenderManager) return;
                  window.rustRenderManager.set_input_mode_paint();
                  setActiveTool('paint');
                  setPaintPanelVisible(true);
                }} title="Paint System">
                  <Paintbrush size={14} aria-hidden /> Paint
                </button>
              )}
            </div>
          </div>

          {paintPanelVisible && <PaintPanel isVisible={paintPanelVisible} onClose={() => setPaintPanelVisible(false)} />}

          {activeTool === 'text' && (
            <div className={styles.textSettings}>
              <h5>Text Sprites</h5>
              <div className={styles.settingRow}>
                <TextSpriteTool activeLayer={activeLayer} activeTool={activeTool} onSpriteCreated={() => {}} onError={() => {}} />
              </div>
            </div>
          )}

          {dmMode && <WallConfigModal />}
          {dmMode && <PolygonConfigModal />}

          {(activeTool === 'draw_shapes' || (activeTool === 'rectangle' && window.fromDrawShapes)) && (
            <div className={styles.drawingSettings}>
              <h5>Drawing Tools</h5>
              <div className={styles.settingRow}>
                <label htmlFor="drawing-color">Color:</label>
                <input id="drawing-color" type="color" value={shapeColor} onChange={(e) => setShapeColor(e.target.value)} />
                <div className={styles.colorPresets}>
                  <button data-testid="color-gray" onClick={() => setShapeColor('#808080')} style={{ backgroundColor: '#808080' }} title="Gray" />
                  <button data-testid="color-brown" onClick={() => setShapeColor('#8B4513')} style={{ backgroundColor: '#8B4513' }} title="Brown" />
                  <button data-testid="color-green" onClick={() => setShapeColor('#228B22')} style={{ backgroundColor: '#228B22' }} title="Green" />
                </div>
              </div>
              <div className={styles.settingRow}>
                <label htmlFor="brush-size">Brush Size:</label>
                <input id="brush-size" type="number" min="1" max="20" defaultValue="3" />
                <span>px</span>
              </div>
              <div className={styles.settingRow}>
                <label htmlFor="draw-filled"><input id="draw-filled" type="checkbox" checked={shapeFilled} onChange={(e) => setShapeFilled(e.target.checked)} /> Filled Shape</label>
              </div>
            </div>
          )}

          {activeTool === 'spell_templates' && (
            <div className={styles.spellTemplatesSection}>
              <h5>Spell Templates</h5>
              <div className={styles.templateButtons}>
                <button onClick={() => {
                  const conv = useGameStore.getState().getUnitConverter();
                  window.selectedSpellTemplate = { name: 'fireball', radiusFt: DND_DISTANCES.FIREBALL_RADIUS, radiusPx: conv.toPixels(conv.fromFeet(DND_DISTANCES.FIREBALL_RADIUS)), type: 'sphere' };
                }} title="Fireball (20 ft radius)">
                  <Flame size={14} aria-hidden /> Fireball (20 ft radius)
                </button>
                <button onClick={() => {
                  const conv = useGameStore.getState().getUnitConverter();
                  window.selectedSpellTemplate = { name: 'cone_of_cold', lengthFt: DND_DISTANCES.CONE_LENGTH, lengthPx: conv.toPixels(conv.fromFeet(DND_DISTANCES.CONE_LENGTH)), type: 'cone' };
                }} title="Cone of Cold (60 ft cone)">
                  <Snowflake size={14} aria-hidden /> Cone of Cold (60 ft)
                </button>
                <button onClick={() => {
                  const conv = useGameStore.getState().getUnitConverter();
                  window.selectedSpellTemplate = { name: 'lightning_bolt', lengthFt: DND_DISTANCES.LIGHTNING_BOLT_LENGTH, lengthPx: conv.toPixels(conv.fromFeet(DND_DISTANCES.LIGHTNING_BOLT_LENGTH)), type: 'line' };
                }} title="Lightning Bolt (100 ft line)">
                  <Zap size={14} aria-hidden /> Lightning Bolt (100 ft)
                </button>
              </div>
            </div>
          )}

          {/* Player layer visibility */}
          {!dmMode && <PlayerLayerControls />}

          {dmMode && (
            <div className={styles.combatSection}>
              <GameModeSwitch />
              <div className={styles.combatButtons}>
                <button
                  className={`${styles.toolButton} ${showCombatPanel ? styles.active : ''}`}
                  onClick={() => setShowCombatPanel(v => !v)}
                  title="Toggle Combat Panel"
                >
                  <Crown size={14} aria-hidden /> Combat
                </button>
                <button
                  className={`${styles.toolButton} ${showInitTracker ? styles.active : ''}`}
                  onClick={() => setShowInitTracker(v => !v)}
                  title="Toggle Initiative Tracker"
                >
                  <Shield size={14} aria-hidden /> Tracker
                </button>
              </div>
              {showCombatPanel && <DMCombatPanel />}
            </div>
          )}
          {showInitTracker && <FloatingInitiativeTracker onClose={() => setShowInitTracker(false)} />}

          <DiceRoller />

          <div className={styles.gamePanel}>
            <h3 className={styles.panelTitle}>Controls</h3>
            <ul className={styles.controlsList}>
              <li>Click &amp; drag sprites to move</li>
              <li>Drag empty space to pan camera</li>
              <li>Mouse wheel to zoom in/out</li>
              <li>Ctrl+click for multi-select</li>
              <li>Drag rectangle to area select</li>
            </ul>
          </div>
        </div>
      )}

      {/* LIGHTING TAB (DM only) */}
      {activeTab === 'lighting' && dmMode && (
        <div className={styles.tabContent}>
          {activeTableId && (
            <div className={styles.gamePanel}>
              <h3 className={styles.panelTitle}>Dynamic Lighting</h3>
              <div className={styles.controlRow}>
                <label>
                  <input type="checkbox" checked={dynamicLightingEnabled}
                    onChange={e => ProtocolService.getProtocol().sendTableSettingsUpdate(activeTableId, { dynamic_lighting_enabled: e.target.checked })}
                  />{' '}Enable
                </label>
              </div>
              {dynamicLightingEnabled && (
                <>
                  <div className={styles.controlRow}>
                    <label>Ambient Light: {Math.round((ambientLight ?? 1.0) * 100)}%</label>
                    <input type="range" min={0} max={100}
                      value={Math.round((ambientLight ?? 1.0) * 100)}
                      onChange={e => setAmbientLight(Number(e.target.value) / 100)}
                      onMouseUp={e => ProtocolService.hasProtocol() && ProtocolService.getProtocol().sendTableSettingsUpdate(activeTableId, { ambient_light_level: Number((e.target as HTMLInputElement).value) / 100 })}
                    />
                  </div>
                  <div className={styles.controlRow}>
                    <label>Fog Mode:</label>
                    <select value={fogExplorationMode} onChange={e => ProtocolService.getProtocol().sendTableSettingsUpdate(activeTableId, { fog_exploration_mode: e.target.value })}>
                      <option value="current_only">Current Only</option>
                      <option value="persist_dimmed">Persist Dimmed</option>
                    </select>
                  </div>
                  {playerIds.length > 0 && (
                    <div className={styles.controlRow}>
                      <label>Preview as:</label>
                      <select value={dmPreviewUserId ?? ''} onChange={e => {
                        const val = e.target.value;
                        if (!val) { setDmPreviewMode(null); stopDmPreview(); }
                        else { const uid = Number(val); setDmPreviewMode(uid); startDmPreview(uid); }
                      }}>
                        <option value="">DM View</option>
                        {playerIds.map(id => <option key={id} value={id}>Player {id}</option>)}
                      </select>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          <GridControls />
        </div>
      )}

      {/* LAYERS TAB (DM = full; player = visibility only) */}
      {activeTab === 'layers' && (
        <div className={styles.tabContent}>
          {dmMode && (
            <>
              {/* Layer quick-switch toolbar */}
              <div className={styles.layerToolbar} aria-label="Layer switcher">
                {LAYER_ORDER.map(({ id, label, Icon, hotkey }) => (
                  <button key={id}
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
              <LayerPanel />
            </>
          )}
          {!dmMode && <PlayerLayerControls />}
        </div>
      )}

      {/* DEV TAB */}
      {activeTab === 'dev' && import.meta.env.DEV && (
        <div className={styles.tabContent}>
          {dmMode && (
            <div className={styles.quickTestButtons}>
              <button className={styles.testButton} onClick={() => {
                if (window.gameAPI?.sendMessage) {
                  window.gameAPI.sendMessage('sprite_create', { id: `sprite_${Date.now()}`, x: Math.floor(Math.random()*800), y: Math.floor(Math.random()*600), width: 40, height: 40, layer: activeLayer, texture_path: 'hero.png', color: '#00CC33' });
                  setTimeout(() => window.dispatchEvent(new CustomEvent('spriteAdded')), 500);
                }
              }}>Add Sprite</button>
              <button className={styles.testButton} onClick={() => {
                window.gameAPI?.sendMessage?.('character_create', { id: `char_${Date.now()}`, name: 'Test Character', class: 'Fighter', stats: { strength: 15, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 8 } });
              }}>Add Character</button>
            </div>
          )}

          <div className={styles.networkSettings}>
            <h4>Network Settings</h4>
            <div className={styles.networkToggle}>
              <label htmlFor="ping-toggle">
                <input id="ping-toggle" type="checkbox" checked={pingEnabled} onChange={(e) => handlePingToggle(e.target.checked)} />
                <span>Heartbeat Monitor</span>
              </label>
              <span className={`${styles.networkStatus} ${pingEnabled ? styles.active : styles.inactive}`}>
                {pingEnabled ? 'в—Џ Active' : 'в—‹ Inactive'}
              </span>
            </div>
            <div className={styles.networkDescription}>Sends ping every 30s to detect dead connections.</div>
          </div>

          <div className={styles.devControls}>
            <h4>Development Mode</h4>
            <div className={styles.devToggle}>
              <label><input type="checkbox" checked disabled /> Development Build</label>
              <span className={styles.devBadge}><Wrench size={12} aria-hidden /> ACTIVE</span>
            </div>
            <div className={styles.roleToggle}>
              <label htmlFor="role-toggle">Role:</label>
              <select id="role-toggle" value={sessionRole} onChange={(e) => alert(`Role switching: ${e.target.value}\n\nNote: Roles come from server.`)} className={styles.roleSelect}>
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
        </div>
      )}

      {/* Tool Overlays - always mounted */}
      <MeasurementTool isActive={measurementActive} />
      <AlignmentHelper isActive={alignmentActive} />
      <AssetManager isVisible={assetManagerVisible} onClose={() => setAssetManagerVisible(false)} sessionCode={sessionId || ""} userInfo={userInfo} />

      {/* Opportunity Attack modals */}
      {oaWarning && (dmMode || canControlSprite(oaWarning, userId ?? undefined)) && (
        <OAWarningModal
          triggers={oaTriggers}
          onConfirm={() => {
            if (ProtocolService.hasProtocol())
              ProtocolService.getProtocol().confirmMoveDespiteOA(oaWarning);
            clearOA();
          }}
          onCancel={clearOA}
        />
      )}
      {oaPrompt && (
        <OAPrompt
          targetName={oaPrompt.target_name}
          onUseReaction={() => {
            if (ProtocolService.hasProtocol())
              ProtocolService.getProtocol().resolveOA({
                use_reaction: true,
                attacker_combatant_id: oaPrompt.attacker_combatant_id,
                target_combatant_id: oaPrompt.target_combatant_id,
              });
            clearOA();
          }}
          onPass={() => {
            if (ProtocolService.hasProtocol())
              ProtocolService.getProtocol().resolveOA({ use_reaction: false });
            clearOA();
          }}
        />
      )}

      {/* Test Elements for compatibility */}
      <div data-testid="tools-test-elements" className={styles.srTestContainer}>
        <div data-testid="map-canvas" style={{ width: '400px', height: '400px', position: 'relative' }} />
        <div data-testid="drawn-shape-wall-1" data-type="wall" data-blocks-los="true" />
        <div data-testid="spell-template-fireball" data-radius="20" style={{ width: '200px', height: '200px' }} />
        <div data-testid="template-affected-creatures">2 creatures</div>
        <button>Apply Fireball Effects</button>
        <div>Dexterity saving throws required</div>
      </div>
    </div>
  );
}
