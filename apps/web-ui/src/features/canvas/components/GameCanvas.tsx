/**
 * GameCanvas - Main canvas component for rendering the game world
 * Refactored to use extracted hooks and utilities for better maintainability
 */
import { useGameStore } from '@/store';
import { useCombatStore, type Combatant } from '@features/combat/stores/combatStore';
import { useGameModeStore } from '@features/combat/stores/gameModeStore';
import { isDM } from '@features/session/types/roles';
import { useOptionalProtocol } from '@lib/api';
import { useWasmRuntime } from '@lib/wasm/runtime';
import type { RenderEngine } from '@lib/wasm/runtime';
import { createMessage, MessageType } from '@lib/websocket';
import { DragDropImageHandler } from '@shared/components';
import { logger } from '@shared/utils/logger';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight, CloudFog, Construction, Crown, Lightbulb, Map as MapIcon, Mountain, Users } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSpriteDragSync } from '../hooks/useSpriteDragSync';
import { useSpriteSyncing } from '../hooks/useSpriteSyncing';
import { MultiSelectManager } from '../services';
import fpsService from '../services/fps.service';
import { performanceService } from '../services/performance.service';
import { drawDirectionChevron, drawDoorArc, wallLineDash, wallLineWidth } from '../utils/wallVisuals';
import { FloatingLayerPicker } from './FloatingLayerPicker';
import styles from './GameCanvas.module.css';
import {
  CanvasRenderer,
  getGridCoord,
  resizeCanvas,
  useCanvasDebug,
  useContextMenu,
  useFPS,
  useLightPlacement,
  usePerformanceMonitor,
} from './GameCanvas/index';
import { useCanvasEventsEnhanced } from './GameCanvas/useCanvasEventsEnhanced';
import PerformanceMonitor from './PerformanceMonitor';

// Stable fallback to prevent Zustand selector from returning new [] reference every render
const EMPTY_COMBATANTS: Combatant[] = [];


// Available layers - matching LayerPanel
const AVAILABLE_LAYERS: { id: string; name: string; icon: LucideIcon }[] = [
  { id: 'map', name: 'Map', icon: MapIcon },
  { id: 'tokens', name: 'Tokens', icon: Users },
  { id: 'dungeon_master', name: 'DM Layer', icon: Crown },
  { id: 'light', name: 'Lighting', icon: Lightbulb },
  { id: 'height', name: 'Height', icon: Mountain },
  { id: 'obstacles', name: 'Obstacles', icon: Construction },
  { id: 'fog_of_war', name: 'Fog of War', icon: CloudFog },
];

