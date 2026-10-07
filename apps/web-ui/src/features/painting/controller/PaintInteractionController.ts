import { getRelativeCoords } from '@features/canvas/components/GameCanvas/canvasUtils';
import type { RenderEngine } from '@lib/wasm/runtime';
import type { PaintControllerState } from './PaintController';
import {
  assertPaintObjectInput,
  PaintValidationError,
  type PaintObject,
  type PaintObjectInput,
  type PaintPoint,
  type PaintStyle,
} from '../model/paintObject';
import {
  compactFreehandPoints,
  createPaintDraft,
  MAX_FREEHAND_POINTS,
  resizePaintObject,
  rotatePaintObject,
  paintWorldBounds,
  type PaintHandleKind,
  type PaintTool,
} from './paintGeometry';
import { SelectionManager, intersectsSelection, selectionRectangle, type SelectionMode, type SelectionRef, type SelectionBounds } from './SelectionManager';

const LOCAL_DRAFT_KEY = 'local';
const HIT_TOLERANCE_PX = 6;
const MAX_GESTURE_SAMPLES = MAX_FREEHAND_POINTS * 4;

export interface PaintInteractionScene {
  getState(): PaintControllerState;
  subscribe(listener: (state: PaintControllerState) => void): () => void;
  submitCreate(object: PaintObjectInput): string | null;
  submitUpdate(objectId: string, expectedVersion: number, object: PaintObjectInput): string | null;
  submitDelete(objectId: string, expectedVersion: number): string | null;
  queuePreview(draft: PaintObjectInput): void;
  cancelLocalPreview(): void;
  reportLocalError(message: string): void;
}

interface PaintInteractionRuntime {
  getRenderEngine(): Pick<RenderEngine, 'screen_to_world'> | null;
  setPaintDraft(tableId: string, key: string, draft: PaintObjectInput): boolean;
  clearPaintDraft(key: string): boolean;
  hitTestPaintObject(worldX: number, worldY: number, tolerance: number): string | null;
  hitTestPaintHandle(
    objectId: string,
    worldX: number,
    worldY: number,
    tolerance: number,
  ): string | null;
  selectPaintObject(objectId: string): boolean;
  selectPaintObjects?(objectIds: readonly string[]): boolean;
  clearPaintObjectSelection(): void;
}

export interface SelectionSprite {
  id: string;
  x: number;
  y: number;
  bounds: SelectionBounds;
  canEdit: boolean;
  canDelete?: boolean;
}

export interface SpriteSelectionPort {
  items(tableId: string): readonly SelectionSprite[];
  hitTest(x: number, y: number): string | null;
  select(ids: readonly string[]): void;
  preview(id: string, x: number, y: number): void;
  move(tableId: string, id: string, x: number, y: number): void;
  remove(tableId: string, id: string): void;
}

interface SelectionGestureBase {
  pointerId: number;
  tableId: string;
  start: PaintPoint;
  current: PaintPoint;
  canvas: HTMLCanvasElement;
  base: readonly SelectionRef[];
  paints: PaintObject[];
  sprites: SelectionSprite[];
  changed: boolean;
}
type SelectionGesture = (SelectionGestureBase & { kind: 'marquee' }) | (SelectionGestureBase & { kind: 'group' });

interface CreationGesture {
  kind: 'create';
  pointerId: number;
  tableId: string;
  objectId: string;
  start: PaintPoint;
  samples: PaintPoint[];
  current: PaintPoint;
  draft: PaintObjectInput;
  canvas: HTMLCanvasElement;
}

interface MoveGesture {
  kind: 'move';
  pointerId: number;
  tableId: string;
  start: PaintPoint;
  current: PaintPoint;
  original: PaintObject;
  draft: PaintObjectInput;
  changed: boolean;
  canvas: HTMLCanvasElement;
}

interface ResizeGesture {
  kind: 'resize';
  pointerId: number;
  tableId: string;
  start: PaintPoint;
  current: PaintPoint;
  original: PaintObject;
  handle: PaintHandleKind;
  draft: PaintObjectInput;
  changed: boolean;
  canvas: HTMLCanvasElement;
}

type Gesture = CreationGesture | MoveGesture | ResizeGesture | SelectionGesture;

export interface PaintInteractionState {
  enabled: boolean;
  ready: boolean;
  tool: PaintTool;
  style: PaintStyle;
  gestureActive: boolean;
  selected: PaintObject | null;
  canEditSelected: boolean;
  selectedIds?: readonly string[];
  selectedSpriteIds?: readonly string[];
  selectionCount?: number;
}

