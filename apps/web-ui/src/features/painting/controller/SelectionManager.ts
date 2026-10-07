/** Local editor references; never a persistent multiplayer group entity. */
export type SelectionMode = 'separate' | 'combined';
export type SelectionRef = { kind: 'paint' | 'sprite'; id: string };
export type SelectionBounds = readonly [number, number, number, number];

function key(ref: SelectionRef): string { return `${ref.kind}:${ref.id}`; }

export class SelectionManager {
  private refs = new Map<string, SelectionRef>();

  get items(): readonly SelectionRef[] { return [...this.refs.values()]; }
  has(ref: SelectionRef): boolean { return this.refs.has(key(ref)); }
  clear(): void { this.refs.clear(); }

  replace(refs: readonly SelectionRef[]): void {
    this.refs = new Map(refs.map(ref => [key(ref), { ...ref }]));
  }

  click(ref: SelectionRef, additive: boolean): void {
    if (additive) {
      if (this.has(ref)) this.refs.delete(key(ref));
      else this.refs.set(key(ref), { ...ref });
    } else if (!this.has(ref)) this.replace([ref]);
  }

  retain(predicate: (ref: SelectionRef) => boolean): void {
    for (const [id, ref] of this.refs) if (!predicate(ref)) this.refs.delete(id);
  }
}

export function intersectsSelection(a: SelectionBounds, b: SelectionBounds): boolean {
  return a[2] >= b[0] && a[0] <= b[2] && a[3] >= b[1] && a[1] <= b[3];
}

export function selectionRectangle(start: { x: number; y: number }, end: { x: number; y: number }): SelectionBounds {
  return [Math.min(start.x, end.x), Math.min(start.y, end.y), Math.max(start.x, end.x), Math.max(start.y, end.y)];
}
