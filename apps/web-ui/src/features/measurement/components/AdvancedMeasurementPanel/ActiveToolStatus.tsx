import clsx from 'clsx';
import type { FC } from 'react';
import styles from '../AdvancedMeasurementPanel.module.css';
import type { ActiveTool } from './ToolSelection';

interface ActiveToolStatusProps {
  activeTool: ActiveTool;
  activeMeasurement: string | null;
  isCreatingShape: boolean;
  selectedShapeType: string;
  shapePoints: { x: number; y: number }[];
}

export const ActiveToolStatus: FC<ActiveToolStatusProps> = ({
  activeTool,
  activeMeasurement,
  isCreatingShape,
  selectedShapeType,
  shapePoints
}) => {
  if (!activeTool) return null;

  return (
    <div className={styles.activeToolStatus}>
      <div className={styles.statusIndicator}>
        <span className={clsx(styles.statusDot, styles.active)}></span>
        Active Tool: <strong>{activeTool.charAt(0).toUpperCase() + activeTool.slice(1)}</strong>
      </div>
      {activeMeasurement && (
        <div className={styles.measurementStatus}>
          <span>📏 Measuring... Click to complete</span>
        </div>
      )}
      {isCreatingShape && (
        <div className={styles.shapeStatus}>
          <span>📐 Creating {selectedShapeType}... {shapePoints.length} points</span>
          {selectedShapeType === 'polygon' && (
            <span className={styles.shapeHelp}>Double-click to complete</span>
          )}
        </div>
      )}
    </div>
  );
};
