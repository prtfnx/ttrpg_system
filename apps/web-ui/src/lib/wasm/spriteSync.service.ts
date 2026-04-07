/**
 * Sprite synchronization service.
 * Handles all sprite CRUD operations, optimistic inserts, and compendium drops.
 * Depends on AssetSyncService for texture loading after sprite add.
 */

import { useGameStore } from '@/store';
import { tableThumbnailService } from '@features/table/services/tableThumbnail.service';
import type { RenderEngine } from '@lib/wasm/wasm';
import { wasmBridgeService } from './wasmBridge';
import type { AssetSyncService } from './assetSync.service';

const OPTIMISTIC_TIMEOUT = 10_000;

export class SpriteSyncService {
  private optimisticTimers = new Map<string, number>();
  private pendingScaleOperations = new Set<string>();
  private eventCleanups: Array<() => void> = [];

  constructor(
    private readonly getEngine: () => RenderEngine | null,
    private readonly assetSync: AssetSyncService,
  ) {}

  init(): void {
    const on = (type: string, handler: (detail: any) => void) => {
      const listener = (e: Event) => handler((e as CustomEvent).detail);
      window.addEventListener(type, listener);
      this.eventCleanups.push(() => window.removeEventListener(type, listener));
    };

    on('sprite-created', d => this.handleSpriteCreated(d));
    on('sprite-updated', d => this.handleSpriteUpdated(d));
    on('sprite-removed', d => this.handleSpriteRemoved(d));
    on('sprite-response', d => this.handleSpriteResponse(d));
    on('sprite-moved', d => this.handleSpriteMoved(d));
    on('sprite-scaled', d => this.handleSpriteScaled(d));
    on('sprite-rotated', d => this.handleSpriteRotated(d));

    // Compendium sprites arrive via two different channels
    on('compendium-sprite-added', d => this.handleCompendiumConfirmed(d, 'created'));
    on('compendium-sprite-updated', d => this.handleCompendiumConfirmed(d, 'updated'));
    on('compendium-sprite-removed', d => this.handleSpriteRemoved(d));

    // Optimistic drag-drop before server confirms
    on('optimistic-sprite-create', d => {
      if (!d?.sprite_id) return;
      try {
        this.addSpriteToWasm(d);
        this.startOptimisticTimer(d.sprite_id);
      } catch (_e) { /* best-effort */ }
    });

    // Rollback this client's own sprites on server rejection or timeout
    on('sprite-revert', d => {
      const { spriteId, operation, originalState } = d ?? {};
      if (!spriteId || !originalState) return;
      switch (operation) {
        case 'move':   this.updateSpritePosition(spriteId, { x: originalState.x, y: originalState.y }); break;
        case 'resize': this.resizeSpriteInWasm(spriteId, originalState.width, originalState.height); break;
        case 'rotate': this.updateSpriteRotation(spriteId, originalState.rotation); break;
      }
    });

    on('protocol-error', d => {
      if (!d?.client_temp_id) return;
      this.clearOptimisticTimer(d.client_temp_id);
      try { this.getEngine()?.remove_sprite(d.client_temp_id); } catch { /* best-effort */ }
    });

    on('compendium-insert', d => this.handleCompendiumInsert(d));
    on('compendium-drop', d => this.handleCompendiumDrop(d));
  }

  dispose(): void {
    this.eventCleanups.forEach(fn => fn());
    this.eventCleanups = [];
    this.optimisticTimers.forEach(t => clearTimeout(t));
    this.optimisticTimers.clear();
  }

  // ── Public: called by TableSyncService and RemoteSyncService ──────────────

  addSpriteToWasm(spriteData: any): void {
    const engine = this.getEngine();
    if (!engine) return;

    try {
      const layer = spriteData.layer || 'tokens';

      // LEGACY COMPAT: '__LIGHT__' is current; 'LIGHT' is stored in older DB records.
      const isLight = (spriteData.texture_path === '__LIGHT__' || spriteData.texture_path === 'LIGHT')
        && spriteData.layer === 'light';

      // LEGACY COMPAT: __FOG_HIDE__ / __FOG_REVEAL__ are active sentinel values; keep until DB migrated.
      const isFogHide = spriteData.texture_path === '__FOG_HIDE__';
      const isFogReveal = spriteData.texture_path === '__FOG_REVEAL__';

      if (isLight) {
        this.addLightToWasm(engine, spriteData);
        return;
      }

      if (isFogHide || isFogReveal) {
        this.addFogToWasm(engine, spriteData, isFogReveal ? 'reveal' : 'hide');
        return;
      }

      // Polygon obstacle (no texture, geometry only)
      const polyVertices = spriteData.polygon_vertices ?? spriteData.obstacle_data?.vertices ?? null;
      if (spriteData.obstacle_type === 'polygon' && polyVertices && Array.isArray(polyVertices)) {
        this.addPolygonToWasm(engine, spriteData, polyVertices, layer);
        return;
      }

      // Regular sprite
      this.addRegularSpriteToWasm(engine, spriteData, layer);

    } catch (err) {
      console.error('[SpriteSyncService] addSpriteToWasm failed:', err, spriteData);
    }
  }

