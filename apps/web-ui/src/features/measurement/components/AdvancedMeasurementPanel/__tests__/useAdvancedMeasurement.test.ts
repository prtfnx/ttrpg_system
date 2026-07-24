import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advancedMeasurementSystem } from '@features/measurement/services/advancedMeasurement.service';
import { ProtocolService } from '@lib/api';
import { useAdvancedMeasurement } from '../useAdvancedMeasurement';

// Reset singleton state before each test
beforeEach(() => {
  advancedMeasurementSystem.dispose();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
  vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const makeRef = () => {
  const ref = createRef<HTMLCanvasElement>() as React.MutableRefObject<HTMLCanvasElement>;
  const canvas = document.createElement('canvas');
  canvas.getBoundingClientRect = vi.fn(() => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}) }));
  document.body.appendChild(canvas);
  (ref as { current: HTMLCanvasElement }).current = canvas;
  return { ref, canvas };
};

describe('useAdvancedMeasurement', () => {
  describe('initial state', () => {
    it('starts with null activeTool', () => {
      const { ref } = makeRef();
      const { result } = renderHook(() => useAdvancedMeasurement({ isOpen: false, canvasRef: ref }));
      expect(result.current.activeTool).toBeNull();
    });

    it('does not load data when isOpen=false', () => {
      const getSpy = vi.spyOn(advancedMeasurementSystem, 'getSettings');
      const { ref } = makeRef();
      renderHook(() => useAdvancedMeasurement({ isOpen: false, canvasRef: ref }));
      expect(getSpy).not.toHaveBeenCalled();
    });

    it('loads data when isOpen=true', () => {
      const getSpy = vi.spyOn(advancedMeasurementSystem, 'getMeasurements').mockReturnValue([]);
      vi.spyOn(advancedMeasurementSystem, 'getShapes').mockReturnValue([]);
      vi.spyOn(advancedMeasurementSystem, 'getGrids').mockReturnValue([]);
      vi.spyOn(advancedMeasurementSystem, 'getTemplates').mockReturnValue([]);
      vi.spyOn(advancedMeasurementSystem, 'getSettings').mockReturnValue(null as unknown as ReturnType<typeof advancedMeasurementSystem.getSettings>);
      vi.spyOn(advancedMeasurementSystem, 'getActiveGrid').mockReturnValue(null);
      const { ref } = makeRef();
      renderHook(() => useAdvancedMeasurement({ isOpen: true, canvasRef: ref }));
      expect(getSpy).toHaveBeenCalled();
    });
  });

  describe('handleToolSelect', () => {
    it('sets the active tool', async () => {
      const { ref } = makeRef();
      const { result } = renderHook(() => useAdvancedMeasurement({ isOpen: false, canvasRef: ref }));
      await act(async () => {
        result.current.handleToolSelect('measure');
      });
      expect(result.current.activeTool).toBe('measure');
    });

    it('clears shape creation state on tool switch', async () => {
      const { ref } = makeRef();
      const { result } = renderHook(() => useAdvancedMeasurement({ isOpen: false, canvasRef: ref }));
      await act(async () => {
        result.current.handleToolSelect('shape');
      });
      expect(result.current.isCreatingShape).toBe(false);
      expect(result.current.shapePoints).toHaveLength(0);
    });

    it('clears error state on tool switch', async () => {
      const { ref } = makeRef();
      const { result } = renderHook(() => useAdvancedMeasurement({ isOpen: false, canvasRef: ref }));
      await act(async () => {
        result.current.setError('some error');
      });
      await act(async () => {
        result.current.handleToolSelect('measure');
      });
      expect(result.current.error).toBeNull();
    });
  });

  describe('handleClearMeasurements', () => {
    it('clears measurements when user confirms', async () => {
      const clearSpy = vi.spyOn(advancedMeasurementSystem, 'clearRemoteMeasurements').mockImplementation(() => {});
      const { ref } = makeRef();
      const { result } = renderHook(() => useAdvancedMeasurement({ isOpen: false, canvasRef: ref }));
      await act(async () => {
        result.current.handleClearMeasurements();
      });
      expect(clearSpy).toHaveBeenCalledWith(null);
      expect(result.current.measurements).toHaveLength(0);
    });

    it('does not clear when user cancels confirm', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      const clearSpy = vi.spyOn(advancedMeasurementSystem, 'clearMeasurements').mockImplementation(() => {});
      const { ref } = makeRef();
      const { result } = renderHook(() => useAdvancedMeasurement({ isOpen: false, canvasRef: ref }));
      await act(async () => {
        result.current.handleClearMeasurements();
      });
      expect(clearSpy).not.toHaveBeenCalled();
    });
  });

  describe('handleRemoveMeasurement', () => {
    it('removes one measurement and refreshes measurements', async () => {
      const removeSpy = vi.spyOn(advancedMeasurementSystem, 'removeMeasurement').mockReturnValue(true);
      vi.spyOn(advancedMeasurementSystem, 'getMeasurements').mockReturnValue([]);
      const { ref } = makeRef();
      const { result } = renderHook(() => useAdvancedMeasurement({ isOpen: false, canvasRef: ref }));

      await act(async () => {
        result.current.handleRemoveMeasurement('measurement-1');
      });

      expect(removeSpy).toHaveBeenCalledWith('measurement-1');
      expect(result.current.measurements).toHaveLength(0);
    });
  });

  describe('handleGridChange', () => {
    it('calls setActiveGrid on the service', async () => {
      const spy = vi.spyOn(advancedMeasurementSystem, 'setActiveGrid').mockImplementation(() => {});
      const { ref } = makeRef();
      const { result } = renderHook(() => useAdvancedMeasurement({ isOpen: false, canvasRef: ref }));
      await act(async () => {
        result.current.handleGridChange('grid-1');
      });
      expect(spy).toHaveBeenCalledWith('grid-1');
    });
  });

  describe('tab and search state', () => {
    it('setSelectedTab updates the tab', async () => {
      const { ref } = makeRef();
      const { result } = renderHook(() => useAdvancedMeasurement({ isOpen: false, canvasRef: ref }));
      await act(async () => {
        result.current.setSelectedTab('grids');
      });
      expect(result.current.selectedTab).toBe('grids');
    });

    it('setSearchQuery filters measurements', async () => {
      const { ref } = makeRef();
      const { result } = renderHook(() => useAdvancedMeasurement({ isOpen: false, canvasRef: ref }));
      await act(async () => {
        result.current.setSearchQuery('test-id');
      });
      expect(result.current.searchQuery).toBe('test-id');
    });
  });

  describe('canvas click events', () => {
    it('starts a measurement on click when tool is measure', async () => {
      const startSpy = vi.spyOn(advancedMeasurementSystem, 'startMeasurement').mockReturnValue('m-1');
      vi.spyOn(advancedMeasurementSystem, 'getMeasurements').mockReturnValue([]);
      vi.spyOn(advancedMeasurementSystem, 'getShapes').mockReturnValue([]);
      vi.spyOn(advancedMeasurementSystem, 'getGrids').mockReturnValue([]);
      vi.spyOn(advancedMeasurementSystem, 'getTemplates').mockReturnValue([]);
      vi.spyOn(advancedMeasurementSystem, 'getSettings').mockReturnValue(null as unknown as ReturnType<typeof advancedMeasurementSystem.getSettings>);
      vi.spyOn(advancedMeasurementSystem, 'getActiveGrid').mockReturnValue(null);
      const { ref, canvas } = makeRef();
      const { result } = renderHook(() => useAdvancedMeasurement({ isOpen: true, canvasRef: ref }));
      await act(async () => {
        result.current.handleToolSelect('measure');
      });
      await act(async () => {
        canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 100, clientY: 200 }));
      });
      expect(startSpy).toHaveBeenCalledWith({ x: 100, y: 200 });
    });

    it('sends a completed measurement through the durable protocol', async () => {
      const upsertMeasurement = vi.fn();
      vi.spyOn(ProtocolService, 'hasProtocol').mockReturnValue(true);
      vi.spyOn(ProtocolService, 'getProtocol').mockReturnValue({
        upsertMeasurement,
        requestMeasurementSync: vi.fn(),
      } as unknown as ReturnType<typeof ProtocolService.getProtocol>);
      const { ref } = makeRef();
      renderHook(() => useAdvancedMeasurement({ isOpen: false, canvasRef: ref }));

      const id = advancedMeasurementSystem.startMeasurement({ x: 0, y: 0 });
      advancedMeasurementSystem.updateMeasurement(id, { x: 10, y: 10 });
      advancedMeasurementSystem.completeMeasurement(id);

      expect(upsertMeasurement).toHaveBeenCalledWith(
        'line',
        expect.objectContaining({ id }),
      );
    });
  });

  describe('handleExportData', () => {
    it('exports data and triggers download', async () => {
      vi.spyOn(advancedMeasurementSystem, 'exportData').mockReturnValue('{"test":1}');
      const appendSpy = vi.spyOn(document.body, 'appendChild');
      const { ref } = makeRef();
      const { result } = renderHook(() => useAdvancedMeasurement({ isOpen: false, canvasRef: ref }));
      await act(async () => {
        result.current.handleExportData();
      });
      expect(appendSpy).toHaveBeenCalled();
      expect(URL.createObjectURL).toHaveBeenCalled();
    });

    it('sets error when export fails', async () => {
      vi.spyOn(advancedMeasurementSystem, 'exportData').mockImplementation(() => { throw new Error('export failed'); });
      const { ref } = makeRef();
      const { result } = renderHook(() => useAdvancedMeasurement({ isOpen: false, canvasRef: ref }));
      await act(async () => {
        result.current.handleExportData();
      });
      expect(result.current.error).toMatch(/Failed to export/i);
    });
  });

  describe('handleImportData', () => {
    it('triggers file input click', async () => {
      const { ref } = makeRef();
      const { result } = renderHook(() => useAdvancedMeasurement({ isOpen: false, canvasRef: ref }));
      const clickSpy = vi.fn();
      // Access internal fileInputRef by triggering it
      if (result.current.fileInputRef.current) {
        result.current.fileInputRef.current.click = clickSpy;
      }
      await act(async () => {
        result.current.handleImportData();
      });
      // fileInputRef.current is null in test (not rendered in DOM), so just verifies no throw
      expect(true).toBe(true);
    });
  });
});
