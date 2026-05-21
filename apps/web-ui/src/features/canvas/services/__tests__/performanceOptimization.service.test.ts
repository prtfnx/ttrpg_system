import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CombatPerformanceOptimizer,
  combatOptimizer,
  performanceProfiler,
  performanceUtils,
} from '../performanceOptimization.service';

// Reset singleton profile between tests
function resetProfiler() {
  // Ensure no leftover profiling session
  (performanceProfiler as unknown as Record<string, unknown>)['currentProfile'] = null;
  (performanceProfiler as unknown as { activeTimers: Map<string, unknown> })['activeTimers'].clear();
  (performanceProfiler as unknown as { activeMetadata: Map<string, unknown> })['activeMetadata'].clear();
}

beforeEach(() => {
  vi.clearAllMocks();
  resetProfiler();
});

afterEach(() => {
  resetProfiler();
});

// ── PerformanceProfiler ───────────────────────────────────────────────────────

describe('PerformanceProfiler', () => {
  describe('startProfiling / endProfiling', () => {
    it('starts a profiling session with default id', () => {
      performanceProfiler.startProfiling();
      const metrics = performanceProfiler.getCurrentMetrics();
      expect(metrics).toEqual([]);
    });

    it('starts a profiling session with custom id', () => {
      performanceProfiler.startProfiling('my-session');
      const profile = performanceProfiler.endProfiling();
      expect(profile).not.toBeNull();
      expect(profile!.sessionId).toBe('my-session');
    });

    it('endProfiling returns null when no session is active', () => {
      const result = performanceProfiler.endProfiling();
      expect(result).toBeNull();
    });

    it('endProfiling clears the current session', () => {
      performanceProfiler.startProfiling();
      performanceProfiler.endProfiling();
      const profile = performanceProfiler.endProfiling();
      expect(profile).toBeNull();
    });
  });

  describe('startTimer / endTimer', () => {
    it('records a metric on endTimer', () => {
      performanceProfiler.startProfiling('t1');
      performanceProfiler.startTimer('op', 'calculation');
      const duration = performanceProfiler.endTimer('op');
      expect(duration).toBeGreaterThanOrEqual(0);
      const metrics = performanceProfiler.getCurrentMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0].name).toBe('op');
      expect(metrics[0].category).toBe('calculation');
    });

    it('returns 0 when endTimer is called without startProfiling', () => {
      const duration = performanceProfiler.endTimer('ghost');
      expect(duration).toBe(0);
    });

    it('returns 0 when endTimer is called for unknown timer name', () => {
      performanceProfiler.startProfiling();
      const duration = performanceProfiler.endTimer('nonexistent');
      expect(duration).toBe(0);
    });

    it('startTimer warns when no session is active', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      performanceProfiler.startTimer('op');
      expect(spy).toHaveBeenCalled();
    });

    it('records metric with metadata', () => {
      performanceProfiler.startProfiling();
      performanceProfiler.startTimer('with-meta', 'data', { key: 'value' });
      performanceProfiler.endTimer('with-meta');
      const metrics = performanceProfiler.getCurrentMetrics();
      expect(metrics[0].metadata).toEqual({ key: 'value' });
    });

    it('records multiple metrics in one session', () => {
      performanceProfiler.startProfiling();
      performanceProfiler.startTimer('a', 'state');
      performanceProfiler.endTimer('a');
      performanceProfiler.startTimer('b', 'rendering');
      performanceProfiler.endTimer('b');
      const metrics = performanceProfiler.getCurrentMetrics();
      expect(metrics).toHaveLength(2);
    });

    it('cleans up timer entries after endTimer', () => {
      performanceProfiler.startProfiling();
      performanceProfiler.startTimer('cleanup-test', 'calculation');
      performanceProfiler.endTimer('cleanup-test');
      const timers = (performanceProfiler as unknown as { activeTimers: Map<string, unknown> }).activeTimers;
      expect(timers.has('cleanup-test')).toBe(false);
    });
  });

  describe('timeFunction', () => {
    it('times a sync function and returns result', async () => {
      performanceProfiler.startProfiling();
      const { result, duration } = await performanceProfiler.timeFunction('fn', () => 42);
      expect(result).toBe(42);
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('times an async function', async () => {
      performanceProfiler.startProfiling();
      const { result } = await performanceProfiler.timeFunction('async-fn', async () => 'hello', 'network');
      expect(result).toBe('hello');
    });

    it('rethrows errors from the function', async () => {
      performanceProfiler.startProfiling();
      await expect(
        performanceProfiler.timeFunction('err-fn', () => { throw new Error('boom'); })
      ).rejects.toThrow('boom');
    });
  });

  describe('getCurrentMetrics', () => {
    it('returns empty array when no session is active', () => {
      expect(performanceProfiler.getCurrentMetrics()).toEqual([]);
    });

    it('returns empty array at start of session', () => {
      performanceProfiler.startProfiling();
      expect(performanceProfiler.getCurrentMetrics()).toEqual([]);
    });
  });

  describe('clearActiveTimers', () => {
    it('clears all active timers without throwing', () => {
      performanceProfiler.startProfiling();
      performanceProfiler.startTimer('x');
      performanceProfiler.clearActiveTimers();
      const timers = (performanceProfiler as unknown as { activeTimers: Map<string, unknown> }).activeTimers;
      expect(timers.size).toBe(0);
    });
  });

  describe('endProfiling with recommendations', () => {
    it('generates report with warnings for slow operations', () => {
      performanceProfiler.startProfiling('warn-session');
      // Directly push a slow metric to trigger warning
      const slowMetric = {
        name: 'slow-op',
        duration: 200,
        startTime: 0,
        endTime: 200,
        category: 'calculation' as const,
      };
      (performanceProfiler as unknown as { currentProfile: { metrics: unknown[]; warnings: string[]; recommendations: string[] } })
        .currentProfile!.metrics.push(slowMetric);
      const profile = performanceProfiler.endProfiling();
      expect(profile!.recommendations.some(r => r.includes('slow-op'))).toBe(true);
    });

    it('generates recommendation for slow rendering', () => {
      performanceProfiler.startProfiling();
      const renderMetric = {
        name: 'render-op',
        duration: 50,
        startTime: 0,
        endTime: 50,
        category: 'rendering' as const,
      };
      (performanceProfiler as unknown as { currentProfile: { metrics: unknown[]; warnings: string[]; recommendations: string[] } })
        .currentProfile!.metrics.push(renderMetric);
      const profile = performanceProfiler.endProfiling();
      expect(profile!.recommendations.some(r => r.includes('render-op'))).toBe(true);
    });

    it('generates recommendation for frequent state updates', () => {
      performanceProfiler.startProfiling();
      const cp = (performanceProfiler as unknown as { currentProfile: { metrics: unknown[]; warnings: string[]; recommendations: string[] } }).currentProfile!;
      for (let i = 0; i < 11; i++) {
        cp.metrics.push({ name: `state-${i}`, duration: 1, startTime: 0, endTime: 1, category: 'state' as const });
      }
      const profile = performanceProfiler.endProfiling();
      expect(profile!.recommendations.some(r => r.includes('batching'))).toBe(true);
    });

    it('generates recommendation for heavy data processing', () => {
      performanceProfiler.startProfiling();
      const cp = (performanceProfiler as unknown as { currentProfile: { metrics: unknown[]; warnings: string[]; recommendations: string[] } }).currentProfile!;
      cp.metrics.push({ name: 'data-proc', duration: 200, startTime: 0, endTime: 200, category: 'data' as const });
      const profile = performanceProfiler.endProfiling();
      expect(profile!.recommendations.some(r => r.includes('web workers'))).toBe(true);
    });
  });
});