  updateSpritePosition(spriteId: string, position: { x: number; y: number }): void {
    try {
      const engine = this.getEngine() as any;
      if (!engine) return;
      if (typeof engine.update_sprite_position === 'function') {
        if (engine.update_sprite_position(spriteId, position.x, position.y)) return;
      }
      const sprite = useGameStore.getState().sprites.find((s: any) => s.id === spriteId);
      const isLight = sprite?.layer === 'light' || sprite?.texture === '__LIGHT__';
      if (isLight && typeof engine.update_light_position === 'function') {
        engine.update_light_position(spriteId, position.x, position.y);
      }
    } catch (err) {
      console.error('[SpriteSyncService] updateSpritePosition failed:', err);
    }
  }

  resizeSpriteInWasm(spriteId: string, width: number, height: number): void {
    const engine = this.getEngine() as any;
    if (!engine) return;
    try {
      const ok = engine.resize_sprite?.(String(spriteId), Number(width), Number(height));
      if (ok && typeof engine.render === 'function') engine.render();
    } catch (err) {
      console.error('[SpriteSyncService] resizeSpriteInWasm failed:', err);
    }
  }

  updateSpriteRotation(spriteId: string, rotation: number): void {
    const engine = this.getEngine() as any;
    if (!engine) return;
    try {
      engine.rotate_sprite?.(spriteId, rotation);
    } catch (err) {
      console.error('[SpriteSyncService] updateSpriteRotation failed:', err);
    }
  }

  startOptimisticTimer(tempId: string): void {
    this.clearOptimisticTimer(tempId);
    const t = window.setTimeout(() => {
      try { this.getEngine()?.remove_sprite(tempId); } catch { /* best-effort */ }
      this.optimisticTimers.delete(tempId);
    }, OPTIMISTIC_TIMEOUT);
    this.optimisticTimers.set(tempId, t as unknown as number);
  }

  clearOptimisticTimer(tempId: string): void {
    const t = this.optimisticTimers.get(tempId);
    if (t) { clearTimeout(t); this.optimisticTimers.delete(tempId); }
  }

  // ── Private sprite handlers ───────────────────────────────────────────────

  private handleSpriteCreated(data: any): void {
    if (!this.getEngine()) return;
    this.addSpriteToWasm(data);
    if (data?.table_id) tableThumbnailService.invalidateTable(data.table_id);
  }

  private handleSpriteResponse(data: any): void {
    if (!this.getEngine()) return;
    if (data.operation === 'create' || (!data.operation && data.sprite_data)) {
      const tempId = data.client_temp_id;
      if (tempId) {
        this.clearOptimisticTimer(tempId);
        try { this.getEngine()?.remove_sprite(tempId); } catch { /* ok */ }
      }
      const confirmedId = data.sprite_data?.sprite_id;
      if (confirmedId && confirmedId !== tempId) {
        try { this.getEngine()?.remove_sprite(confirmedId); } catch { /* ok */ }
      }
      try { this.addSpriteToWasm(data.sprite_data); } catch (e) {
        console.error('[SpriteSyncService] addSpriteToWasm after response:', e);
      }
    } else if (data.operation === 'remove' && data.success && data.sprite_id) {
      try { this.getEngine()?.remove_sprite(data.sprite_id); } catch (e) {
        console.error('[SpriteSyncService] remove after server confirm:', e);
      }
    }
  }

