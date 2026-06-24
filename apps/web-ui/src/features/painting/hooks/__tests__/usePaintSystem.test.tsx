import { act, renderHook } from '@testing-library/react';
import type { RenderEngine } from '@lib/wasm/runtime';
import { ProtocolService } from '@lib/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePaintSystem } from '../usePaintSystem';

vi.mock('@/store', () => ({
  useGameStore: () => ({ activeTableId: 'table-1' }),
}));

vi.mock('@lib/api', () => ({
  ProtocolService: {
    hasProtocol: vi.fn(() => false),
    getProtocol: vi.fn(),
  },
}));

describe('usePaintSystem', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('applies brush presets through RenderEngine paint methods', () => {
    const renderEngine = {
      paint_set_current_table: vi.fn(),
      paint_set_brush_color: vi.fn(),
      paint_set_brush_width: vi.fn(),
      paint_set_blend_mode: vi.fn(),
      paint_get_strokes: vi.fn(() => []),
      paint_can_undo: vi.fn(() => false),
      paint_can_redo: vi.fn(() => false),
    } as unknown as RenderEngine;

    const { result, unmount } = renderHook(() => usePaintSystem(renderEngine));

    act(() => {
      result.current[1].applyBrushPreset({
        color: [1, 0.5, 0, 0.8],
        width: 8,
        blend_mode: 'Additive',
      });
    });

    expect(renderEngine.paint_set_brush_color).toHaveBeenCalledWith(1, 0.5, 0, 0.8);
    expect(renderEngine.paint_set_brush_width).toHaveBeenCalledWith(8);
    expect(renderEngine.paint_set_blend_mode).toHaveBeenCalledWith('additive');
    expect(result.current[0].brushColor).toEqual([1, 0.5, 0, 0.8]);
    expect(result.current[0].brushWidth).toBe(8);
    expect(result.current[0].blendMode).toBe('additive');

    unmount();
  });

  it('recreates a redone stroke through the protocol', () => {
    const createPaintStroke = vi.fn();
    vi.mocked(ProtocolService.hasProtocol).mockReturnValue(true);
    vi.mocked(ProtocolService.getProtocol).mockReturnValue({ createPaintStroke } as never);

    const redoneStroke = { id: 'stroke-1', points: [{ x: 10, y: 20 }] };
    const renderEngine = {
      paint_set_current_table: vi.fn(),
      paint_get_strokes: vi.fn(() => [redoneStroke]),
      paint_can_undo: vi.fn(() => true),
      paint_can_redo: vi.fn(() => true),
      paint_redo_stroke: vi.fn(() => true),
    } as unknown as RenderEngine;

    const { result } = renderHook(() => usePaintSystem(renderEngine));

    act(() => {
      expect(result.current[1].redoStroke()).toBe(true);
    });

    expect(createPaintStroke).toHaveBeenCalledWith('stroke-1', JSON.stringify(redoneStroke));
  });
});
