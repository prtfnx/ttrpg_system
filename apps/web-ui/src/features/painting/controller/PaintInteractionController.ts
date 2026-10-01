import { getRelativeCoords } from '@features/canvas/components/GameCanvas/canvasUtils';
import type { RenderEngine } from '@lib/wasm/runtime';
import type { PaintControllerState } from './PaintController';
import type { PaintObject, PaintObjectInput, PaintPoint, PaintStyle } from '../model/paintObject';
import { compactFreehandPoints, createPaintDraft, type PaintTool } from './paintGeometry';

const LOCAL_DRAFT_KEY = 'local';
const HIT_TOLERANCE_PX = 6;

export interface PaintInteractionScene {
  getState(): PaintControllerState;
  subscribe(listener: (state: PaintControllerState) => void): () => void;
  submitCreate(object: PaintObjectInput): string | null;
  submitUpdate(objectId: string, expectedVersion: number, object: PaintObjectInput): string | null;
  submitDelete(objectId: string, expectedVersion: number): string | null;
  queuePreview(draft: PaintObjectInput): void;
  cancelLocalPreview(): void;
}

interface PaintInteractionRuntime {
  getRenderEngine(): Pick<RenderEngine, 'screen_to_world' | 'paint_hit_test_object'> | null;
  setPaintDraft(tableId: string, key: string, draft: PaintObjectInput): boolean;
  clearPaintDraft(key: string): boolean;
}

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

type Gesture = CreationGesture | MoveGesture;

export interface PaintInteractionState {
  enabled: boolean;
  tool: PaintTool;
  style: PaintStyle;
  gestureActive: boolean;
  selected: PaintObject | null;
  canEditSelected: boolean;
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
  private gesture: Gesture | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private previousTouchAction = '';
  private tableId: string | null = null;
  private sceneState: PaintControllerState;
  private readonly scene: PaintInteractionScene;
  private readonly runtime: PaintInteractionRuntime;
  private readonly listeners = new Set<(state: PaintInteractionState) => void>();
  private readonly unsubscribeScene: () => void;

  constructor(
    scene: PaintInteractionScene,
    runtime: PaintInteractionRuntime,
  ) {
    this.scene = scene;
    this.runtime = runtime;
    this.sceneState = scene.getState();
    this.tableId = this.sceneState.tableId;
    this.unsubscribeScene = scene.subscribe(state => {
      if (state.tableId !== this.tableId) {
        this.cancelGesture();
        this.selectedId = null;
        this.tableId = state.tableId;
      }
      this.sceneState = state;
      if (this.selectedId && !state.committed.some(object => object.id === this.selectedId)) {
        this.selectedId = null;
      }
      this.emit();
    });
  }

  dispose(): void {
    this.unbind();
    this.unsubscribeScene();
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
      tool: this.tool,
      style: structuredClone(this.style),
      gestureActive: this.gesture !== null,
      selected,
      canEditSelected: selected ? this.canEdit(selected) : false,
    };
  }

  setActor(actorId: number | null, canManageOthers: boolean): void {
    this.actorId = actorId;
    this.canManageOthers = canManageOthers;
    this.emit();
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) {
      this.cancelGesture();
      this.selectedId = null;
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
    if (!selected || !this.canEdit(selected) || !this.sceneState.tableId) return false;
    const replacement = editableObject(selected);
    replacement.style = structuredClone(style);
    return this.scene.submitUpdate(selected.id, selected.version, replacement) !== null;
  }

  deleteSelected(): boolean {
    const selected = this.selectedObject();
    if (!selected || !this.canEdit(selected)) return false;
    const operation = this.scene.submitDelete(selected.id, selected.version);
    if (!operation) return false;
    this.selectedId = null;
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
    if (!this.enabled || this.gesture || event.button !== 0 || !event.isPrimary) return;
    const canvas = this.canvas;
    const tableId = this.sceneState.tableId;
    if (!canvas || !tableId) return;
    const point = this.worldPoint(event, canvas);
    if (!point) return;

    if (this.tool === 'delete' || this.tool === 'select') {
      const objectId = this.runtime.getRenderEngine()?.paint_hit_test_object(
        point.x,
        point.y,
        HIT_TOLERANCE_PX,
      ) ?? null;
      this.selectedId = objectId;
      const selected = this.selectedObject();
      if (this.tool === 'delete') {
        this.deleteSelected();
        event.preventDefault();
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
    const draft = createPaintDraft(this.tool, objectId, point, point, [point], this.style);
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
    for (const sample of events) {
      const point = this.worldPoint(sample, gesture.canvas);
      if (!point) continue;
      gesture.current = point;
      if (gesture.kind === 'create') {
        if (gesture.draft.kind === 'freehand') gesture.samples.push(point);
        gesture.draft = createPaintDraft(
          this.tool as Exclude<PaintTool, 'select' | 'delete'>,
          gesture.objectId,
          gesture.start,
          point,
          gesture.samples,
          this.style,
        );
      } else {
        const replacement = editableObject(gesture.original);
        replacement.transform.x += point.x - gesture.start.x;
        replacement.transform.y += point.y - gesture.start.y;
        gesture.changed = gesture.changed
          || point.x !== gesture.start.x
          || point.y !== gesture.start.y;
        gesture.draft = replacement;
      }
    }
    this.publishDraft(gesture.tableId, gesture.draft);
    event.preventDefault();
  };

  readonly handlePointerUp = (event: PointerEvent): void => {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    this.handlePointerMove(event);
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
    } else if (gesture.changed) {
      this.scene.submitUpdate(
        gesture.original.id,
        gesture.original.version,
        gesture.draft,
      );
    }
    this.finishGesture(true);
    event.preventDefault();
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
      this.selectedId = null;
      this.emit();
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && this.selectedId) {
      if (this.deleteSelected()) event.preventDefault();
    }
  };

  private selectedObject(): PaintObject | null {
    return this.selectedId
      ? this.sceneState.committed.find(object => object.id === this.selectedId) ?? null
      : null;
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
    this.runtime.setPaintDraft(tableId, LOCAL_DRAFT_KEY, draft);
    this.scene.queuePreview(draft);
  }

  private cancelGesture(): void {
    if (!this.gesture) return;
    this.finishGesture(false);
  }

  private finishGesture(releaseCapture: boolean): void {
    const gesture = this.gesture;
    this.gesture = null;
    this.runtime.clearPaintDraft(LOCAL_DRAFT_KEY);
    this.scene.cancelLocalPreview();
    if (releaseCapture && gesture?.canvas.hasPointerCapture(gesture.pointerId)) {
      gesture.canvas.releasePointerCapture(gesture.pointerId);
    }
    if (gesture) this.emit();
  }

  private emit(): void {
    const state = this.getState();
    for (const listener of this.listeners) listener(state);
  }
}
