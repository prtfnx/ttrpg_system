import { useGameStore } from '@/store';
import type { DistanceUnit } from '@/utils/unitConverter';
import { ProtocolService } from '@lib/api';
import { useWasmRuntime } from '@lib/wasm/runtime';
import clsx from 'clsx';
import styles from './GridControls.module.css';

export function GridControls() {
  const runtime = useWasmRuntime();
  const { 
    gridEnabled, 
    gridSnapping, 
    gridSize,
    gridCellPx,
    cellDistance,
    distanceUnit,
    activeTableId,
    setGridEnabled, 
    setGridSnapping, 
    setGridSize,
    setTableUnits,
  } = useGameStore();

  const pixelsPerUnit = gridCellPx / cellDistance;

  const handleGridToggle = () => {
    const newEnabled = !gridEnabled;
    setGridEnabled(newEnabled);
    runtime.setGridEnabled(newEnabled);
  };

  const handleSnapToggle = () => {
    const newSnapping = !gridSnapping;
    setGridSnapping(newSnapping);
    runtime.setGridSnapping(newSnapping);
  };

  const handleSizeChange = (newSize: number) => {
    setGridSize(newSize);
    runtime.setGridSize(newSize);
    applyUnits(newSize, cellDistance, distanceUnit);
  };

  const handleDistanceChange = (newDistance: number) => {
    const valid = Math.max(0.5, newDistance);
    applyUnits(gridCellPx, valid, distanceUnit);
  };

  const handleUnitChange = (newUnit: DistanceUnit) => {
    applyUnits(gridCellPx, cellDistance, newUnit);
  };

  const applyUnits = (cellPx: number, dist: number, unit: DistanceUnit) => {
    setTableUnits({ gridCellPx: cellPx, cellDistance: dist, distanceUnit: unit });
    if (activeTableId && ProtocolService.hasProtocol()) {
      ProtocolService.getProtocol().sendTableSettingsUpdate(activeTableId, {
        grid_cell_px: cellPx,
        cell_distance: dist,
        distance_unit: unit,
      });
    }
  };

  return (
    <section className={styles.gridControls}>
      <h3 className={styles.title}>Grid Controls</h3>
      
      <div className={styles.formContainer}>
        <label className={styles.checkboxLabel}>
          <input type="checkbox" checked={gridEnabled} onChange={handleGridToggle} />
          Show Grid
        </label>
        <label className={styles.checkboxLabel}>
          <input type="checkbox" checked={gridSnapping} onChange={handleSnapToggle} />
          Snap to Grid
        </label>

        <div className={styles.formGroup}>
          <label className={styles.formLabel} htmlFor="grid-cell-size">Cell size: {gridSize}px</label>
          <input
            id="grid-cell-size"
            type="range"
            min="20"
            max="200"
            step="5"
            value={gridSize}
            onChange={(e) => handleSizeChange(Number(e.target.value))}
            className={styles.rangeInput}
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel} htmlFor="grid-cell-distance">Distance per cell</label>
          <div className={styles.distanceRow}>
            <input
              id="grid-cell-distance"
              type="number"
              min="0.5"
              step="0.5"
              value={cellDistance}
              onChange={(e) => handleDistanceChange(parseFloat(e.target.value) || 5)}
              className={styles.distanceInput}
            />
            <div className={styles.unitToggle}>
              {(['ft', 'm'] as DistanceUnit[]).map(u => (
                <button
                  type="button"
                  key={u}
                  onClick={() => handleUnitChange(u)}
                  className={clsx(styles.unitButton, distanceUnit === u && styles.active)}
                  aria-pressed={distanceUnit === u}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.summary}>
          {pixelsPerUnit.toFixed(1)} px/{distanceUnit} · 1 cell = {cellDistance} {distanceUnit}
        </div>
      </div>
    </section>
  );
}
