import { useGameStore } from '@/store';
import type { DistanceUnit } from '@/utils/unitConverter';
import { isDM } from '@features/session/types/roles';
import { ProtocolService } from '@lib/api';
import React from 'react';
import styles from './TableSettingsPanel.module.css';

export const TableSettingsPanel: React.FC = () => {
  const { gridCellPx, cellDistance, distanceUnit, activeTableId, sessionRole, setTableUnits } = useGameStore();

  if (!isDM(sessionRole)) return null;

  const pixelsPerUnit = gridCellPx / cellDistance;
  const widthUnits = 3000 / pixelsPerUnit;
  const heightUnits = 2000 / pixelsPerUnit;

  const apply = (cellPx: number, dist: number, unit: DistanceUnit) => {
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
    <div className={styles.panel}>
      <h4 className={styles.title}>Grid &amp; Coordinate System</h4>

      <div className={styles.field}>
        <label className={styles.label}>
          Cell size <span className={styles.labelValue}>{gridCellPx}px</span>
        </label>
        <input
          type="range"
          className={styles.slider}
          min="10" max="200" step="5"
          value={gridCellPx}
          onChange={(e) => apply(Number(e.target.value), cellDistance, distanceUnit)}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Distance / cell</label>
        <div className={styles.row}>
          <input
            type="number"
            className={styles.numberInput}
            min="0.5" step="0.5"
            value={cellDistance}
            onChange={(e) => apply(gridCellPx, Math.max(0.5, parseFloat(e.target.value) || 5), distanceUnit)}
          />
          <div className={styles.unitToggle}>
            {(['ft', 'm'] as DistanceUnit[]).map(u => (
              <button
                key={u}
                className={`${styles.unitBtn}${distanceUnit === u ? ` ${styles.active}` : ''}`}
                onClick={() => apply(gridCellPx, cellDistance, u)}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.infoBox}>
        <div>{pixelsPerUnit.toFixed(1)} px/{distanceUnit} · 1 cell = {cellDistance} {distanceUnit}</div>
        <div>≈ {widthUnits.toFixed(0)} × {heightUnits.toFixed(0)} {distanceUnit}</div>
        {distanceUnit === 'ft' && (
          <div>= {(widthUnits * 0.3048).toFixed(1)} × {(heightUnits * 0.3048).toFixed(1)} m</div>
        )}
      </div>
    </div>
  );
};