function editableObject(object: PaintObject): PaintObjectInput {
  const {
    table_id: _tableId,
    created_by: _createdBy,
    version: _version,
    z_order: _zOrder,
    created_at: _createdAt,
    updated_at: _updatedAt,
    ...editable
  } = object;
  return structuredClone(editable) as PaintObjectInput;
}

function eventPressure(event: PointerEvent): number {
  return event.pressure > 0 ? Math.min(1, event.pressure) : 0.5;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && target.isContentEditable);
}

export class PaintInteractionController {
  private enabled = false;
  private tool: PaintTool = 'draw';
  private style: PaintStyle = {
    stroke_rgba: [1, 0, 0, 1],
    width: 4,
    fill_rgba: null,
  };
  private actorId: number | null = null;
  private canManageOthers = false;
  private selectedId: string | null = null;
  private readonly selection = new SelectionManager();
  private selectionMode: SelectionMode = 'separate';
  private selectOnly = false;
  private sprites: SpriteSelectionPort | null = null;
  private gesture: Gesture | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private previousTouchAction = '';
  private tableId: string | null = null;
  private sceneState: PaintControllerState;
  private readonly scene: PaintInteractionScene;
  private readonly runtime: PaintInteractionRuntime;
  private readonly listeners = new Set<(state: PaintInteractionState) => void>();
  private unsubscribeScene: (() => void) | null = null;

  constructor(
    scene: PaintInteractionScene,
    runtime: PaintInteractionRuntime,
  ) {
    this.scene = scene;
    this.runtime = runtime;
    this.sceneState = scene.getState();
    this.tableId = this.sceneState.tableId;
  }

  connectScene(): () => void {
    this.unsubscribeScene?.();
    const unsubscribe = this.scene.subscribe(state => {
      if (state.tableId !== this.tableId) {
        this.cancelGesture();
        this.selectedId = null;
        this.selection.clear();
        this.sprites?.select([]);
        this.runtime.clearPaintObjectSelection();
        this.tableId = state.tableId;
      }
      this.sceneState = state;
      if (state.hydrating) this.cancelGesture();
      const oldIds = this.paintIds().join(',');
      this.selection.retain(ref => ref.kind !== 'paint' || state.committed.some(object => object.id === ref.id));
      if (oldIds !== this.paintIds().join(',')) this.syncSelection();
      const editing = this.gesture;
      if (editing && editing.kind !== 'create' && editing.kind !== 'marquee') {
        const originals = editing.kind === 'group' ? editing.paints : [editing.original];
        if (originals.some(original => !state.committed.some(item => item.id === original.id && item.version === original.version))) {
          this.cancelGesture();
        }
      }
      this.emit();
    });
    this.unsubscribeScene = unsubscribe;
    return () => {
      unsubscribe();
      if (this.unsubscribeScene === unsubscribe) this.unsubscribeScene = null;
    };
  }

  dispose(): void {
    this.unbind();
    this.unsubscribeScene?.();
    this.unsubscribeScene = null;
    this.listeners.clear();
  }