  private handleSpriteUpdated(data: any): void {
    if (!this.getEngine()) return;
    try {
      const spriteId = data.sprite_id || data.id;
      if (!spriteId) return;
      if (data.operation === 'create' && data.sprite_data) { this.addSpriteToWasm(data.sprite_data); return; }
      if (data.operation === 'remove') {
        try { this.getEngine()?.remove_sprite(spriteId); } catch { /* ignore */ }
        useGameStore.setState(state => ({ sprites: state.sprites.filter(s => s.id !== spriteId) }));
        return;
      }
      if (data.operation === 'move' && data.position) { this.updateSpritePosition(spriteId, data.position); return; }
      if (data.operation === 'scale') { this.updateSpriteScale(spriteId, data.scale_x, data.scale_y); return; }
      if (data.operation === 'rotate' && data.rotation !== undefined) { this.updateSpriteRotation(spriteId, data.rotation); return; }
      if (data.operation && !this.hasCompleteData(data)) { this.handlePartialSpriteUpdate(spriteId, data); return; }
      if (this.hasCompleteData(data) && this.needsFullRecreation(data)) {
        this.getEngine()?.remove_sprite(spriteId);
        this.addSpriteToWasm(data);
      } else if (this.hasCompleteData(data)) {
        this.updateSpriteEfficiently(spriteId, data);
      }
    } catch (err) {
      console.error('[SpriteSyncService] handleSpriteUpdated failed:', err);
    }
  }

  private handleSpriteRemoved(data: any): void {
    if (!this.getEngine()) return;
    try {
      const spriteId = data.sprite_id || data.id;
      if (!spriteId) return;
      this.getEngine()?.remove_sprite(spriteId);
      if (data.table_id) tableThumbnailService.invalidateTable(data.table_id);
    } catch (err) {
      console.error('[SpriteSyncService] handleSpriteRemoved failed:', err);
    }
  }

  private handleSpriteMoved(data: any): void {
    if (!this.getEngine()) return;
    try {
      const spriteId = data.sprite_id || data.id;
      if (!spriteId) return;
      let pos: { x: number; y: number } | null = null;
      if (data.to) { this.updateSpritePosition(spriteId, data.to); pos = data.to; }
      else if (data.position) { this.updateSpritePosition(spriteId, data.position); pos = data.position; }
      else if (data.x !== undefined && data.y !== undefined) { this.updateSpritePosition(spriteId, { x: data.x, y: data.y }); pos = { x: data.x, y: data.y }; }
      else { this.updateSpriteEfficiently(spriteId, data); }
      if (pos) {
        useGameStore.getState().moveSprite(spriteId, pos.x, pos.y);
        wasmBridgeService.seedSpriteState(spriteId, pos);
      }
      if (data.table_id) tableThumbnailService.invalidateTable(data.table_id);
    } catch (err) {
      console.error('[SpriteSyncService] handleSpriteMoved failed:', err);
    }
  }

  private handleSpriteScaled(data: any): void {
    if (!this.getEngine()) return;
    try {
      const spriteId = data.sprite_id || data.id || data.spriteId;
      if (!spriteId) return;
      if (data.width !== undefined && data.height !== undefined) {
        this.resizeSpriteInWasm(spriteId, data.width, data.height);
        wasmBridgeService.seedSpriteState(spriteId, { width: data.width, height: data.height });
      }
      if (data.table_id) tableThumbnailService.invalidateTable(data.table_id);
    } catch (err) {
      console.error('[SpriteSyncService] handleSpriteScaled failed:', err);
    }
  }

  private handleSpriteRotated(data: any): void {
    if (!this.getEngine()) return;
    try {
      const spriteId = data.sprite_id || data.id || data.spriteId;
      if (spriteId && typeof data.rotation === 'number') {
        this.updateSpriteRotation(spriteId, data.rotation);
        wasmBridgeService.seedSpriteState(spriteId, { rotation: data.rotation });
      }
    } catch (err) {
      console.error('[SpriteSyncService] handleSpriteRotated failed:', err);
    }
  }

  private handleCompendiumConfirmed(data: any, _op: 'created' | 'updated'): void {
    if (!data) return;
    try {
      if (data.client_temp_id) {
        this.clearOptimisticTimer(data.client_temp_id);
        try { this.getEngine()?.remove_sprite(data.client_temp_id); } catch { /* ok */ }
      }
      if (_op === 'created') this.handleSpriteCreated(data);
      else this.handleSpriteUpdated(data);
    } catch (err) {
      console.error('[SpriteSyncService] handleCompendiumConfirmed failed:', err);
    }
  }

