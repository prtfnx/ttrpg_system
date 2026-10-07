import { describe, expect, it } from 'vitest';
import { SelectionManager, intersectsSelection, selectionRectangle } from '../SelectionManager';

describe('namespaced local selection', () => {
  it('keeps colliding sprite and paint IDs independent', () => {
    const selection = new SelectionManager();
    selection.replace([{ kind: 'paint', id: 'same' }, { kind: 'sprite', id: 'same' }]);
    selection.click({ kind: 'paint', id: 'same' }, true);
    expect(selection.items).toEqual([{ kind: 'sprite', id: 'same' }]);
  });

  it('preserves a group when clicking a member without modifiers', () => {
    const selection = new SelectionManager();
    selection.replace([{ kind: 'paint', id: 'a' }, { kind: 'paint', id: 'b' }]);
    selection.click({ kind: 'paint', id: 'a' }, false);
    expect(selection.items).toHaveLength(2);
    selection.retain(ref => ref.id !== 'a');
    expect(selection.items).toEqual([{ kind: 'paint', id: 'b' }]);
    selection.clear();
    expect(selection.items).toEqual([]);
  });

  it('normalizes either drag direction and includes intersecting boundaries', () => {
    expect(selectionRectangle({ x: 20, y: 30 }, { x: 0, y: 10 })).toEqual([0, 10, 20, 30]);
    expect(intersectsSelection([0, 0, 20, 30], [20, 30, 40, 40])).toBe(true);
    expect(intersectsSelection([0, 0, 20, 30], [21, 30, 40, 40])).toBe(false);
  });
});
