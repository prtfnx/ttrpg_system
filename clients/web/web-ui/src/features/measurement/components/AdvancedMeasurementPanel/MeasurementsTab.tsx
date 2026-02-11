import { advancedMeasurementSystem, type MeasurementLine, type MeasurementSettings } from '@features/measurement/services/advancedMeasurement.service';
import type { FC } from 'react';
import styles from '../AdvancedMeasurementPanel.module.css';
import type { ActiveTool } from './ToolSelection';

interface MeasurementsTabProps {
  activeTool: ActiveTool;
  filteredMeasurements: MeasurementLine[];
  settings: MeasurementSettings | null;
  onClearMeasurements: () => void;
  onSettingsUpdate: (updates: Partial<MeasurementSettings>) => void;
}

export const MeasurementsTab: FC<MeasurementsTabProps> = ({
  activeTool,
  filteredMeasurements,
  settings,
  onClearMeasurements,
  onSettingsUpdate
}) => (
  <div className={styles.measurementsTab}>
    <div className={styles.sectionHeader}>
      <h3>Measurements ({filteredMeasurements.length})</h3>
      <div className={styles.sectionControls}>
        <button onClick={onClearMeasurements} className={styles.clearBtn}>
          Clear All
        </button>
      </div>
    </div>

    {activeTool === 'measure' && (
      <div className={styles.toolOptions}>
        <h4>Measurement Options</h4>
        <div className={styles.optionsGrid}>
          <label>
            <input
              type="checkbox"
              checked={settings?.snapToGrid || false}
              onChange={(e) => onSettingsUpdate({ snapToGrid: e.target.checked })}
            />
            Snap to Grid
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings?.showDistanceLabels || false}
              onChange={(e) => onSettingsUpdate({ showDistanceLabels: e.target.checked })}
            />
            Show Labels
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings?.showAngleMarkers || false}
              onChange={(e) => onSettingsUpdate({ showAngleMarkers: e.target.checked })}
            />
            Show Angles
          </label>
        </div>
      </div>
    )}

    <div className={styles.measurementsList}>
      {filteredMeasurements.map(measurement => (
        <div key={measurement.id} className={styles.measurementItem}>
          <div className={styles.measurementInfo}>
            <div className={styles.measurementDistance}>
              {advancedMeasurementSystem.formatDistance(measurement.distance)}
              {measurement.gridDistance !== measurement.distance && (
                <span className={styles.gridDistance}>
                  ({advancedMeasurementSystem.formatDistance(measurement.gridDistance)} grid)
                </span>
              )}
            </div>
            <div className={styles.measurementDetails}>
              Angle: {measurement.angle.toFixed(1)}° | 
              Length: {measurement.distance.toFixed(1)}px
              {measurement.label && <span className="measurement-label"> | {measurement.label}</span>}
            </div>
          </div>
          <div className="measurement-controls">
            <div 
              className="color-indicator" 
              style={{ backgroundColor: measurement.color }}
            ></div>
            <button 
              className={styles.deleteBtn}
              onClick={() => console.log('Remove measurement:', measurement.id)}
              title="Delete measurement"
            >
              🗑️
            </button>
          </div>
        </div>
      ))}
      
      {filteredMeasurements.length === 0 && (
        <div className={styles.emptyState}>
          <p>No measurements yet.</p>
          {activeTool === 'measure' ? (
            <p>Click on the canvas to start measuring.</p>
          ) : (
            <p>Select the Measure tool and click on the canvas to start.</p>
          )}
        </div>
      )}
    </div>
  </div>
);