  private handleCompendiumInsert(data: any): void {
    if (!data) return;
    try {
      const spriteData = {
        id: data.id || `comp_${Date.now()}`,
        x: data.x ?? data.world_x ?? 0,
        y: data.y ?? data.world_y ?? 0,
        width: data.width || data.size_x || 50,
        height: data.height || data.size_y || 50,
        asset_id: data.asset_id || data.texture || data.imageUrl || data.texture_id || data.image || data.texture_path || '',
        layer: data.layer || 'tokens',
        rotation: data.rotation || 0,
        scale_x: data.scale_x || 1,
        scale_y: data.scale_y || 1,
        tint_color: data.tint_color || [1, 1, 1, 1],
      };
      this.addSpriteToWasm(spriteData);
      if (String(spriteData.id).startsWith('opt_')) this.startOptimisticTimer(spriteData.id);
    } catch (err) {
      console.error('[SpriteSyncService] handleCompendiumInsert failed:', err);
    }
  }

  private handleCompendiumDrop(data: any): void {
    if (!data) return;
    try {
      const store = useGameStore.getState();
      const { camera, activeTableId: tableId } = store;
      if (!tableId) return;

      const worldX = ((data.dropX ?? 0) - camera.x) / camera.zoom;
      const worldY = ((data.dropY ?? 0) - camera.y) / camera.zoom;
      const tempId = `comp_${Date.now()}`;

      this.addSpriteToWasm({ sprite_id: tempId, x: worldX, y: worldY, width: 64, height: 64, asset_id: '', layer: 'tokens', name: data.name || 'Unknown' });
      this.startOptimisticTimer(tempId);

      window.dispatchEvent(new CustomEvent('protocol-send-message', {
        detail: {
          type: 'compendium_sprite_add',
          data: {
            table_id: tableId,
            sprite_data: { client_temp_id: tempId, x: worldX, y: worldY, width: 64, height: 64, layer: 'tokens', name: data.name || 'Unknown' },
            ...(data.type === 'monster' && { monster_data: { name: data.name || 'Unknown', type: data.monsterType || '', challenge_rating: data.challenge_rating || '', raw: data.raw || {} } }),
          },
        },
      }));
    } catch (err) {
      console.error('[SpriteSyncService] handleCompendiumDrop failed:', err);
    }
  }

  // ── Sprite shape helpers ──────────────────────────────────────────────────

  private addLightToWasm(engine: RenderEngine, spriteData: any): void {
    let x = 0, y = 0;
    if (Array.isArray(spriteData.position) && spriteData.position.length >= 2) {
      [x, y] = spriteData.position;
    } else {
      x = spriteData.coord_x ?? spriteData.x ?? 0;
      y = spriteData.coord_y ?? spriteData.y ?? 0;
    }
    let meta: any = {};
    try { if (typeof spriteData.metadata === 'string') meta = JSON.parse(spriteData.metadata); } catch { /* defaults */ }

    const lightId = spriteData.sprite_id || spriteData.id || `light_${Date.now()}`;
    const radius = meta.radius ?? 150.0;
    const intensity = meta.intensity ?? 1.0;
    const color = meta.color ?? { r: 1.0, g: 0.9, b: 0.7, a: 1.0 };
    const isOn = meta.isOn !== false;

    const existing = useGameStore.getState().sprites.find((s: any) => s.id === lightId);
    const finalX = existing ? (existing.x ?? x) : x;
    const finalY = existing ? (existing.y ?? y) : y;

    const e = engine as any;
    if (typeof e.add_light === 'function') {
      e.add_light(lightId, finalX, finalY);
      e.set_light_color(lightId, color.r, color.g, color.b, color.a);
      e.set_light_intensity(lightId, intensity);
      e.set_light_radius(lightId, radius);
      if (!isOn) e.toggle_light?.(lightId);
    }

    useGameStore.getState().addSprite({
      id: lightId, name: spriteData.name || meta.presetName || 'Light',
      tableId: spriteData.table_id ?? '', x, y,
      texture: '__LIGHT__', layer: 'light',
      scale: { x: 1, y: 1 }, rotation: 0, metadata: spriteData.metadata ?? undefined,
    });
  }

  private addFogToWasm(engine: RenderEngine, spriteData: any, mode: 'hide' | 'reveal'): void {
    let startX = 0, startY = 0;
    if (Array.isArray(spriteData.position) && spriteData.position.length >= 2) {
      [startX, startY] = spriteData.position;
    } else {
      startX = spriteData.coord_x ?? spriteData.x ?? 0;
      startY = spriteData.coord_y ?? spriteData.y ?? 0;
    }
    const width = spriteData.scale_x ?? 100;
    const height = spriteData.scale_y ?? 100;
    const fogId = spriteData.sprite_id || spriteData.id || `fog_${Date.now()}`;
    (engine as any).add_fog_rectangle?.(fogId, startX, startY, startX + width, startY + height, mode);
  }

