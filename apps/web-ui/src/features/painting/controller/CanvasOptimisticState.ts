import type { Sprite } from '@/types';
import type { PaintObject } from '../model/paintObject';
import type { CanvasIntent, SpriteExpectedTransform } from './CanvasCommandController';
import { mapSelectionPoint, transformSelectionPaint, transformSelectionSprite } from './selectionTransforms';

function expected(sprite: Sprite): SpriteExpectedTransform {
  return { x: sprite.x, y: sprite.y, width: sprite.width ?? 50, height: sprite.height ?? 50,
    scale_x: sprite.scale.x, scale_y: sprite.scale.y, rotation: sprite.rotation };
}
export type SpritePatchIntent = { mode: 'local_patch'; members: readonly { kind: 'sprite'; id: string; expected: SpriteExpectedTransform }[]; patch: Partial<Sprite> };
type LocalIntent = CanvasIntent | SpritePatchIntent;

/** Authoritative per-object baselines with replayable local editor intent. */
export class CanvasOptimisticState {
  private sprites = new Map<string, Sprite | null>();
  private paints = new Map<string, PaintObject | null>();
  private pending = new Map<string, { intent: LocalIntent; confirmed: Set<string> }>();
  private readonly port: {
    readSprite(id: string): Sprite | undefined;
    readPaint(id: string): PaintObject | undefined;
    readCanonicalPaint?(id: string): PaintObject | undefined;
    renderSprite(id: string, sprite: Sprite | null): void;
    renderPaints(objects: ReadonlyMap<string, PaintObject | null>): void;
  };

  constructor(port: CanvasOptimisticState['port']) { this.port = port; }

  stage(id: string, intent: LocalIntent): void {
    if ('members' in intent) for (const member of intent.members) {
      if (member.kind === 'sprite' && !this.sprites.has(member.id)) {
        this.sprites.set(member.id, structuredClone(this.port.readSprite(member.id) ?? null));
      }
      if (member.kind === 'paint' && !this.paints.has(member.id)) {
        this.paints.set(member.id, structuredClone(this.port.readPaint(member.id) ?? null));
      }
    }
    this.pending.set(id, { intent: structuredClone(intent), confirmed: new Set() });
    this.render();
  }

  rebase(intent: CanvasIntent): CanvasIntent {
    if (!('members' in intent)) return intent;
    return { ...intent, members: intent.members.map(member => {
      if (member.kind === 'sprite') {
        const sprite = this.sprites.get(member.id);
        return sprite ? { ...member, expected: expected(sprite) } : member;
      }
      const paint = this.paints.get(member.id);
      return paint ? { ...member, version: paint.version } : member;
    }) } as CanvasIntent;
  }

  hasPendingPaint(id: string): boolean {
    return [...this.pending.values()].some(({ intent, confirmed }) => 'members' in intent
      && intent.mode !== 'copy' && !confirmed.has(`paint:${id}`)
      && intent.members.some(member => member.kind === 'paint' && member.id === id));
  }

  canonical(operationId: string | undefined, kind: 'sprite' | 'paint', id: string, object: Sprite | PaintObject | null): void {
    const bases = kind === 'sprite' ? this.sprites : this.paints;
    if (!bases.has(id)) return;
    if (kind === 'sprite') this.sprites.set(id, object as Sprite | null);
    else this.paints.set(id, object as PaintObject | null);
    if (operationId) this.pending.get(operationId)?.confirmed.add(`${kind}:${id}`);
    this.render();
  }

  settle(id: string, accepted: boolean): void {
    const entry = this.pending.get(id);
    if (!entry) return;
    // A replay receipt may omit canonical events. Its success still advances
    // the local baseline; the accompanying resync reconciles exact server data.
    if (accepted) this.project(entry.intent, entry.confirmed, this.sprites, this.paints);
    this.pending.delete(id);
    this.render();
    if (!this.pending.size) {
      this.sprites.clear(); this.paints.clear();
      this.port.renderPaints(new Map());
    }
  }

  reset(): void {
    this.pending.clear();
    this.render();
    this.sprites.clear(); this.paints.clear();
    this.port.renderPaints(new Map());
  }

  resolveSnapshot(ids: readonly string[]): void {
    for (const id of ids) this.pending.delete(id);
    for (const id of this.sprites.keys()) this.sprites.set(id, structuredClone(this.port.readSprite(id) ?? null));
    for (const id of this.paints.keys()) this.paints.set(id,
      structuredClone((this.port.readCanonicalPaint ?? this.port.readPaint)(id) ?? null));
    this.render();
    if (!this.pending.size) {
      this.sprites.clear(); this.paints.clear();
      this.port.renderPaints(new Map());
    }
  }

  private render(): void {
    const sprites = new Map(this.sprites), paints = new Map(this.paints);
    for (const entry of this.pending.values()) this.project(entry.intent, entry.confirmed, sprites, paints);
    for (const [id, sprite] of sprites) this.port.renderSprite(id, sprite);
    this.port.renderPaints(paints);
  }

  private project(intent: LocalIntent, confirmed: ReadonlySet<string>, sprites: Map<string, Sprite | null>, paints: Map<string, PaintObject | null>): void {
    if (!('members' in intent) || intent.mode === 'copy') return;
    for (const member of intent.members) {
      if (confirmed.has(`${member.kind}:${member.id}`)) continue;
      if (intent.mode === 'delete' || intent.mode === 'cut') {
        if (member.kind === 'sprite') sprites.set(member.id, null);
        else paints.set(member.id, null);
        continue;
      }
      if (member.kind === 'paint') {
        const object = paints.get(member.id);
        if (!object) continue;
        if (intent.mode === 'transform') paints.set(member.id, { ...object, ...transformSelectionPaint(object, intent.transform) });
        if (intent.mode === 'restyle') paints.set(member.id, { ...object, style: structuredClone(intent.style) });
      } else {
        const object = sprites.get(member.id);
        if (!object) continue;
        if (intent.mode === 'transform') {
          const next = transformSelectionSprite(expected(object), intent.transform);
          sprites.set(member.id, { ...object, ...next, scale: { x: next.scale_x, y: next.scale_y },
            ...(object.worldVertices ? { worldVertices: object.worldVertices.map(([x, y]) => {
              const point = mapSelectionPoint({ x, y }, intent.transform); return [point.x, point.y] as const;
            }) } : {}) });
        }
        if (intent.mode === 'sprite_edit') {
          const next = { ...object, ...intent.edit };
          // World geometry is transformed by the renderer; authoritative events
          // replace these derived bounds after commit.
          sprites.set(member.id, next);
        }
        if (intent.mode === 'local_patch') sprites.set(member.id, { ...object, ...intent.patch });
      }
    }
  }
}
