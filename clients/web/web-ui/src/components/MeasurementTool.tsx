import { useEffect, useState } from 'react';
import { useGameStore } from '../store';

interface MeasurementToolProps {
  isActive: boolean;
  onMeasurementComplete?: (result: MeasurementResult) => void;
}

interface MeasurementResult {
  distance: number;
  angle: number;
  gridUnits: number;
  screenPixels: number;
}

export function MeasurementTool({ isActive, onMeasurementComplete }: MeasurementToolProps) {
  const [measurement, setMeasurement] = useState<MeasurementResult | null>(null);
  const { gridSize, camera } = useGameStore();

  useEffect(() => {
    if (!isActive) {
      setMeasurement(null);
      return;
    }

    const handleMeasurement = (start: { x: number; y: number }, end: { x: number; y: number }) => {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      
      const distance = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      const gridUnits = distance / gridSize;
      const screenPixels = distance * camera.zoom;

      const result: MeasurementResult = {
        distance,
        angle,
        gridUnits,
        screenPixels
      };

      setMeasurement(result);
      onMeasurementComplete?.(result);
    };

    // Listen for measurement events from Rust engine
    const handleMeasurementEvent = (event: CustomEvent) => {
      const { start, end } = event.detail;
      handleMeasurement(start, end);
    };

    window.addEventListener('measurementComplete', handleMeasurementEvent as EventListener);
    
    return () => {
      window.removeEventListener('measurementComplete', handleMeasurementEvent as EventListener);
    };
  }, [isActive, gridSize, camera.zoom, onMeasurementComplete]);

  if (!isActive && !measurement) return null;

  return (
    <div className="measurement-tool">
      <div className="measurement-overlay">
        {measurement && (
          <div className="measurement-results">
            <div className="measurement-item">
              <span className="label">Distance:</span>
              <span className="value">{measurement.distance.toFixed(1)}px</span>
            </div>
            <div className="measurement-item">
              <span className="label">Grid Units:</span>
              <span className="value">{measurement.gridUnits.toFixed(1)}</span>
            </div>
            <div className="measurement-item">
              <span className="label">Angle:</span>
              <span className="value">{measurement.angle.toFixed(1)}°</span>
            </div>
            <button 
              className="clear-measurement"
              onClick={() => setMeasurement(null)}
            >
              Clear
            </button>
          </div>
        )}
      </div>
      
      <style>{`
        .measurement-tool {
          position: absolute;
          top: 0;
          left: 0;
          pointer-events: none;
          z-index: 1000;
        }
        
        .measurement-overlay {
          position: fixed;
          top: 20px;
          right: 20px;
          pointer-events: auto;
        }
        
        .measurement-results {
          background: rgba(0, 0, 0, 0.9);
          color: white;
          padding: 12px;
          border-radius: 6px;
          font-family: monospace;
          min-width: 200px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }
        
        .measurement-item {
          display: flex;
          justify-content: space-between;
          margin-bottom: 4px;
        }
        
        .label {
          color: #ccc;
        }
        
        .value {
          color: #4CAF50;
          font-weight: bold;
        }
        
        .clear-measurement {
          margin-top: 8px;
          padding: 4px 8px;
          background: #ff4444;
          color: white;
          border: none;
          border-radius: 3px;
          cursor: pointer;
          font-size: 12px;
        }
        
        .clear-measurement:hover {
          background: #cc3333;
        }
      `}</style>
    </div>
  );
}
