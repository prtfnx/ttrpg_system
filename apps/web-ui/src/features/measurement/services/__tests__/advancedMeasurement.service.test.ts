import { advancedMeasurementSystem } from '../advancedMeasurement.service';

// Fresh state before each test via dispose
beforeEach(() => {
  advancedMeasurementSystem.dispose();
});

describe('advancedMeasurementSystem', () => {
  describe('startMeasurement', () => {
    it('returns a string ID', () => {
      const id = advancedMeasurementSystem.startMeasurement({ x: 0, y: 0 });
      expect(typeof id).toBe('string');
      expect(id).toMatch(/^measurement_/);
    });

    it('measurement is retrievable via getMeasurements()', () => {
      const id = advancedMeasurementSystem.startMeasurement({ x: 10, y: 20 });
      const measurements = advancedMeasurementSystem.getMeasurements();
      const found = measurements.find(m => m.id === id);
      expect(found).toBeDefined();
      expect(found!.start.x).toBe(10);
      expect(found!.start.y).toBe(20);
    });

    it('fires measurementStarted callback', () => {
      const cb = vi.fn();
      advancedMeasurementSystem.subscribe('test', cb);
      advancedMeasurementSystem.startMeasurement({ x: 0, y: 0 });
      expect(cb).toHaveBeenCalledWith('measurementStarted', expect.objectContaining({ measurement: expect.any(Object) }));
      advancedMeasurementSystem.unsubscribe('test');
    });

    it('accepts custom options (color, persistent)', () => {
      const id = advancedMeasurementSystem.startMeasurement({ x: 0, y: 0 }, { color: '#ff0000', persistent: true });
      const measurements = advancedMeasurementSystem.getMeasurements();
      const m = measurements.find(m => m.id === id);
      expect(m!.color).toBe('#ff0000');
      expect(m!.persistent).toBe(true);
    });
  });

  describe('updateMeasurement', () => {
    it('updates distance correctly (Pythagorean triple 3/4/5)', () => {
      const id = advancedMeasurementSystem.startMeasurement({ x: 0, y: 0 });
      advancedMeasurementSystem.updateMeasurement(id, { x: 30, y: 40 });
      const m = advancedMeasurementSystem.getMeasurements().find(m => m.id === id)!;
      expect(m.distance).toBeCloseTo(50, 5);
    });

    it('angle: pointing right → 0 degrees', () => {
      const id = advancedMeasurementSystem.startMeasurement({ x: 0, y: 0 });
      advancedMeasurementSystem.updateMeasurement(id, { x: 100, y: 0 });
      const m = advancedMeasurementSystem.getMeasurements().find(m => m.id === id)!;
      expect(m.angle).toBeCloseTo(0, 1);
    });

    it('angle: pointing down → 90 degrees', () => {
      const id = advancedMeasurementSystem.startMeasurement({ x: 0, y: 0 });
      advancedMeasurementSystem.updateMeasurement(id, { x: 0, y: 100 });
      const m = advancedMeasurementSystem.getMeasurements().find(m => m.id === id)!;
      expect(m.angle).toBeCloseTo(90, 1);
    });

    it('unknown ID is a no-op (does not throw)', () => {
      expect(() => {
        advancedMeasurementSystem.updateMeasurement('non_existent', { x: 50, y: 50 });
      }).not.toThrow();
    });

    it('zero distance (same start and end)', () => {
      const id = advancedMeasurementSystem.startMeasurement({ x: 5, y: 5 });
      advancedMeasurementSystem.updateMeasurement(id, { x: 5, y: 5 });
      const m = advancedMeasurementSystem.getMeasurements().find(m => m.id === id)!;
      expect(m.distance).toBe(0);
    });
  });

  describe('completeMeasurement', () => {
    it('returns the measurement object', () => {
      const id = advancedMeasurementSystem.startMeasurement({ x: 0, y: 0 });
      advancedMeasurementSystem.updateMeasurement(id, { x: 50, y: 0 });
      const result = advancedMeasurementSystem.completeMeasurement(id);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(id);
    });

    it('returns null for unknown ID', () => {
      const result = advancedMeasurementSystem.completeMeasurement('no_such_id');
      expect(result).toBeNull();
    });
  });

  describe('cancelMeasurement', () => {
    it('removes measurement from getMeasurements()', () => {
      const id = advancedMeasurementSystem.startMeasurement({ x: 0, y: 0 });
      expect(advancedMeasurementSystem.getMeasurements()).toHaveLength(1);
      advancedMeasurementSystem.cancelMeasurement(id);
      expect(advancedMeasurementSystem.getMeasurements()).toHaveLength(0);
    });

    it('fires measurementCancelled callback', () => {
      const cb = vi.fn();
      advancedMeasurementSystem.subscribe('test', cb);
      const id = advancedMeasurementSystem.startMeasurement({ x: 0, y: 0 });
      cb.mockClear();
      advancedMeasurementSystem.cancelMeasurement(id);
      expect(cb).toHaveBeenCalledWith('measurementCancelled', expect.objectContaining({ measurementId: id }));
      advancedMeasurementSystem.unsubscribe('test');
    });

    it('no-op for unknown ID', () => {
      expect(() => advancedMeasurementSystem.cancelMeasurement('unknown')).not.toThrow();
    });
  });

  describe('clearMeasurements', () => {
    it('clearMeasurements(false) removes non-persistent measurements', () => {
      advancedMeasurementSystem.startMeasurement({ x: 0, y: 0 }); // non-persistent
      advancedMeasurementSystem.startMeasurement({ x: 0, y: 0 }, { persistent: true }); // persistent
      advancedMeasurementSystem.clearMeasurements(false);
      const remaining = advancedMeasurementSystem.getMeasurements();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].persistent).toBe(true);
    });

    it('clearMeasurements(true) removes all including persistent', () => {
      advancedMeasurementSystem.startMeasurement({ x: 0, y: 0 }, { persistent: true });
      advancedMeasurementSystem.startMeasurement({ x: 10, y: 10 }, { persistent: false });
      advancedMeasurementSystem.clearMeasurements(true);
      expect(advancedMeasurementSystem.getMeasurements()).toHaveLength(0);
    });
  });

  describe('calculateDistance', () => {
    it('Pythagorean triple: (0,0) → (3,4) = 5', () => {
      expect(advancedMeasurementSystem.calculateDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5, 5);
    });

    it('same point returns 0', () => {
      expect(advancedMeasurementSystem.calculateDistance({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
    });

    it('works with negative coordinates', () => {
      expect(advancedMeasurementSystem.calculateDistance({ x: -3, y: 0 }, { x: 0, y: 4 })).toBeCloseTo(5, 5);
    });

    it('large distances', () => {
      expect(advancedMeasurementSystem.calculateDistance({ x: 0, y: 0 }, { x: 1000, y: 0 })).toBeCloseTo(1000, 3);
    });
  });

  describe('calculateAngle', () => {
    it('right (1,0) → 0 degrees', () => {
      expect(advancedMeasurementSystem.calculateAngle({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(0, 1);
    });

    it('down (0,1) → 90 degrees', () => {
      expect(advancedMeasurementSystem.calculateAngle({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90, 1);
    });

    it('left (-1,0) → 180 degrees', () => {
      expect(advancedMeasurementSystem.calculateAngle({ x: 0, y: 0 }, { x: -1, y: 0 })).toBeCloseTo(180, 1);
    });

    it('negative angle normalized to [0, 360)', () => {
      const angle = advancedMeasurementSystem.calculateAngle({ x: 0, y: 0 }, { x: 0, y: -1 });
      expect(angle).toBeGreaterThanOrEqual(0);
      expect(angle).toBeLessThan(360);
    });
  });

  describe('subscribe / unsubscribe', () => {
    it('callback is called on measurement start', () => {
      const cb = vi.fn();
      advancedMeasurementSystem.subscribe('listener', cb);
      advancedMeasurementSystem.startMeasurement({ x: 0, y: 0 });
      expect(cb).toHaveBeenCalledTimes(1);
      advancedMeasurementSystem.unsubscribe('listener');
    });

    it('unsubscribed callback no longer fires', () => {
      const cb = vi.fn();
      advancedMeasurementSystem.subscribe('listener', cb);
      advancedMeasurementSystem.unsubscribe('listener');
      advancedMeasurementSystem.startMeasurement({ x: 0, y: 0 });
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('formatDistance', () => {
    it('formats feet correctly', () => {
      advancedMeasurementSystem.updateSettings({ defaultUnit: 'feet', precision: 1 });
      expect(advancedMeasurementSystem.formatDistance(30)).toBe('30.0 ft');
    });

    it('formats meters correctly', () => {
      advancedMeasurementSystem.updateSettings({ defaultUnit: 'meters', precision: 0 });
      expect(advancedMeasurementSystem.formatDistance(9)).toBe('9 m');
    });
  });

  describe('findNearbyPoints', () => {
    it('returns points within radius', () => {
      const id = advancedMeasurementSystem.startMeasurement({ x: 0, y: 0 });
      advancedMeasurementSystem.updateMeasurement(id, { x: 5, y: 0 });
      const nearby = advancedMeasurementSystem.findNearbyPoints({ x: 0, y: 0 }, 10);
      expect(nearby.length).toBeGreaterThan(0);
    });
  });

  describe('exportData', () => {
    it('returns valid JSON', () => {
      expect(() => JSON.parse(advancedMeasurementSystem.exportData())).not.toThrow();
    });

    it('exported JSON contains version and measurements keys', () => {
      const data = JSON.parse(advancedMeasurementSystem.exportData());
      expect(data).toHaveProperty('version');
      expect(data).toHaveProperty('measurements');
    });
  });
});