  private addPolygonToWasm(engine: RenderEngine, spriteData: any, vertices: Array<{ x: number; y: number }>, layer: string): void {
    const e = engine as any;
    if (typeof e.create_polygon_sprite === 'function') {
      const flat = new Float32Array(vertices.flatMap(v => [v.x, v.y]));
      try { e.create_polygon_sprite(flat, layer, spriteData.table_id || 'default_table'); } catch (err) {
        console.error('[SpriteSyncService] create_polygon_sprite failed:', err);
      }
    }
    const cx = vertices[0]?.x ?? spriteData.x ?? 0;
    const cy = vertices[0]?.y ?? spriteData.y ?? 0;
    try {
      useGameStore.getState().addSprite({
        id: spriteData.sprite_id || spriteData.id || `polygon_${Date.now()}`,
        name: spriteData.name || 'Polygon Obstacle',
        tableId: spriteData.table_id || 'default_table',
        x: cx, y: cy, layer, texture: '',
        scale: { x: 1, y: 1 }, rotation: 0, syncStatus: 'synced' as const,
      });
    } catch { /* non-critical */ }
  }

  private addRegularSpriteToWasm(engine: RenderEngine, spriteData: any, layer: string): void {
    let x = 0, y = 0;
    if (Array.isArray(spriteData.position) && spriteData.position.length >= 2) {
      [x, y] = spriteData.position;
    } else {
      // LEGACY COMPAT: coord_x/coord_y is older DB field; x/y is canonical.
      x = spriteData.coord_x ?? spriteData.x ?? 0;
      y = spriteData.coord_y ?? spriteData.y ?? 0;
    }
    // LEGACY COMPAT: asset_xxhash is old field; asset_id is canonical; texture_path is oldest fallback.
    const assetId = spriteData.asset_id || spriteData.asset_xxhash || spriteData.texture_path || null;
    const wasmSprite = {
      id: spriteData.sprite_id || spriteData.id || `sprite_${Date.now()}`,
      world_x: x, world_y: y,
      width: spriteData.width || 50, height: spriteData.height || 50,
      scale_x: spriteData.scale_x || 1.0, scale_y: spriteData.scale_y || 1.0,
      rotation: spriteData.rotation || 0.0, layer,
      texture_id: assetId || '',
      tint_color: spriteData.tint_color || [1.0, 1.0, 1.0, 1.0],
      table_id: spriteData.table_id || 'default_table',
      // LEGACY COMPAT: controlled_by may be array, raw string, or JSON-encoded string.
      controlled_by: Array.isArray(spriteData.controlled_by)
        ? spriteData.controlled_by
        : (typeof spriteData.controlled_by === 'string'
            ? (() => { try { return JSON.parse(spriteData.controlled_by); } catch { return []; } })()
            : []),
      obstacle_type: spriteData.obstacle_type || null,
      polygon_vertices: spriteData.polygon_vertices ?? spriteData.obstacle_data?.vertices ?? null,
    };

    engine.add_sprite_to_layer(layer, wasmSprite);
    wasmBridgeService.seedSpriteState(wasmSprite.id, { x, y, width: wasmSprite.width, height: wasmSprite.height, rotation: wasmSprite.rotation });

    try {
      useGameStore.getState().addSprite({
        id: wasmSprite.id, name: spriteData.name || 'Unnamed Entity',
        tableId: wasmSprite.table_id, x, y, layer,
        texture: spriteData.texture_path || '',
        scale: { x: wasmSprite.scale_x, y: wasmSprite.scale_y }, rotation: wasmSprite.rotation,
        characterId: spriteData.character_id,
        controlledBy: spriteData.controlled_by || [],
        hp: spriteData.hp, maxHp: spriteData.max_hp, ac: spriteData.ac,
        auraRadius: spriteData.aura_radius, auraRadiusUnits: spriteData.aura_radius_units ?? undefined,
        visionRadius: spriteData.vision_radius ?? undefined,
        visionRadiusUnits: spriteData.vision_radius_units ?? undefined,
        hasDarkvision: spriteData.has_darkvision ?? false,
        darkvisionRadius: spriteData.darkvision_radius ?? undefined,
        darkvisionRadiusUnits: spriteData.darkvision_radius_units ?? undefined,
        syncStatus: 'synced' as const,
      });
    } catch { /* store update failure is non-critical */ }

    if (!assetId) return;
    if (this.assetSync.isAssetPending(assetId)) {
      this.assetSync.trackPendingSprite(assetId, wasmSprite.id);
    } else {
      this.assetSync.requestAssetDownloadLink(assetId, wasmSprite.id);
    }
  }

