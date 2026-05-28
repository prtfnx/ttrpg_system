import { describe, it, expect, vi } from 'vitest';
import type { WallData } from '@/store';
import {
  wallLineWidth,
  wallLineDash,
  doorIndicatorColor,
  drawDoorArc,
  drawDirectionChevron,
} from '../wallVisuals';

const makeWall = (overrides: Partial<WallData> = {}): WallData => ({
  wall_id: 'w1', table_id: 't1',
  x1: 0, y1: 0, x2: 100, y2: 0,
  wall_type: 'normal', blocks_movement: true, blocks_light: true,
  blocks_sight: true, blocks_sound: false,
  is_door: false, door_state: 'closed', is_secret: false, direction: 'both',
  ...overrides,
});

describe('wallLineWidth', () => {
  it('returns 3 for normal wall', () => {
    expect(wallLineWidth(makeWall({ wall_type: 'normal' }))).toBe(3);
  });
  it('returns 3 for door regardless of type', () => {
    expect(wallLineWidth(makeWall({ is_door: true, wall_type: 'invisible' }))).toBe(3);
  });
  it('returns 2 for terrain', () => {
    expect(wallLineWidth(makeWall({ wall_type: 'terrain' }))).toBe(2);
  });
  it('returns 2 for ethereal', () => {
    expect(wallLineWidth(makeWall({ wall_type: 'ethereal' }))).toBe(2);
  });
  it('returns 1 for invisible', () => {
    expect(wallLineWidth(makeWall({ wall_type: 'invisible' }))).toBe(1);
  });
  it('returns 1 for window', () => {
    expect(wallLineWidth(makeWall({ wall_type: 'window' }))).toBe(1);
  });
  it('returns 2 when wall is undefined', () => {
    expect(wallLineWidth(undefined)).toBe(2);
  });
});

describe('wallLineDash', () => {
  it('returns empty for normal', () => {
    expect(wallLineDash(makeWall({ wall_type: 'normal' }))).toEqual([]);
  });
  it('returns [6,4] for ethereal', () => {
    expect(wallLineDash(makeWall({ wall_type: 'ethereal' }))).toEqual([6, 4]);
  });
  it('returns [3,8] for invisible', () => {
    expect(wallLineDash(makeWall({ wall_type: 'invisible' }))).toEqual([3, 8]);
  });
  it('returns empty for window', () => {
    expect(wallLineDash(makeWall({ wall_type: 'window' }))).toEqual([]);
  });
  it('returns empty when undefined', () => {
    expect(wallLineDash(undefined)).toEqual([]);
  });
});

describe('doorIndicatorColor', () => {
  it('returns green for open', () => {
    expect(doorIndicatorColor('open')).toBe('#4ade80');
  });
  it('returns red for locked', () => {
    expect(doorIndicatorColor('locked')).toBe('#f87171');
  });
  it('returns orange for closed', () => {
    expect(doorIndicatorColor('closed')).toBe('#fb923c');
  });
});

// Canvas 2D mock helpers
const makeMockCtx = () => {
  const calls: string[] = [];
  const ctx = {
    save: vi.fn(() => calls.push('save')),
    restore: vi.fn(() => calls.push('restore')),
    translate: vi.fn(),
    rotate: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(() => calls.push('stroke')),
    setLineDash: vi.fn(),
    strokeStyle: '',
    lineWidth: 1,
    _calls: calls,
  };
  return ctx as unknown as CanvasRenderingContext2D & { _calls: string[] };
};

describe('drawDoorArc', () => {
  it('calls save, arc, stroke, restore', () => {
    const ctx = makeMockCtx();
    drawDoorArc(ctx, 0, 0, 100, 0, 'closed');
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.arc).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('uses correct door color', () => {
    const ctx = makeMockCtx();
    drawDoorArc(ctx, 0, 0, 100, 0, 'open');
    expect(ctx.strokeStyle).toBe('#4ade80');
  });

  it('resets dash before drawing', () => {
    const ctx = makeMockCtx();
    drawDoorArc(ctx, 0, 0, 100, 0, 'locked');
    expect(ctx.setLineDash).toHaveBeenCalledWith([]);
  });
});

describe('drawDirectionChevron', () => {
  it('does nothing for direction "both"', () => {
    const ctx = makeMockCtx();
    drawDirectionChevron(ctx, 0, 0, 100, 0, 'both', '#fff');
    expect(ctx.save).not.toHaveBeenCalled();
  });

  it('draws for direction "right"', () => {
    const ctx = makeMockCtx();
    drawDirectionChevron(ctx, 0, 0, 100, 0, 'right', '#fff');
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('draws for direction "left"', () => {
    const ctx = makeMockCtx();
    drawDirectionChevron(ctx, 0, 0, 100, 0, 'left', 'rgba(255,0,0,1)');
    expect(ctx.strokeStyle).toBe('rgba(255,0,0,1)');
  });

  it('resets dash to solid', () => {
    const ctx = makeMockCtx();
    drawDirectionChevron(ctx, 0, 0, 100, 0, 'left', '#fff');
    expect(ctx.setLineDash).toHaveBeenCalledWith([]);
  });
});