// ── CombatPerformanceOptimizer ────────────────────────────────────────────────

describe('CombatPerformanceOptimizer', () => {
  beforeEach(() => {
    combatOptimizer.startCombatProfiling('test-combat');
  });

  afterEach(() => {
    combatOptimizer.endCombatProfiling();
  });

  describe('profileAbilityCalculations', () => {
    it('returns correct D&D ability modifiers', async () => {
      const { modifiers } = await combatOptimizer.profileAbilityCalculations({ str: 16, dex: 10, int: 14 });
      expect(modifiers.str).toBe(3);  // (16-10)/2 = 3
      expect(modifiers.dex).toBe(0);  // (10-10)/2 = 0
      expect(modifiers.int).toBe(2);  // (14-10)/2 = 2
    });

    it('returns a duration', async () => {
      const { duration } = await combatOptimizer.profileAbilityCalculations({ str: 10 });
      expect(duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('profileAttackRoll', () => {
    it('returns sum of abilityModifier + proficiency + weaponBonus', async () => {
      const { attackBonus } = await combatOptimizer.profileAttackRoll(3, 2, 1);
      expect(attackBonus).toBe(6);
    });

    it('defaults weaponBonus to 0', async () => {
      const { attackBonus } = await combatOptimizer.profileAttackRoll(2, 3);
      expect(attackBonus).toBe(5);
    });
  });

  describe('profileDamageCalculation', () => {
    it('sums dice and adds modifier', async () => {
      const { totalDamage } = await combatOptimizer.profileDamageCalculation([4, 3], 2);
      expect(totalDamage).toBe(9);  // 4+3+2 = 9
    });

    it('doubles dice on critical hit', async () => {
      const { totalDamage } = await combatOptimizer.profileDamageCalculation([5, 3], 0, true);
      expect(totalDamage).toBe(16);  // (5+3) + (5+3) + 0 = 16
    });
  });

  describe('profileInitiativeCalculation', () => {
    it('returns sorted initiative array', async () => {
      const chars = [{ name: 'Alice', dexterity: 16 }, { name: 'Bob', dexterity: 8 }];
      const { initiatives } = await combatOptimizer.profileInitiativeCalculation(chars);
      expect(initiatives).toHaveLength(2);
      expect(initiatives[0].initiative).toBeGreaterThanOrEqual(initiatives[1].initiative);
    });

    it('applies initiativeBonus correctly', async () => {
      const chars = [{ name: 'A', dexterity: 10, initiativeBonus: 5 }];
      const { initiatives } = await combatOptimizer.profileInitiativeCalculation(chars);
      // initiative = d20 roll (1-20) + 0 (dex mod) + 5 bonus -> min 6
      expect(initiatives[0].initiative).toBeGreaterThanOrEqual(6);
    });
  });

  describe('profileEquipmentWeight', () => {
    it('calculates total weight correctly', async () => {
      const equipment = [{ weight: 2, quantity: 3 }, { weight: 5, quantity: 1 }];
      const { totalWeight } = await combatOptimizer.profileEquipmentWeight(equipment);
      expect(totalWeight).toBe(11); // 2*3 + 5*1
    });

    it('returns 0 for empty equipment list', async () => {
      const { totalWeight } = await combatOptimizer.profileEquipmentWeight([]);
      expect(totalWeight).toBe(0);
    });
  });

  describe('profileSpellSlots', () => {
    it('returns spell slots for a wizard', async () => {
      const { spellSlots } = await combatOptimizer.profileSpellSlots(5, 'wizard');
      expect(Array.isArray(spellSlots)).toBe(true);
      expect(spellSlots.length).toBe(10);
    });

    it('returns all-zero spell slots for non-casters', async () => {
      const { spellSlots } = await combatOptimizer.profileSpellSlots(5, 'fighter');
      expect(spellSlots.every(s => s === 0)).toBe(true);
    });
  });

  describe('startCombatProfiling / endCombatProfiling', () => {
    it('endCombatProfiling returns a profile', () => {
      const freshOptimizer = new CombatPerformanceOptimizer();
      freshOptimizer.startCombatProfiling('my-combat');
      const profile = freshOptimizer.endCombatProfiling();
      expect(profile).not.toBeNull();
      expect(profile!.sessionId).toContain('my-combat');
    });

    it('getCurrentMetrics returns current session metrics', () => {
      const metrics = combatOptimizer.getCurrentMetrics();
      expect(Array.isArray(metrics)).toBe(true);
    });
  });
});

// ── performanceUtils ──────────────────────────────────────────────────────────

describe('performanceUtils', () => {
  describe('debounce', () => {
    it('delays function execution', async () => {
      vi.useFakeTimers();
      const fn = vi.fn();
      const debounced = performanceUtils.debounce(fn, 200);
      debounced();
      expect(fn).not.toHaveBeenCalled();
      vi.advanceTimersByTime(200);
      expect(fn).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });

    it('resets the timer on multiple calls', async () => {
      vi.useFakeTimers();
      const fn = vi.fn();
      const debounced = performanceUtils.debounce(fn, 100);
      debounced();
      debounced();
      debounced();
      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });
  });

  describe('throttle', () => {
    it('executes function immediately on first call', () => {
      vi.useFakeTimers();
      const fn = vi.fn();
      const throttled = performanceUtils.throttle(fn, 100);
      throttled();
      expect(fn).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });

    it('ignores subsequent calls within the throttle window', () => {
      vi.useFakeTimers();
      const fn = vi.fn();
      const throttled = performanceUtils.throttle(fn, 100);
      throttled();
      throttled();
      throttled();
      expect(fn).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });

    it('allows call after throttle window expires', () => {
      vi.useFakeTimers();
      const fn = vi.fn();
      const throttled = performanceUtils.throttle(fn, 100);
      throttled();
      vi.advanceTimersByTime(101);
      throttled();
      expect(fn).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });
  });

  describe('memoize', () => {
    it('returns cached result on second call with same args', () => {
      let callCount = 0;
      const expensiveFn = (n: number) => { callCount++; return n * 2; };
      const memoized = performanceUtils.memoize(expensiveFn);
      expect(memoized(5)).toBe(10);
      expect(memoized(5)).toBe(10);
      expect(callCount).toBe(1);
    });

    it('calls function again for different args', () => {
      let callCount = 0;
      const fn = (n: number) => { callCount++; return n; };
      const memoized = performanceUtils.memoize(fn);
      memoized(1);
      memoized(2);
      expect(callCount).toBe(2);
    });
  });

  describe('batchUpdates', () => {
    it('calls all update functions', () => {
      const a = vi.fn();
      const b = vi.fn();
      performanceUtils.batchUpdates([a, b]);
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
    });

    it('handles empty array without throwing', () => {
      expect(() => performanceUtils.batchUpdates([])).not.toThrow();
    });
  });
});