  subscribe(listener: (state: PaintInteractionState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  getState(): PaintInteractionState {
    const selected = this.selectedId
      ? this.sceneState.committed.find(object => object.id === this.selectedId) ?? null
      : null;
    return {
      enabled: this.enabled,
      ready: this.enabled && this.sceneState.tableId !== null && !this.sceneState.hydrating,
      tool: this.selectOnly ? 'select' : this.tool,
      style: structuredClone(this.style),
      gestureActive: this.gesture !== null,
      selected,
      canEditSelected: this.selectedPaints().some(item => this.canEdit(item))
        || this.selectedSprites().some(item => item.canEdit),
      selectedIds: this.paintIds(),
      selectedSpriteIds: this.spriteIds(),
      selectionCount: this.selection.items.length,
    };
  }

  setActor(actorId: number | null, canManageOthers: boolean): void {
    if (actorId !== this.actorId || canManageOthers !== this.canManageOthers) {
      this.cancelGesture();
      this.clearSelection();
    }
    this.actorId = actorId;
    this.canManageOthers = canManageOthers;
    this.emit();
  }

  setSelectionMode(mode: SelectionMode): void {
    if (mode === this.selectionMode) return;
    this.cancelGesture();
    this.clearSelection();
    this.selectionMode = mode;
    this.emit();
  }

  setSelectOnly(selectOnly: boolean): void {
    if (this.selectOnly === selectOnly) return;
    this.cancelGesture();
    this.selectOnly = selectOnly;
    this.emit();
  }

  setSpriteSelectionPort(port: SpriteSelectionPort | null): void { this.sprites = port; }

  cancelSelectionGesture(): void { this.cancelGesture(); }

  reconcileSelection(): void {
    const table = this.sceneState.tableId;
    const visibleSprites = table ? this.sprites?.items(table) ?? [] : [];
    this.selection.retain(ref => ref.kind !== 'sprite' || visibleSprites.some(item => item.id === ref.id));
    const gesture = this.gesture;
    if (gesture?.kind === 'group' && gesture.sprites.some(original => {
      const current = visibleSprites.find(item => item.id === original.id);
      return !current || !current.canEdit || current.x !== original.x || current.y !== original.y;
    })) this.cancelGesture();
    this.syncSelection();
    this.emit();
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) {
      this.cancelGesture();
      this.selectedId = null;
      this.selection.clear();
      this.sprites?.select([]);
      this.runtime.clearPaintObjectSelection();
    }
    if (this.canvas) this.canvas.style.touchAction = enabled ? 'none' : this.previousTouchAction;
    this.emit();
  }

  setTool(tool: PaintTool): void {
    if (this.tool === tool) return;
    this.cancelGesture();
    this.tool = tool;
    this.emit();
  }

  setStyle(style: PaintStyle): void {
    this.style = structuredClone(style);
    this.emit();
  }

  restyleSelected(style: PaintStyle): boolean {
    const selected = this.selectedObject();
    if (
      !selected
      || !this.selectedPaints().some(item => this.canEdit(item))
      || !this.sceneState.tableId
      || this.sceneState.hydrating
    ) return false;
    let changed = false;
    for (const object of this.selectedPaints().filter(item => this.canEdit(item))) {
      const replacement = editableObject(object);
      replacement.style = structuredClone(style);
      changed = this.scene.submitUpdate(object.id, object.version, replacement) !== null || changed;
    }
    return changed;
  }

  deleteSelected(): boolean {
    if (this.sceneState.hydrating) return false;
    const tableId = this.sceneState.tableId;
    if (!tableId) return false;
    let changed = false;
    for (const selected of this.selectedPaints().filter(item => this.canEdit(item))) {
      changed = this.scene.submitDelete(selected.id, selected.version) !== null || changed;
    }
    for (const sprite of this.selectedSprites().filter(item => item.canDelete === true)) {
      this.sprites?.remove(tableId, sprite.id);
      changed = true;
    }
    if (!changed) return false;
    this.clearSelection();
    this.emit();
    return true;
  }

  bind(canvas: HTMLCanvasElement): () => void {
    this.unbind();
    this.canvas = canvas;
    this.previousTouchAction = canvas.style.touchAction;
    if (this.enabled) canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('pointercancel', this.handlePointerCancel);
    canvas.addEventListener('lostpointercapture', this.handleLostPointerCapture);
    document.addEventListener('keydown', this.handleKeyDown);
    return () => this.unbind();
  }

  restoreRenderer(): void {
    this.syncSelection();
  }

  unbind(): void {
    this.cancelGesture();
    const canvas = this.canvas;
    if (!canvas) return;
    canvas.removeEventListener('pointerdown', this.handlePointerDown);
    canvas.removeEventListener('pointermove', this.handlePointerMove);
    canvas.removeEventListener('pointerup', this.handlePointerUp);
    canvas.removeEventListener('pointercancel', this.handlePointerCancel);
    canvas.removeEventListener('lostpointercapture', this.handleLostPointerCapture);
    document.removeEventListener('keydown', this.handleKeyDown);
    canvas.style.touchAction = this.previousTouchAction;
    this.canvas = null;
  }

  readonly handlePointerDown = (event: PointerEvent): void => {
    if (
      !this.enabled
      || this.sceneState.hydrating
      || this.gesture
      || event.button !== 0
      || !event.isPrimary
    ) return;
    const canvas = this.canvas;
    const tableId = this.sceneState.tableId;
    if (!canvas || !tableId) return;
    const point = this.worldPoint(event, canvas);
    if (!point) return;

    const tool = this.selectOnly ? 'select' : this.tool;
    if (tool === 'delete' || tool === 'select') {
      const previouslySelected = this.selectedObject();
      const handle = tool === 'select' && previouslySelected && this.selection.items.length === 1
        ? this.runtime.hitTestPaintHandle(
          previouslySelected.id,
          point.x,
          point.y,
          HIT_TOLERANCE_PX,
        ) as PaintHandleKind | null
        : null;
      if (handle) {
        if (!this.canEdit(previouslySelected!) || !this.capture(canvas, event.pointerId)) {
          this.emit();
          event.preventDefault();
          return;
        }
        const draft = editableObject(previouslySelected!);
        this.gesture = {
          kind: 'resize',
          pointerId: event.pointerId,
          tableId,
          start: point,
          current: point,
          original: previouslySelected!,
          handle,
          draft,
          changed: false,
          canvas,
        };
        this.publishDraft(tableId, draft);
        event.preventDefault();
        this.emit();
        return;
      }
      const objectId = this.runtime.hitTestPaintObject(point.x, point.y, HIT_TOLERANCE_PX);
      const spriteId = this.selectionMode === 'combined' ? this.sprites?.hitTest(point.x, point.y) : null;
      const ref: SelectionRef | null = spriteId ? { kind: 'sprite', id: spriteId }
        : objectId ? { kind: 'paint', id: objectId } : null;
      const additive = event.shiftKey || event.ctrlKey || event.metaKey;
      if (!ref && tool === 'select') {
        if (!this.capture(canvas, event.pointerId)) return;
        this.gesture = { kind: 'marquee', pointerId: event.pointerId, tableId, start: point,
          current: point, canvas, base: additive ? this.selection.items : [], paints: [], sprites: [], changed: false };
        if (!additive) this.clearSelection();
        event.preventDefault();
        this.emit();
        return;
      }
      if (ref) this.selection.click(ref, additive);
      else this.selection.clear();
      this.syncSelection();
      const selected = this.selectedObject();
      if (tool === 'delete') {
        this.deleteSelected();
        event.preventDefault();
        return;
      }
      if (additive) { this.emit(); event.preventDefault(); return; }
      if (this.selection.items.length > 1 || spriteId) {
        const paints = this.selectedPaints().filter(item => this.canEdit(item));
        const sprites = this.selectedSprites().filter(item => item.canEdit);
        if ((paints.length || sprites.length) && this.capture(canvas, event.pointerId)) {
          this.gesture = { kind: 'group', pointerId: event.pointerId, tableId, start: point,
            current: point, canvas, base: this.selection.items, paints, sprites, changed: false };
        }
        event.preventDefault();
        this.emit();
        return;
      }
      if (!selected || !this.canEdit(selected) || !this.capture(canvas, event.pointerId)) {
        this.emit();
        event.preventDefault();
        return;
      }
      const draft = editableObject(selected);
      this.gesture = {
        kind: 'move',
        pointerId: event.pointerId,
        tableId,
        start: point,
        current: point,
        original: selected,
        draft,
        changed: false,
        canvas,
      };
      this.publishDraft(tableId, draft);
      event.preventDefault();
      this.emit();
      return;
    }

    if (!this.capture(canvas, event.pointerId)) return;
    const objectId = crypto.randomUUID();
    const draft = createPaintDraft(tool, objectId, point, point, [point], this.style);
    this.gesture = {
      kind: 'create',
      pointerId: event.pointerId,
      tableId,
      objectId,
      start: point,
      samples: [point],
      current: point,
      draft,
      canvas,
    };
    this.publishDraft(tableId, draft);
    event.preventDefault();
    this.emit();
  };

  readonly handlePointerMove = (event: PointerEvent): void => {
    const gesture = this.gesture;
    if (!this.enabled || !gesture || event.pointerId !== gesture.pointerId) return;
    const samples = event.getCoalescedEvents?.() ?? [];
    const events = samples.length > 0 ? samples : [event];
    try {
      for (const sample of events) {
        const point = this.worldPoint(sample, gesture.canvas);
        if (!point) {
          this.cancelGesture();
          event.preventDefault();
          return;
        }
        gesture.current = point;
        if (gesture.kind === 'marquee') {
          if (point.x === gesture.start.x && point.y === gesture.start.y) continue;
          const bounds = selectionRectangle(gesture.start, point);
          const refs: SelectionRef[] = this.sceneState.committed
            .filter(object => intersectsSelection(bounds, paintWorldBounds(object)))
            .map(object => ({ kind: 'paint', id: object.id }));
          if (this.selectionMode === 'combined') {
            refs.push(...(this.sprites?.items(gesture.tableId) ?? [])
              .filter(sprite => intersectsSelection(bounds, sprite.bounds))
              .map(sprite => ({ kind: 'sprite' as const, id: sprite.id })));
          }
          this.selection.replace([...gesture.base, ...refs]);
          this.syncSelection();
          const rectangle = createPaintDraft('rectangle', '00000000-0000-4000-8000-000000000001',
            gesture.start, point, [], { stroke_rgba: [0.1, 0.8, 1, 1], width: 1, fill_rgba: [0.1, 0.8, 1, 0.08] });
          this.runtime.setPaintDraft(gesture.tableId, 'selection-marquee', rectangle);
          this.emit();
          continue;
        }
        if (gesture.kind === 'group') {
          const dx = point.x - gesture.start.x;
          const dy = point.y - gesture.start.y;
          gesture.changed = dx !== 0 || dy !== 0;
          for (const object of gesture.paints) {
            const draft = editableObject(object);
            draft.transform.x += dx;
            draft.transform.y += dy;
            assertPaintObjectInput(draft);
            this.runtime.setPaintDraft(gesture.tableId, `selection:${object.id}`, draft);
          }
          for (const sprite of gesture.sprites) this.sprites?.preview(sprite.id, sprite.x + dx, sprite.y + dy);
          continue;
        }
        if (gesture.kind === 'create') {
          if (gesture.draft.kind === 'freehand') {
            const previous = gesture.samples.at(-1)!;
            if (previous.x !== point.x || previous.y !== point.y || previous.pressure !== point.pressure) {
              if (gesture.samples.length >= MAX_GESTURE_SAMPLES) {
                throw new PaintValidationError('Drawing exceeds the 32,768-sample gesture limit. Draw shorter paths.');
              }
              gesture.samples.push(point);
            }
          }
        } else if (gesture.kind === 'move') {
          const replacement = editableObject(gesture.original);
          replacement.transform.x += point.x - gesture.start.x;
          replacement.transform.y += point.y - gesture.start.y;
          gesture.changed = gesture.changed
            || point.x !== gesture.start.x
            || point.y !== gesture.start.y;
          gesture.draft = replacement;
        } else {
          gesture.changed = gesture.changed
            || point.x !== gesture.start.x
            || point.y !== gesture.start.y;
          gesture.draft = gesture.handle === 'rotate'
            ? rotatePaintObject(gesture.original, gesture.start, point, event.shiftKey)
            : resizePaintObject(gesture.original, gesture.handle, point);
        }
      }
      if (gesture.kind === 'create') {
        const points = gesture.draft.kind === 'freehand'
          ? compactFreehandPoints(gesture.samples, Math.max(this.style.width * 0.1, 0.25))
          : gesture.samples;
        gesture.draft = createPaintDraft(
          this.tool as Exclude<PaintTool, 'select' | 'delete'>,
          gesture.objectId, gesture.start, gesture.current, points, this.style,
        );
      }
      if (gesture.kind !== 'marquee' && gesture.kind !== 'group') this.publishDraft(gesture.tableId, gesture.draft);
    } catch (error) {
      this.handleGestureError(error);
    }
    event.preventDefault();
  };

  readonly handlePointerUp = (event: PointerEvent): void => {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    try {
      this.handlePointerMove(event);
      if (this.gesture !== gesture) return;
      if (gesture.kind === 'create') {
        if (gesture.draft.kind === 'freehand') {
          const compacted = compactFreehandPoints(
            gesture.samples,
            Math.max(this.style.width * 0.1, 0.25),
          );
          gesture.draft = createPaintDraft(
            'draw',
            gesture.objectId,
            gesture.start,
            gesture.current,
            compacted,
            this.style,
          );
        }
        this.scene.submitCreate(gesture.draft);
      } else if (gesture.kind === 'group' && gesture.changed) {
        const dx = gesture.current.x - gesture.start.x;
        const dy = gesture.current.y - gesture.start.y;
        // Commands remain individually authorized. No durable group is created.
        for (const original of gesture.paints) {
          const replacement = editableObject(original);
          replacement.transform.x += dx;
          replacement.transform.y += dy;
          this.scene.submitUpdate(original.id, original.version, replacement);
        }
        for (const original of gesture.sprites) this.sprites?.move(gesture.tableId, original.id, original.x + dx, original.y + dy);
      } else if (gesture.kind !== 'marquee' && gesture.kind !== 'group' && gesture.changed) {
        this.scene.submitUpdate(
          gesture.original.id,
          gesture.original.version,
          gesture.draft,
        );
      }
    } catch (error) {
      this.handleGestureError(error);
    } finally {
      this.finishGesture();
      event.preventDefault();
    }
  };

  readonly handlePointerCancel = (event: PointerEvent): void => {
    if (this.gesture?.pointerId === event.pointerId) this.cancelGesture();
  };

  readonly handleLostPointerCapture = (event: PointerEvent): void => {
    if (this.gesture?.pointerId === event.pointerId) this.cancelGesture();
  };

  readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled || isEditableTarget(event.target)) return;
    if (event.key === 'Escape') {
      this.cancelGesture();
      this.clearSelection();
      this.emit();
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && this.selection.items.length) {
      if (this.deleteSelected()) event.preventDefault();
    }
  };

  private selectedObject(): PaintObject | null {
    return this.selectedId
      ? this.sceneState.committed.find(object => object.id === this.selectedId) ?? null
      : null;
  }

  private paintIds(): string[] { return this.selection.items.filter(ref => ref.kind === 'paint').map(ref => ref.id); }
  private spriteIds(): string[] { return this.selection.items.filter(ref => ref.kind === 'sprite').map(ref => ref.id); }
  private selectedPaints(): PaintObject[] { return this.sceneState.committed.filter(object => this.paintIds().includes(object.id)); }
  private selectedSprites(): SelectionSprite[] {
    return this.sceneState.tableId ? (this.sprites?.items(this.sceneState.tableId) ?? []).filter(sprite => this.spriteIds().includes(sprite.id)) : [];
  }
  private syncSelection(): void {
    const paints = this.paintIds();
    this.selectedId = paints[0] ?? null;
    if (paints.length > 1 && this.runtime.selectPaintObjects) this.runtime.selectPaintObjects(paints);
    else if (paints.length === 1) this.runtime.selectPaintObject(paints[0]);
    else this.runtime.clearPaintObjectSelection();
    if (this.selectionMode === 'combined') this.sprites?.select(this.spriteIds());
  }
  private clearSelection(): void {
    this.selection.clear();
    this.syncSelection();
  }

  private canEdit(object: PaintObject): boolean {
    return this.actorId !== null
      && (this.canManageOthers || object.created_by === this.actorId);
  }

  private capture(canvas: HTMLCanvasElement, pointerId: number): boolean {
    try {
      canvas.setPointerCapture(pointerId);
      return canvas.hasPointerCapture(pointerId);
    } catch {
      this.cancelGesture();
      return false;
    }
  }

  private worldPoint(event: PointerEvent, canvas: HTMLCanvasElement): PaintPoint | null {
    const engine = this.runtime.getRenderEngine();
    if (!engine) return null;
    const screen = getRelativeCoords(event, canvas);
    const [x, y] = engine.screen_to_world(screen.x, screen.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y, pressure: eventPressure(event) };
  }

  private publishDraft(tableId: string, draft: PaintObjectInput): void {
    try {
      assertPaintObjectInput(draft);
      this.runtime.setPaintDraft(tableId, LOCAL_DRAFT_KEY, draft);
      this.scene.queuePreview(draft);
    } catch (error) {
      this.handleGestureError(error);
    }
  }

  private handleGestureError(error: unknown): void {
    this.cancelGesture();
    if (!(error instanceof PaintValidationError)) throw error;
    this.scene.reportLocalError(error.message);
  }

  private cancelGesture(): void {
    if (!this.gesture) return;
    if (this.gesture.kind === 'marquee') {
      this.selection.replace(this.gesture.base);
      this.syncSelection();
    }
    this.finishGesture();
  }

  private finishGesture(): void {
    const gesture = this.gesture;
    if (!gesture) return;
    this.gesture = null;
    if (gesture.kind === 'group') {
      for (const object of gesture.paints) this.runtime.clearPaintDraft(`selection:${object.id}`);
      for (const sprite of gesture.sprites) this.sprites?.preview(sprite.id, sprite.x, sprite.y);
    }
    if (gesture.kind === 'marquee') this.runtime.clearPaintDraft('selection-marquee');
    else if (gesture.kind !== 'group') {
      this.runtime.clearPaintDraft(LOCAL_DRAFT_KEY);
      this.scene.cancelLocalPreview();
    }
    try {
      if (gesture?.canvas.hasPointerCapture(gesture.pointerId)) {
        gesture.canvas.releasePointerCapture(gesture.pointerId);
      }
    } catch {
      // Detached canvases and already-lost pointers must not interrupt cleanup.
    }
    if (gesture) this.emit();
  }

  private emit(): void {
    const state = this.getState();
    for (const listener of this.listeners) listener(state);
  }
}
