import { describe, expect, it, vi } from 'vitest';
import { nextCombatSequenceId } from '../combatSequence';

describe('combat command identity', () => {
  it('generates distinct safe integers without depending on the wall clock', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(123);
    try {
      const ids = Array.from({ length: 1000 }, () => nextCombatSequenceId());
      expect(ids.every((id) => Number.isSafeInteger(id) && id > 0)).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
    } finally {
      clock.mockRestore();
    }
  });

  it('does not restart a counter when the module is loaded again', async () => {
    const first = nextCombatSequenceId();
    vi.resetModules();
    const reloaded = await import('../combatSequence');
    expect(reloaded.nextCombatSequenceId()).not.toBe(first);
  });
});
