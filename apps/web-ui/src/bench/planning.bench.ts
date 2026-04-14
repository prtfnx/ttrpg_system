import { bench, describe } from 'vitest';

/**
 * Pure-JS micro-benchmarks for hot planning paths.
 * Run: pnpm --filter @ttrpg/web-ui bench
 */

// Mirrors planning.service.ts snapToCell (private fn)
function snapToCell(x: number, y: number, gridSize: number) {
  return {
    cx: Math.floor(x / gridSize) * gridSize + gridSize / 2,
    cy: Math.floor(y / gridSize) * gridSize + gridSize / 2,
  };
}

describe('snapToCell', () => {
  bench('64px grid', () => {
    snapToCell(347.8, 291.3, 64);
  });
  bench('32px grid', () => {
    snapToCell(347.8, 291.3, 32);
  });
});

// Throttle-map pattern from planning.service.ts lastCell
describe('lastCell Map throttle', () => {
  const lastCell = new Map<string, string>();

  bench('cache hit (skip)', () => {
    const key = 'sprite_1';
    const cell = '5,4';
    lastCell.set(key, cell);
    if (lastCell.get(key) === cell) return; // early exit
    lastCell.set(key, cell);
  });

  bench('cache miss (proceed)', () => {
    const key = `sprite_${Math.random()}`;
    const cell = '5,4';
    if (lastCell.get(key) === cell) return;
    lastCell.set(key, cell);
  });
});

// Geometry helpers
describe('distance calculations', () => {
  bench('euclidean', () => {
    const dx = 800 - 100;
    const dy = 600 - 50;
    void Math.sqrt(dx * dx + dy * dy);
  });

  bench('manhattan (cell count)', () => {
    const dx = Math.abs(Math.floor(800 / 64) - Math.floor(100 / 64));
    const dy = Math.abs(Math.floor(600 / 64) - Math.floor(50 / 64));
    void (dx + dy);
  });

  bench('chebyshev (5-10-5 diagonal)', () => {
    const dx = Math.abs(Math.floor(800 / 64) - Math.floor(100 / 64));
    const dy = Math.abs(Math.floor(600 / 64) - Math.floor(50 / 64));
    const diag = Math.min(dx, dy);
    const straight = Math.abs(dx - dy);
    void (diag * 1.5 + straight);
  });
});