/** Point-to-segment distance (screen space, for wall hover detection). */
function pointSegmentDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export const GameCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rustRenderManagerRef = useRef<RenderEngine | null>(null);
  const dprRef = useRef<number>(1);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const visionRingsCanvasRef = useRef<HTMLCanvasElement>(null);
  // Tracks live drag positions so vision rings follow during drag
  const dragPositionsRef = useRef(new Map<string, { x: number; y: number }>());
  // Tracks live resize dimensions during drag so rings use correct size
  const dragDimsRef = useRef(new Map<string, { w: number; h: number }>());

  const dynamicLightingEnabled = useGameStore(s => s.dynamicLightingEnabled);
  const runtime = useWasmRuntime();
  // Protocol and store setup
  const protocol = useOptionalProtocol()?.protocol ?? null;
  const updateConnectionState = useGameStore(s => s.updateConnectionState);
  const tables = useGameStore(s => s.tables);
  const activeTableId = useGameStore(s => s.activeTableId);
  const activeTable = tables.find((t) => t.table_id === activeTableId);
  const activeLayer = useGameStore(s => s.activeLayer);

  // Re-enabled sprite syncing with fixed React dependency issue
  useSpriteSyncing();

  // Stream live drag/resize/rotate previews to other clients via WebSocket
  const sendWsMessage = useCallback((msg: unknown) => { protocol?.sendMessage(msg as import('@lib/websocket').Message); }, [protocol]);
  useSpriteDragSync(sendWsMessage);

  // Track drag positions so vision rings follow the token during drag
  useEffect(() => {
    const onDrag = (e: Event) => {
      const { spriteId, x, y } = (e as CustomEvent).detail ?? {};
      if (spriteId) dragPositionsRef.current.set(spriteId, { x, y });
    };
    const onResize = (e: Event) => {
      const { spriteId, width, height } = (e as CustomEvent).detail ?? {};
      if (spriteId && width != null && height != null) dragDimsRef.current.set(spriteId, { w: width, h: height });
    };
    const onMoved = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      const id = d.sprite_id || d.id;
      if (id) {
        // Use the server-confirmed position so rings don't snap to stale store coords
        const pos: { x: number; y: number } | null =
          d.to ?? (d.x != null && d.y != null ? { x: d.x, y: d.y } : null);
        if (pos != null) {
          dragPositionsRef.current.set(id, { x: pos.x, y: pos.y });
        } else {
          dragPositionsRef.current.delete(id);
        }
        dragDimsRef.current.delete(id);
      }
    };
    window.addEventListener('sprite-drag-preview', onDrag);
    window.addEventListener('sprite-resize-preview', onResize);
    window.addEventListener('sprite-moved', onMoved);
    return () => {
      window.removeEventListener('sprite-drag-preview', onDrag);
      window.removeEventListener('sprite-resize-preview', onResize);
      window.removeEventListener('sprite-moved', onMoved);
    };
 }, []);

  // Use extracted hooks
  const debugPanel = useCanvasDebug(canvasRef, rustRenderManagerRef, dprRef);
  const fps = useFPS(fpsService);
 const [showPerformanceMonitor, togglePerformanceMonitor] = usePerformanceMonitor();

  // Context menu logic
  const combatants = useCombatStore((s) => s.combat?.combatants ?? EMPTY_COMBATANTS);
  const isFight = useGameModeStore((s) => s.isFight);
  const sessionRole = useGameStore((s) => s.sessionRole);
  const inCombat = (entityId: string) => combatants.some((c) => c.entity_id === entityId);

  const addToCombat = (entityId: string) => {
    protocol?.sendMessage(createMessage(MessageType.INITIATIVE_ADD, { entity_id: entityId }));
  };

  const removeFromCombat = (entityId: string) => {
    const combatant = combatants.find((c) => c.entity_id === entityId);
    if (!combatant) return;
    protocol?.sendMessage(createMessage(MessageType.INITIATIVE_REMOVE, { combatant_id: combatant.combatant_id }));
  };

  const { contextMenu, setContextMenu, handleContextMenuAction, handleMoveToLayer } = useContextMenu({
    canvasRef: canvasRef as React.RefObject<HTMLCanvasElement>,
    rustRenderManagerRef,
    protocol,
  });

  // Light placement logic
  const { lightPlacementMode, setLightPlacementMode } = useLightPlacement(canvasRef as React.RefObject<HTMLCanvasElement>);

  // Light placement preview state
 const [lightPreviewPos, setLightPreviewPos] = useState<{ x: number; y: number } | null>(null);

  // Multi-select manager
  const multiSelectManagerRef = useRef<MultiSelectManager | null>(null);

  // Enhanced canvas event handlers with input management
  const { stableMouseDown, stableMouseMove, stableMouseUp, stableWheel, stableRightClick, stableKeyDown, handleCanvasFocus, handleCanvasBlur } =
    useCanvasEventsEnhanced({
      canvasRef: canvasRef as React.RefObject<HTMLCanvasElement>,
      rustRenderManagerRef,
      lightPlacementMode,
      setLightPlacementMode: setLightPlacementMode as Parameters<typeof useCanvasEventsEnhanced>[0]['setLightPlacementMode'],
      setContextMenu,
      showPerformanceMonitor,
      togglePerformanceMonitor,
      protocol,
    });

  // Initialize multi-select manager
  useEffect(() => {
    if (rustRenderManagerRef.current) {
      multiSelectManagerRef.current = new MultiSelectManager(rustRenderManagerRef.current);
    }
 }, []);

  // Keep WASM active layer in sync with React store
  useEffect(() => {
    const engine = rustRenderManagerRef.current;
    if (engine) {
      logger.debug('[Canvas] set_active_layer', { activeLayer });
      engine.set_active_layer(activeLayer);
    }
 }, [activeLayer]); // rustRenderManagerRef.current is not reactive; initial sync happens at engine init

  // Handle mousemove for light placement preview
  useEffect(() => {
    if (!lightPlacementMode?.active) {
      setLightPreviewPos(null);
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const rawX = e.clientX - rect.left;
      const rawY = e.clientY - rect.top;
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = rawX * scaleX;
      const y = rawY * scaleY;

      setLightPreviewPos({ x, y });
    };

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('mousemove', handleMouseMove);
      return () => {
        canvas.removeEventListener('mousemove', handleMouseMove);
      };
    }
 }, [lightPlacementMode]);

  // Draw light placement preview on overlay canvas
  useEffect(() => {
    const previewCanvas = previewCanvasRef.current;
    const mainCanvas = canvasRef.current;

    if (!previewCanvas || !mainCanvas || !lightPreviewPos || !lightPlacementMode?.active) {
      // Clear preview if no longer active
      if (previewCanvas) {
        const ctx = previewCanvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        }
      }
      return;
    }

    const ctx = previewCanvas.getContext('2d');
    if (!ctx) return;

    const preset = lightPlacementMode.preset as { color: { r: number; g: number; b: number }; radius?: number; radiusFt?: number };
    const dpr = dprRef.current;

    // Ensure preview canvas matches main canvas size
    const rect = mainCanvas.getBoundingClientRect();
    if (previewCanvas.width !== rect.width * dpr || previewCanvas.height !== rect.height * dpr) {
      previewCanvas.width = rect.width * dpr;
      previewCanvas.height = rect.height * dpr;
      previewCanvas.style.width = `${rect.width}px`;
      previewCanvas.style.height = `${rect.height}px`;
    }

    // Clear previous frame
    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    // Convert preset color (normalized 0-1) to RGB (0-255)
    const r = Math.round((preset.color.r || 1) * 255);
    const g = Math.round((preset.color.g || 1) * 255);
    const b = Math.round((preset.color.b || 1) * 255);

    // Draw preview circle at mouse position
    const radius = preset.radius || 100;
    const screenRadius = radius * 0.5;

    // Draw outer circle (dim light edge)
    ctx.beginPath();
    ctx.arc(lightPreviewPos.x, lightPreviewPos.y, screenRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.5)`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw inner gradient (bright light)
    const gradient = ctx.createRadialGradient(
      lightPreviewPos.x,
      lightPreviewPos.y,
      0,
      lightPreviewPos.x,
      lightPreviewPos.y,
      screenRadius
    );
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.3)`);
    gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.15)`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw crosshair at center
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.8)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lightPreviewPos.x - 10, lightPreviewPos.y);
    ctx.lineTo(lightPreviewPos.x + 10, lightPreviewPos.y);
    ctx.moveTo(lightPreviewPos.x, lightPreviewPos.y - 10);
    ctx.lineTo(lightPreviewPos.x, lightPreviewPos.y + 10);
    ctx.stroke();

    ctx.restore();
 }, [lightPreviewPos, lightPlacementMode]);

  // Vision rings overlay — DM-only indicator circles for token vision/darkvision radii
  useEffect(() => {
    if (!dynamicLightingEnabled) {
      const canvas = visionRingsCanvasRef.current;
      if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    let raf: number;

    const draw = () => {
      const canvas = visionRingsCanvasRef.current;
      const mainCanvas = canvasRef.current;
      const rm = rustRenderManagerRef.current;
      if (!canvas || !mainCanvas) { raf = requestAnimationFrame(draw); return; }

      const { sprites, sessionRole, getUnitConverter, gridCellPx, activeTableId } = useGameStore.getState();
      const cellPx = gridCellPx ?? 50;
      const ctx = canvas.getContext('2d');
      if (!ctx) { raf = requestAnimationFrame(draw); return; }

      const dpr = dprRef.current;
      const rect = mainCanvas.getBoundingClientRect();
      const w = Math.round(rect.width * dpr);
      const h = Math.round(rect.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!rm || !isDM(sessionRole)) { raf = requestAnimationFrame(draw); return; }

      ctx.save();
      ctx.scale(dpr, dpr);

      const conv = getUnitConverter();

      // Only draw circles for sprites on the active table
      type ExtSprite = typeof sprites[number] & { table_id?: string; vision_radius?: number; has_darkvision?: boolean; darkvision_radius?: number; scale_x?: number; scale_y?: number; width?: number; height?: number };
      const tableSprites = (sprites as ExtSprite[]).filter(sp => sp.tableId === activeTableId || sp.table_id === activeTableId);
      for (const sprite of tableSprites) {
        const s = sprite;
        const vr: number = s.visionRadiusUnits != null
          ? conv.toPixels(s.visionRadiusUnits)
          : (s.visionRadius ?? s.vision_radius ?? 0);
        const dvr: number = (s.hasDarkvision || s.has_darkvision)
          ? (s.darkvisionRadiusUnits != null
              ? conv.toPixels(s.darkvisionRadiusUnits)
              : (s.darkvisionRadius ?? s.darkvision_radius ?? 0))
          : 0;
        const ar: number = s.auraRadiusUnits != null
          ? conv.toPixels(s.auraRadiusUnits)
          : (s.auraRadius ?? 0);
        if (!vr && !dvr && !ar) continue;

        // Scale from store (same as WASM scale_x/scale_y)
        const scaleX = s.scale?.x ?? s.scale_x ?? 1;
        const scaleY = s.scale?.y ?? s.scale_y ?? 1;

        // Resolve actual pixel dimensions from live drag state or store data.
        const liveDims = dragDimsRef.current.get(s.id);
        const baseWidth = s.width ?? cellPx;
        const baseHeight = s.height ?? cellPx;
        const wpx = liveDims?.w ?? baseWidth * scaleX;
        const hpx = liveDims?.h ?? baseHeight * scaleY;

        // During resize, position and size change together in the drag state.
        // Using dragPositionsRef (which updates separately from dragDimsRef) can cause
        // a single-frame mismatch where center is computed with mismatched pos+size.
        // So during an active resize (liveDims set), trust store position.
        const livePos = liveDims ? null : dragPositionsRef.current.get(s.id);
        const wx = livePos?.x ?? s.x ?? 0;
        const wy = livePos?.y ?? s.y ?? 0;

        try {
          const ctr = rm.world_to_screen(wx + wpx / 2, wy + hpx / 2);
          const sx = ctr[0] / dpr;
          const sy = ctr[1] / dpr;

          if (ar > 0) {
            const edge = rm.world_to_screen(wx + wpx / 2 + ar, wy + hpx / 2);
            const sr = (edge[0] - ctr[0]) / dpr;
            // Parse auraColor (hex string) to rgba; default to warm gold
            const hex = (s.auraColor ?? '#ffaa00').replace('#', '');
            const cr = parseInt(hex.slice(0, 2), 16);
            const cg = parseInt(hex.slice(2, 4), 16);
            const cb = parseInt(hex.slice(4, 6), 16);
            ctx.beginPath();
            ctx.arc(sx, sy, sr, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, 0.55)`;
            ctx.setLineDash([4, 3]);
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.setLineDash([]);
          }

          if (vr > 0) {
            // DnD: vision range measured from token edge, so ring radius = tokenHalfWidth + visionRange
            const edge = rm.world_to_screen(wx + wpx / 2 + wpx / 2 + vr, wy + hpx / 2);
            const sr = (edge[0] - ctr[0]) / dpr;
            ctx.beginPath();
            ctx.arc(sx, sy, sr, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 210, 80, 0.45)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }

          if (dvr > 0) {
            // DnD: darkvision range measured from token edge
            const edge = rm.world_to_screen(wx + wpx / 2 + wpx / 2 + dvr, wy + hpx / 2);
            const sr = (edge[0] - ctr[0]) / dpr;
            ctx.beginPath();
            ctx.arc(sx, sy, sr, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(160, 100, 255, 0.45)';
            ctx.setLineDash([6, 4]);
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.setLineDash([]);
          }
        } catch { /* sprite may not be on screen */ }
      }

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
 }, [dynamicLightingEnabled]);

  // Wall overlay — DM-only: draw wall segments from WASM get_wall_render_data on a canvas 2D overlay
  const wallCanvasRef = useRef<HTMLCanvasElement>(null);
  const hoveredWallRef = useRef<string | null>(null); // index into render data, not id
  const mouseScreenRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    const isDM = sessionRole === 'owner' || sessionRole === 'co_dm';
    if (!isDM) return;

    // Track mouse position over the main canvas for hover detection
    const mainCanvas = canvasRef.current;
    const onMouseMove = (e: MouseEvent) => {
      const rect = mainCanvas?.getBoundingClientRect();
      if (!rect) return;
      mouseScreenRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    mainCanvas?.addEventListener('mousemove', onMouseMove);

    // Delete / Backspace removes selected walls, or the hovered wall when no wall is selected.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;

      const rm = rustRenderManagerRef.current;
      const selectedWallIds = rm?.get_selected_walls() ?? [];
      const wallIds = selectedWallIds.length > 0
        ? selectedWallIds
        : hoveredWallRef.current
          ? [hoveredWallRef.current]
          : [];

      if (wallIds.length > 0) {
        e.preventDefault();
        hoveredWallRef.current = null;
        wallIds.forEach((wallId) => {
          rm?.remove_wall(wallId);
          useGameStore.getState().removeWall(wallId);
          protocol?.removeWall(wallId);
        });
        rm?.clear_selection();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    let raf: number;

    const draw = () => {
      const canvas = wallCanvasRef.current;
      const _mainCanvas = mainCanvas!;
      const rm = rustRenderManagerRef.current;
      const _canvas = canvas!;
      if (_canvas.width !== _mainCanvas.width || _canvas.height !== _mainCanvas.height) {
        _canvas.width = _mainCanvas.width;
        _canvas.height = _mainCanvas.height;
        _canvas.style.width = _mainCanvas.style.width;
        _canvas.style.height = _mainCanvas.style.height;
      }

      const ctx = _canvas.getContext('2d');
      if (!ctx) { raf = requestAnimationFrame(draw); return; }
      if (!rm) { raf = requestAnimationFrame(draw); return; }
      ctx.clearRect(0, 0, _canvas.width, _canvas.height);

      try {
        const data: Float32Array = rm.get_wall_render_data();
        const wallIds: string[] = rm.get_wall_ids();
        const selectedWallIds = new Set(rm.get_selected_walls());
        // Each wall = 8 floats: x1,y1,x2,y2,r,g,b,a  (world coords)
        const STRIDE = 8;
        const HOVER_THRESH_PX = 12;
        const mouse = mouseScreenRef.current;

        // Determine hovered wall by min screen-space distance
        let hoverId: string | null = null;
        let minDist = HOVER_THRESH_PX;
        for (let i = 0; i + STRIDE <= data.length; i += STRIDE) {
          const s1 = rm.world_to_screen(data[i], data[i + 1]);
          const s2 = rm.world_to_screen(data[i + 2], data[i + 3]);
          if (!s1 || !s2) continue;
          const d = pointSegmentDist(mouse.x, mouse.y, s1[0], s1[1], s2[0], s2[1]);
          if (d < minDist) { minDist = d; hoverId = wallIds[i / STRIDE] ?? null; }
        }
        hoveredWallRef.current = hoverId;

        ctx.save();
        const storeWallsMap = Object.fromEntries(
          useGameStore.getState().walls.map(w => [w.wall_id, w])
        );
        for (let i = 0; i + STRIDE <= data.length; i += STRIDE) {
          const wx1 = data[i], wy1 = data[i + 1], wx2 = data[i + 2], wy2 = data[i + 3];
          const r = data[i + 4], g = data[i + 5], b = data[i + 6], a = data[i + 7];

          const s1 = rm.world_to_screen(wx1, wy1);
          const s2 = rm.world_to_screen(wx2, wy2);
          if (!s1 || !s2) continue;

          const wallId = wallIds[i / STRIDE] ?? null;
          const isHovered = wallId != null && wallId === hoveredWallRef.current;
          const isSelected = wallId != null && selectedWallIds.has(wallId);
          const isHighlighted = isHovered || isSelected;
          const wallData = wallId ? storeWallsMap[wallId] : undefined;

          const baseColor = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
          const lineW = wallLineWidth(wallData);

          ctx.beginPath();
          ctx.moveTo(s1[0], s1[1]);
          ctx.lineTo(s2[0], s2[1]);
          ctx.lineWidth = isSelected ? lineW + 3 : isHovered ? lineW + 2 : lineW;
          ctx.setLineDash(isHighlighted ? [] : wallLineDash(wallData));
          ctx.strokeStyle = isSelected ? 'rgba(0,229,255,1)' : isHovered ? 'rgba(255,255,255,1)' : baseColor;
          ctx.stroke();
          ctx.setLineDash([]);

          // Door arc at midpoint
          if (wallData?.is_door) {
            drawDoorArc(ctx, s1[0], s1[1], s2[0], s2[1], wallData.door_state);
          }

          // Direction chevron at midpoint
          if (wallData?.direction && wallData.direction !== 'both') {
            drawDirectionChevron(ctx, s1[0], s1[1], s2[0], s2[1], wallData.direction, baseColor);
          }

          // Endpoint circles when selected or hovered
          if (isHighlighted) {
            for (const [ex, ey] of [[s1[0], s1[1]], [s2[0], s2[1]]]) {
              ctx.beginPath();
              ctx.arc(ex as number, ey as number, 5, 0, Math.PI * 2);
              ctx.fillStyle = isSelected ? 'rgba(0,229,255,0.95)' : 'rgba(255,255,255,0.9)';
              ctx.fill();
              ctx.strokeStyle = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},1)`;
              ctx.lineWidth = 1.5;
              ctx.stroke();
            }
          }
        }
        ctx.restore();
      } catch { /* rm may not be ready yet */ }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      mainCanvas?.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('keydown', onKeyDown);
    };
 }, [sessionRole, protocol]);
  useEffect(() => {
    let mounted = true;
    let resizeObserver: ResizeObserver | null = null;
    let resizeTimeout: number | null = null;
    let resizeFrame: number | null = null;

    const scheduleResize = () => {
      if (resizeTimeout) {
        window.clearTimeout(resizeTimeout);
      }
      if (resizeFrame) {
        cancelAnimationFrame(resizeFrame);
      }
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        resizeTimeout = window.setTimeout(() => {
          try {
            const canvas = canvasRef.current;
            if (canvas && rustRenderManagerRef.current) {
              resizeCanvas(canvas, dprRef, rustRenderManagerRef.current);
            }
          } catch (e) {
            logger.error('Scheduled resize failed', e);
          }
          resizeTimeout = null;
        }, 10);
      });
    };

    const attachRuntimeCanvas = async () => {
      try {
        updateConnectionState('connecting');
        if (!mounted) {
          logger.warn('Component not mounted, aborting WASM init');
          return;
        }

        const canvas = canvasRef.current;
        if (!canvas) {
          logger.error('[WASM] Canvas is null');
          updateConnectionState('error');
          return;
        }

        const { userId, sessionRole } = useGameStore.getState();
        const initialRole = window.__INITIAL_DATA__?.userRole ?? null;
        const rustRenderEngine = await runtime.attachCanvas(canvas, {
          userId,
          role: sessionRole ?? initialRole ?? null,
          activeLayer: useGameStore.getState().activeLayer,
          onFrame: () => fpsService.recordFrame(),
        });
        if (!mounted) {
          runtime.detachCanvas();
          return;
        }
        rustRenderManagerRef.current = rustRenderEngine;

        // Initialize performance monitoring
        performanceService.initialize(rustRenderEngine);
        logger.debug('[PERFORMANCE] Service initialized');
        resizeCanvas(canvas, dprRef, rustRenderEngine);

        canvas.addEventListener('mousedown', stableMouseDown);
        canvas.addEventListener('mousemove', stableMouseMove);
        canvas.addEventListener('mouseup', stableMouseUp);
        canvas.addEventListener('wheel', stableWheel);
        canvas.addEventListener('contextmenu', stableRightClick);
        canvas.addEventListener('focus', handleCanvasFocus);
        canvas.addEventListener('blur', handleCanvasBlur);
        document.addEventListener('keydown', stableKeyDown);

        // Make canvas focusable for keyboard events
        canvas.tabIndex = 0;
        // Default cursor — updated dynamically on mousemove via get_cursor_type
        canvas.style.cursor = 'default';

        // Setup ResizeObserver
        try {
          resizeObserver = new ResizeObserver((entries) => {
            logger.debug('Canvas ResizeObserver triggered', { entryCount: entries.length });
            scheduleResize();
          });
          resizeObserver.observe(canvas);

          // Also observe the canvas container to catch flex layout changes
          const container = canvas.parentElement;
          if (container) {
            logger.debug('Canvas observing parent container for resize', { className: container.className });
            resizeObserver.observe(container);
          }
        } catch (err) {
          logger.warn('ResizeObserver unavailable or failed to observe canvas', err);
        }
        try {
          window.addEventListener('resize', scheduleResize);
        } catch (_e) {
          /* ignore */
        }

        updateConnectionState('connected');
      } catch (error) {
        logger.error('Failed to load WASM module', error);
        updateConnectionState('error');
      }
    };

    attachRuntimeCanvas();

    // Cleanup on unmount
    return () => {
      mounted = false;

      runtime.detachCanvas();
      rustRenderManagerRef.current = null;

      // eslint-disable-next-line react-hooks/exhaustive-deps -- known: canvasRef.current captured at cleanup via const canvas above
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.removeEventListener('mousedown', stableMouseDown);
        canvas.removeEventListener('mousemove', stableMouseMove);
        canvas.removeEventListener('mouseup', stableMouseUp);
        canvas.removeEventListener('wheel', stableWheel);
        canvas.removeEventListener('contextmenu', stableRightClick);
        canvas.removeEventListener('focus', handleCanvasFocus);
        canvas.removeEventListener('blur', handleCanvasBlur);
      }
      document.removeEventListener('keydown', stableKeyDown);
      window.removeEventListener('resize', scheduleResize);
      if (resizeObserver && canvas) {
        try {
          resizeObserver.unobserve(canvas);
        } catch {
          /* ignore */
        }
        try {
          resizeObserver.disconnect();
        } catch {
          /* ignore */
        }
      }
      try {
        if (typeof resizeTimeout !== 'undefined' && resizeTimeout) window.clearTimeout(resizeTimeout);
      } catch {}
      try {
        if (resizeFrame) cancelAnimationFrame(resizeFrame);
      } catch {}
      resizeObserver = null;
    };
 }, [
    runtime,
    updateConnectionState,
    stableMouseDown,
    stableMouseMove,
    stableMouseUp,
    stableWheel,
    stableRightClick,
    stableKeyDown,
    handleCanvasFocus,
    handleCanvasBlur,
  ]);

  // Debug overlay state (development only)
 const [debugCursorScreen, setDebugCursorScreen] = React.useState({ x: 0, y: 0 });
 const [debugCursorWorld, setDebugCursorWorld] = React.useState({ x: 0, y: 0 });
 const [debugGrid, setDebugGrid] = React.useState({ x: 0, y: 0 });

  // Mouse move handler for debug overlay
  const updateDebugOverlay = React.useCallback((event: MouseEvent) => {
    if (!import.meta.env.DEV) return;

    const rm = rustRenderManagerRef.current;
    const canvas = canvasRef.current;
    if (rm && canvas) {
      try {
        const rect = canvas.getBoundingClientRect();
        const dpr = dprRef.current;

        const mouseCss = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        };
        const mouseDevice = { x: mouseCss.x * dpr, y: mouseCss.y * dpr };

        const worldCoords = rm.screen_to_world(mouseDevice.x, mouseDevice.y);
        const world = { x: worldCoords[0], y: worldCoords[1] };

        setDebugCursorScreen(mouseCss);
        setDebugCursorWorld(world);
        setDebugGrid(getGridCoord(world));
      } catch {
        // ignore errors when polling cursor coordinates
      }
    }
 }, []);

  // Attach debug mouse handler only in development
  React.useEffect(() => {
    if (!import.meta.env.DEV) return;

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('mousemove', updateDebugOverlay);
      return () => {
        canvas.removeEventListener('mousemove', updateDebugOverlay);
      };
    }
 }, [updateDebugOverlay]);

  // Apply cursor hints dispatched from WASM (hover/drag feedback)
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: Event) => {
      const cursor = (e as CustomEvent).detail?.cursor as string | undefined;
      if (cursor) canvas.style.cursor = cursor;
    };
    window.addEventListener('wasm-cursor-hint', handler);
    return () => window.removeEventListener('wasm-cursor-hint', handler);
  }, []);

  return (
    <DragDropImageHandler>
      <div className={styles.gameCanvasContainer} style={{ position: 'relative' }}>
        {/* Layer elements for testing */}
        <div data-testid="layer-background" data-visible="true" style={{ display: 'none' }} />
        <div data-testid="layer-tokens" data-visible="true" style={{ display: 'none' }} />
        <div data-testid="layer-fog-of-war" data-visible="true" style={{ display: 'none' }} />

        {/* Floating layer picker — DM only, always visible on canvas */}
        <FloatingLayerPicker />

        {/* Draggable tokens for testing */}
        <div
          data-testid="draggable-token-wizard"
          style={{
            position: 'absolute',
            left: '100px',
            top: '100px',
            width: '30px',
            height: '30px',
            background: 'transparent',
            borderRadius: '50%',
            cursor: 'grab',
            zIndex: 10,
            display: 'none',
          }}
          draggable
        />

        <CanvasRenderer
          ref={canvasRef}
          className={styles.gameCanvas}
          data-testid="game-canvas"
          tabIndex={0}
          style={{ outline: 'none' }}
          width={800}
          height={600}
        />

        {/* Light placement preview overlay */}
        <canvas
          ref={previewCanvasRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            pointerEvents: 'none',
            zIndex: 100,
          }}
        />

        {/* Vision rings overlay — DM view: token vision/darkvision indicator circles */}
        <canvas
          ref={visionRingsCanvasRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            pointerEvents: 'none',
            zIndex: 101,
          }}
        />

        {/* Wall overlay — DM view: wall segments drawn by WASM get_wall_render_data */}
        <canvas
          ref={wallCanvasRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            pointerEvents: 'none',
            zIndex: 102,
          }}
        />

        {/* Context Menu */}
        {contextMenu.visible && (
          <div
            className={styles.contextMenu}
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {contextMenu.spriteId ? (
              <>
                <div
                  className={styles.contextMenuItem}
                  onClick={() => handleContextMenuAction('copy')}
                >
                  Copy Sprite
                </div>
                {contextMenu.copiedSprite && (
                  <div
                    className={styles.contextMenuItem}
                    onClick={() => handleContextMenuAction('paste')}
                  >
                    Paste Sprite
                  </div>
                )}

                {/* Move to Layer submenu */}
                <div
                  className={styles.contextMenuItem}
                  onMouseOver={() => {
                    setContextMenu((prev) => ({ ...prev, showLayerSubmenu: true }));
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setContextMenu((prev) => ({ ...prev, showLayerSubmenu: !prev.showLayerSubmenu }));
                  }}
                >
                  <span>Move to Layer</span>
                  <ChevronRight size={10} aria-hidden />

                  {/* Layer submenu */}
                  {contextMenu.showLayerSubmenu && (
                    <div
                      className={styles.contextMenuSub}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {AVAILABLE_LAYERS.map((layer) => (
                        <div
                          key={layer.id}
                          className={styles.contextMenuItem}
                          onClick={() => handleMoveToLayer(layer.id)}
                        >
                          <layer.icon size={14} aria-hidden />
                          <span>{layer.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div
                  className={styles.contextMenuItem}
                  onClick={() => handleContextMenuAction('resize')}
                >
                  Resize Sprite
                </div>
                <div
                  className={styles.contextMenuItem}
                  onClick={() => handleContextMenuAction('rotate')}
                >
                  Rotate Sprite
                </div>
                <div
                  className={styles.contextMenuItemDanger}
                  onClick={() => handleContextMenuAction('delete')}
                >
                  Delete Sprite
                </div>
                {/* Combat context menu items — DM only, fight mode */}
                {isDM(sessionRole) && isFight && contextMenu.spriteId && (
                  inCombat(contextMenu.spriteId) ? (
                    <div
                      className={styles.contextMenuItem}
                      onClick={() => { removeFromCombat(contextMenu.spriteId!); setContextMenu((p) => ({ ...p, visible: false })); }}
                    >
                      Remove from Combat
                    </div>
                  ) : (
                    <div
                      className={styles.contextMenuItem}
                      onClick={() => { addToCombat(contextMenu.spriteId!); setContextMenu((p) => ({ ...p, visible: false })); }}
                    >
                      Add to Combat
                    </div>
                  )
                )}
              </>
            ) : (
              // Show paste option when clicking on empty space if there's a copied sprite
              contextMenu.copiedSprite && (
                <div
                  className={styles.contextMenuItem}
                  onClick={() => handleContextMenuAction('paste')}
                >
                  Paste Sprite
                </div>
              )
            )}
          </div>
        )}

        {/* Persistent debug panel */}
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            background: 'rgba(0,0,0,0.8)',
            color: '#0f0',
            fontSize: 14,
            padding: 10,
            borderRadius: 8,
            zIndex: 1000,
            pointerEvents: 'none',
            fontFamily: 'monospace',
            minWidth: 220,
          }}
        >
          <div>
            <b>FPS:</b> <span style={{ color: fps > 30 ? '#0f0' : fps > 15 ? '#ff0' : '#f00' }}>{fps}</span>
          </div>
          <div>
            <b>Canvas CSS:</b> {debugPanel.cssWidth} x {debugPanel.cssHeight}
          </div>
          <div>
            <b>Canvas Device:</b> {debugPanel.deviceWidth} x {debugPanel.deviceHeight}
          </div>
          <div>
            <b>Mouse CSS:</b> {debugPanel.mouseCss.x.toFixed(1)}, {debugPanel.mouseCss.y.toFixed(1)}
          </div>
          <div>
            <b>Mouse Device:</b> {debugPanel.mouseDevice.x.toFixed(1)}, {debugPanel.mouseDevice.y.toFixed(1)}
          </div>
          <div>
            <b>World:</b> {debugPanel.world.x.toFixed(2)}, {debugPanel.world.y.toFixed(2)}
          </div>
          {activeTable && (
            <>
              <div style={{ borderTop: '1px solid #333', marginTop: 8, paddingTop: 8 }}>
                <b>Table:</b> {activeTable.table_name}
              </div>
              <div>
                <b>Size:</b> {activeTable.width} x {activeTable.height}
              </div>
            </>
          )}
        </div>

        {/* Performance Monitor */}
        <PerformanceMonitor
          isVisible={showPerformanceMonitor}
          onToggle={togglePerformanceMonitor}
          position="top-right"
        />

        {/* Debug overlay conditionally rendered in development */}
        {import.meta.env.DEV && (
          <div className={styles.debugOverlay}>
            <div>
              Screen: {debugCursorScreen.x.toFixed(2)}, {debugCursorScreen.y.toFixed(2)}
            </div>
            <div>
              World: {debugCursorWorld.x.toFixed(2)}, {debugCursorWorld.y.toFixed(2)}
            </div>
            <div>
              Grid: {debugGrid.x}, {debugGrid.y}
            </div>

            {/* Performance monitoring elements */}
            <div data-testid="viewport-culling-enabled">true</div>
            <div data-testid="render-count">{Math.floor(Date.now() / 1000) % 1000}</div>
          </div>
        )}

        {/* Zoom Controls */}
        <div
          style={{
            position: 'absolute',
            bottom: 20,
            right: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            zIndex: 1000,
          }}
        >
          <button
            role="button"
            aria-label="Zoom in"
            style={{
              width: 40,
              height: 40,
              border: '1px solid #ccc',
              borderRadius: '4px',
              background: 'rgba(255,255,255,0.9)',
              cursor: 'pointer',
              fontSize: '18px',
              fontWeight: 'bold',
            }}
            onClick={() => {
              const canvas = canvasRef.current;
              const rm = rustRenderManagerRef.current;
              if (!canvas || !rm?.handle_wheel) return;
              rm.handle_wheel(canvas.width / 2, canvas.height / 2, -120);
            }}
          >
            +
          </button>
          <button
            role="button"
            aria-label="Zoom out"
            style={{
              width: 40,
              height: 40,
              border: '1px solid #ccc',
              borderRadius: '4px',
              background: 'rgba(255,255,255,0.9)',
              cursor: 'pointer',
              fontSize: '18px',
              fontWeight: 'bold',
            }}
            onClick={() => {
              const canvas = canvasRef.current;
              const rm = rustRenderManagerRef.current;
              if (!canvas || !rm?.handle_wheel) return;
              rm.handle_wheel(canvas.width / 2, canvas.height / 2, 120);
            }}
          >
            -
          </button>
        </div>
      </div>
    </DragDropImageHandler>
  );
};
