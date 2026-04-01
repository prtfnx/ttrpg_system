import { useGameStore } from '@/store';
import type { DistanceUnit } from '@/utils/unitConverter';
import { isDM } from '@features/session/types/roles';
import { ProtocolService } from '@lib/api';
import type { FC } from 'react';
import styles from '../TableManagementPanel.module.css';

interface SettingsModalProps {
  settingsName: string;
  settingsWidth: number;
  settingsHeight: number;
  settingsGridSize: number;
  settingsGridEnabled: boolean;
  onNameChange: (name: string) => void;
  onWidthChange: (width: number) => void;
  onHeightChange: (height: number) => void;
  onGridSizeChange: (size: number) => void;
  onGridEnabledChange: (enabled: boolean) => void;
  onSave: () => void;
  onCancel: () => void;
}

export const SettingsModal: FC<SettingsModalProps> = ({
  settingsName,
  settingsWidth,
  settingsHeight,
  settingsGridSize,
  settingsGridEnabled,
  onNameChange,
  onWidthChange,
  onHeightChange,
  onGridSizeChange,
  onGridEnabledChange,
  onSave,
  onCancel
}) => {
  const { gridCellPx, cellDistance, distanceUnit, activeTableId, sessionRole, setTableUnits, tables } = useGameStore();

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

  const pixelsPerUnit = gridCellPx / cellDistance;

  const activeTable = tables.find(t => t.table_id === activeTableId);
  const tableWidthPx = activeTable?.width ?? settingsWidth;
  const tableHeightPx = activeTable?.height ?? settingsHeight;
  const widthUnits = tableWidthPx / pixelsPerUnit;
  const heightUnits = tableHeightPx / pixelsPerUnit;

  return (
    <div className={styles.settingsModal}>
      <div className={styles.settingsModalContent}>
        <h4>Table Settings</h4>

        <div className={styles.settingsSection}>
          <label>
            Table Name:
            <input
              type="text"
              value={settingsName}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Enter table name"
              maxLength={50}
            />
          </label>
        </div>

        <div className={styles.settingsSection}>
          <h5>Resolution</h5>
          <div className={styles.formRow}>
            <label>
              Width (px):
              <input
                type="number"
                value={settingsWidth}
                onChange={(e) => onWidthChange(parseInt(e.target.value) || 2000)}
                min="500" max="10000" step="100"
              />
            </label>
            <label>
              Height (px):
              <input
                type="number"
                value={settingsHeight}
                onChange={(e) => onHeightChange(parseInt(e.target.value) || 2000)}
                min="500" max="10000" step="100"
              />
            </label>
          </div>
        </div>

        <div className={styles.settingsSection}>
          <h5>Grid</h5>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={settingsGridEnabled}
              onChange={(e) => onGridEnabledChange(e.target.checked)}
            />
            <span>Enable Grid</span>
          </label>
          {settingsGridEnabled && (
            <label>
              Grid Size (px):
              <input
                type="number"
                value={settingsGridSize}
                onChange={(e) => onGridSizeChange(parseInt(e.target.value) || 50)}
                min="10" max="200" step="5"
              />
            </label>
          )}
        </div>

        {isDM(sessionRole) && (
          <div className={styles.settingsSection}>
            <h5>Coordinate System</h5>

            <label>
              Cell size: <strong>{gridCellPx}px</strong>
              <input
                type="range"
                className={styles.coordSlider}
                min="10" max="200" step="5"
                value={gridCellPx}
                onChange={(e) => applyUnits(Number(e.target.value), cellDistance, distanceUnit)}
              />
            </label>

            <div className={styles.coordRow}>
              <label>Distance / cell</label>
              <input
                type="number"
                className={styles.coordDistInput}
                min="0.5" step="0.5"
                value={cellDistance}
                onChange={(e) => applyUnits(gridCellPx, Math.max(0.5, parseFloat(e.target.value) || 5), distanceUnit)}
              />
              <div className={styles.unitToggle}>
                {(['ft', 'm'] as DistanceUnit[]).map(u => (
                  <button
                    key={u}
                    className={distanceUnit === u ? styles.unitBtnActive : styles.unitBtn}
                    onClick={() => applyUnits(gridCellPx, cellDistance, u)}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.coordInfo}>
              <div>{pixelsPerUnit.toFixed(1)} px/{distanceUnit} · 1 cell = {cellDistance} {distanceUnit}</div>
              <div>≈ {widthUnits.toFixed(0)} × {heightUnits.toFixed(0)} {distanceUnit}</div>
              {distanceUnit === 'ft' && (
                <div>= {(widthUnits * 0.3048).toFixed(1)} × {(heightUnits * 0.3048).toFixed(1)} m</div>
              )}
            </div>
          </div>
        )}

        <div className={styles.modalActions}>
          <button onClick={onSave} className={styles.confirmButton}>
            Save Changes
          </button>
          <button onClick={onCancel} className={styles.cancelButton}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