  // ── Update helpers ────────────────────────────────────────────────────────

  private updateSpriteScale(spriteId: string, scaleX?: number, scaleY?: number): void {
    if (this.pendingScaleOperations.has(spriteId)) return;
    this.pendingScaleOperations.add(spriteId);
    try {
      const engine = this.getEngine() as any;
      if (!engine) return;
      const sx = scaleX ?? 1.0, sy = scaleY ?? 1.0;
      const ok = engine.update_sprite_scale?.(String(spriteId), Number(sx), Number(sy));
      if (ok) { engine.render?.(); requestAnimationFrame(() => engine.render?.()); }
    } catch (err) {
      console.error('[SpriteSyncService] updateSpriteScale failed:', err);
    } finally {
      this.pendingScaleOperations.delete(spriteId);
    }
  }

  private hasCompleteData(data: any): boolean {
    const hasPos = (Array.isArray(data.position) && data.position.length >= 2)
      || (data.x !== undefined && data.y !== undefined)
      || (data.coord_x !== undefined && data.coord_y !== undefined)
      || (data.world_x !== undefined && data.world_y !== undefined);
    const hasAsset = data.asset_id || data.asset_xxhash || data.texture_id;
    const hasDims = (data.width && data.height) || (data.size_x && data.size_y);
    return hasPos && hasAsset && hasDims;
  }

  private needsFullRecreation(data: any): boolean {
    return !!(data.layer_changed || data.texture_changed || data.fundamental_change);
  }

  private handlePartialSpriteUpdate(spriteId: string, data: any): void {
    const u = data.updates ?? {};
    if (data.position || u.position || data.x !== undefined || u.x !== undefined) {
      const pos = data.position ?? u.position ?? { x: data.x ?? u.x, y: data.y ?? u.y };
      this.updateSpritePosition(spriteId, pos);
    }
    if (data.scale_x !== undefined || u.scale_x !== undefined) this.updateSpriteScale(spriteId, data.scale_x ?? u.scale_x, data.scale_y ?? u.scale_y);
    if (data.rotation !== undefined || u.rotation !== undefined) this.updateSpriteRotation(spriteId, data.rotation ?? u.rotation);

    // LEGACY COMPAT: controlled_by may be array, raw string, or JSON-encoded string.
    const rawCb = data.controlled_by ?? u.controlled_by;
    if (rawCb !== undefined) {
      let cbNums: number[] = Array.isArray(rawCb) ? rawCb.map(Number) : (typeof rawCb === 'string' ? (() => { try { return JSON.parse(rawCb).map(Number); } catch { return []; } })() : []);
      (this.getEngine() as any)?.update_sprite_controlled_by?.(spriteId, cbNums);
      useGameStore.setState(state => ({ sprites: state.sprites.map(s => s.id === spriteId ? { ...s, controlledBy: cbNums.map(String) } : s) }));
    }

    // Vision fields
    const vr = data.vision_radius ?? u.vision_radius;
    const hdv = data.has_darkvision ?? u.has_darkvision;
    const dvr = data.darkvision_radius ?? u.darkvision_radius;
    if (vr !== undefined || hdv !== undefined || dvr !== undefined) {
      useGameStore.setState(state => ({
        sprites: state.sprites.map(s => s.id === spriteId ? { ...s, ...(vr !== undefined ? { visionRadius: vr } : {}), ...(hdv !== undefined ? { hasDarkvision: hdv } : {}), ...(dvr !== undefined ? { darkvisionRadius: dvr } : {}) } : s),
      }));
    }
  }

  private updateSpriteEfficiently(spriteId: string, data: any): void {
    if (data.position || (data.x !== undefined && data.y !== undefined) || (data.world_x !== undefined)) {
      const pos = data.position
        ? (Array.isArray(data.position) ? { x: data.position[0], y: data.position[1] } : data.position)
        : { x: data.x ?? data.world_x ?? 0, y: data.y ?? data.world_y ?? 0 };
      this.updateSpritePosition(spriteId, pos);
    }
    if (data.scale_x !== undefined || data.scale_y !== undefined) this.updateSpriteScale(spriteId, data.scale_x, data.scale_y);
    if (data.rotation !== undefined) this.updateSpriteRotation(spriteId, data.rotation);
  }
}
