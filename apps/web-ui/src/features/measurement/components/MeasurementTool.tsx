import { useRenderEngine } from '@lib/wasm/runtime';
import { logger } from '@shared/utils/logger';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import styles from './MeasurementTool.module.css';

interface MeasurementResult {
  distance: number;
  gridUnits: number;
  feet: number;
  meters: number;
  angle: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface MeasurementToolProps {
  isActive: boolean;
}

export function MeasurementTool({ isActive }: MeasurementToolProps) {
  const [measurement, setMeasurement] = useState<MeasurementResult | null>(null);
  const [currentUnit, setCurrentUnit] = useState<'ft' | 'm' | 'grid' | 'px'>('ft');
  const renderEngine = useRenderEngine();

  // Listen for measurement completion from Rust
  useEffect(() => {
    const handleMeasurementComplete = (event: CustomEvent<MeasurementResult>) => {
      logger.debug('[MeasurementTool] Received measurement from Rust', event.detail);
      setMeasurement(event.detail);
    };

    window.addEventListener('measurementComplete', handleMeasurementComplete as EventListener);
    
    return () => {
      window.removeEventListener('measurementComplete', handleMeasurementComplete as EventListener);
    };
  }, []);

  // Clear measurement when tool is deactivated
  useEffect(() => {
    if (!isActive) {
      setMeasurement(null);
    }
  }, [isActive]);

  const formatDistance = (measurement: MeasurementResult): string => {
    switch (currentUnit) {
      case 'ft':
        return `${measurement.feet.toFixed(1)} ft`;
      case 'm':
        return `${measurement.meters.toFixed(1)} m`;
      case 'grid':
        return `${measurement.gridUnits.toFixed(1)} squares`;
      case 'px':
        return `${measurement.distance.toFixed(0)} px`;
    }
  };

  const handleClear = () => {
    setMeasurement(null);
    
    // Clear measurement by switching back to select mode
    renderEngine?.set_input_mode_select();
    logger.debug('[MeasurementTool] Measurement cleared');
  };

  if (!measurement) return null;

  // NOTE: Label is now rendered directly in Rust/WebGL on the arrow
  // No need for screen coordinate conversion or HTML overlay positioning

  return (
    <aside className={styles.measurementTool} aria-label="Measurement results">
      {/* Label removed - now rendered in WebGL by Rust text_renderer.rs */}
      
      <div className={styles.measurementOverlay}>
        <div className={styles.measurementResults}>
          <div className={styles.measurementHeader}>
            <h4>Measurement Results</h4>
            <div className={styles.unitSelector} role="group" aria-label="Measurement unit">
              {(['ft', 'm', 'grid', 'px'] as const).map(unit => (
                <button
                  key={unit}
                  type="button"
                  className={clsx(styles.unitButton, currentUnit === unit && styles.active)}
                  aria-pressed={currentUnit === unit}
                  onClick={() => setCurrentUnit(unit)}
                >
                  {unit}
                </button>
              ))}
            </div>
          </div>
          
          <div className={clsx(styles.measurementItem, styles.primary)}>
            <span className={styles.label}>Distance:</span>
            <span className={styles.value}>{formatDistance(measurement)}</span>
          </div>
          
          <div className={clsx(styles.measurementItem, styles.secondary)}>
            <span className={styles.label}>Grid Units:</span>
            <span className={styles.value}>{measurement.gridUnits.toFixed(1)} squares</span>
          </div>
          
          <div className={styles.measurementItem}>
            <span className={styles.label}>Angle:</span>
            <span className={styles.value}>{measurement.angle.toFixed(1)}°</span>
          </div>
          
          <div className={styles.measurementItem}>
            <span className={styles.label}>Pixels:</span>
            <span className={styles.value}>{measurement.distance.toFixed(1)}px</span>
          </div>
          
          <div className={styles.measurementActions}>
            <button 
              type="button"
              className={styles.clearMeasurement}
              onClick={handleClear}
            >
              Clear Measurement
            </button>
            {/* Save button disabled - actionsProtocol not available in WASM mode
            <button 
              className="save-measurement"
              onClick={handleSave}
            >
              Save as Arrow
            </button>
            */}
          </div>
        </div>
      </div>
      
    </aside>
  );
}
