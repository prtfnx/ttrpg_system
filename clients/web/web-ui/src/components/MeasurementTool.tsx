import { useCallback, useEffect, useState } from 'react';
import { useRenderEngine } from '../hooks/useRenderEngine';
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
  feet: number;
  meters: number;
  formatted: MeasurementDisplay;
}

interface MeasurementDisplay {
  distance: number;
  unit: 'px' | 'ft' | 'm' | 'grid';
  formatted: string;
  gridDistance?: number;
}

interface Point {
  x: number;
  y: number;
}

export function MeasurementTool({ isActive, onMeasurementComplete }: MeasurementToolProps) {
  const [measurement, setMeasurement] = useState<MeasurementResult | null>(null);
  const [currentUnit, setCurrentUnit] = useState<'px' | 'ft' | 'm' | 'grid'>('ft');
  const [measurementPoints, setMeasurementPoints] = useState<{ start: Point | null; end: Point | null }>({
    start: null,
    end: null
  });
  const { gridSize, camera } = useGameStore();
  const engine = useRenderEngine();

  // Format measurement display with multiple unit support
  const formatMeasurement = useCallback((distance: number, unit: string): MeasurementDisplay => {
    const pixelsPerGrid = gridSize || 50; // Default grid size
    const pixelsPerFoot = pixelsPerGrid / 5; // D&D standard: 5ft per grid square
    const pixelsPerMeter = pixelsPerFoot * 3.281; // 1 meter = 3.281 feet
    
    switch (unit) {
      case 'ft':
        const feet = distance / pixelsPerFoot;
        return {
          distance: feet,
          unit: 'ft',
          formatted: `${feet.toFixed(1)} ft`,
          gridDistance: feet / 5
        };
      case 'm':
        const meters = distance / pixelsPerMeter;
        return {
          distance: meters,
          unit: 'm',
          formatted: `${meters.toFixed(1)} m`,
          gridDistance: (meters * 3.281) / 5
        };
      case 'grid':
        const gridUnits = distance / pixelsPerGrid;
        return {
          distance: gridUnits,
          unit: 'grid',
          formatted: `${gridUnits.toFixed(1)} squares`,
          gridDistance: gridUnits
        };
      default:
        return {
          distance,
          unit: 'px',
          formatted: `${distance.toFixed(0)} px`
        };
    }
  }, [gridSize]);

  // Calculate measurement between two points
  const calculateMeasurement = useCallback((start: Point, end: Point): MeasurementResult => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    
    const distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const gridUnits = distance / (gridSize || 50);
    const screenPixels = distance * (camera.zoom || 1);
    
    const pixelsPerGrid = gridSize || 50;
    const pixelsPerFoot = pixelsPerGrid / 5;
    const pixelsPerMeter = pixelsPerFoot * 3.281;
    
    const feet = distance / pixelsPerFoot;
    const meters = distance / pixelsPerMeter;
    const formatted = formatMeasurement(distance, currentUnit);

    return {
      distance,
      angle,
      gridUnits,
      screenPixels,
      feet,
      meters,
      formatted
    };
  }, [gridSize, camera.zoom, currentUnit, formatMeasurement]);

  // Handle measurement events
  const handleMeasurement = useCallback((start: Point, end: Point) => {
    const result = calculateMeasurement(start, end);
    setMeasurement(result);
    onMeasurementComplete?.(result);
  }, [calculateMeasurement, onMeasurementComplete]);

  // Handle click events for manual measurement
  const handleClick = useCallback((event: MouseEvent) => {
    if (!isActive) return;
    
    const rect = (event.target as Element).getBoundingClientRect();
    const point: Point = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    
    setMeasurementPoints(prev => {
      if (!prev.start) {
        return { start: point, end: null };
      } else {
        const result = { start: prev.start, end: point };
        handleMeasurement(result.start, result.end);
        return { start: null, end: null }; // Reset for next measurement
      }
    });
  }, [isActive, handleMeasurement]);

  useEffect(() => {
    if (!isActive) {
      setMeasurement(null);
      setMeasurementPoints({ start: null, end: null });
      return;
    }

    // Listen for measurement events from Rust engine if available
    const handleMeasurementEvent = (event: CustomEvent) => {
      const { start, end } = event.detail;
      handleMeasurement(start, end);
    };

    // Listen for click events on canvas for manual measurement
    const canvas = document.querySelector('canvas') || document.querySelector('.game-canvas');
    
    window.addEventListener('measurementComplete', handleMeasurementEvent as EventListener);
    if (canvas) {
      canvas.addEventListener('click', handleClick);
    }
    
    return () => {
      window.removeEventListener('measurementComplete', handleMeasurementEvent as EventListener);
      if (canvas) {
        canvas.removeEventListener('click', handleClick);
      }
    };
  }, [isActive, handleMeasurement, handleClick]);

  // Update measurement when unit changes
  useEffect(() => {
    if (measurement && measurementPoints.start && measurementPoints.end) {
      const updated = calculateMeasurement(measurementPoints.start, measurementPoints.end);
      setMeasurement(updated);
    }
  }, [currentUnit, measurement, measurementPoints, calculateMeasurement]);

  const clearMeasurement = () => {
    setMeasurement(null);
    setMeasurementPoints({ start: null, end: null });
  };

  if (!isActive && !measurement) return null;

  return (
    <div className="measurement-tool">
      <div className="measurement-overlay">
        {measurementPoints.start && !measurementPoints.end && (
          <div className="measurement-instructions">
            <p>Click to complete measurement</p>
          </div>
        )}
        
        {measurement && (
          <div className="measurement-results">
            <div className="measurement-header">
              <h4>Measurement Results</h4>
              <div className="unit-selector">
                {(['ft', 'm', 'grid', 'px'] as const).map(unit => (
                  <button
                    key={unit}
                    className={`unit-btn ${currentUnit === unit ? 'active' : ''}`}
                    onClick={() => setCurrentUnit(unit)}
                  >
                    {unit}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="measurement-item primary">
              <span className="label">Distance:</span>
              <span className="value">{measurement.formatted.formatted}</span>
            </div>
            
            {measurement.formatted.gridDistance && (
              <div className="measurement-item secondary">
                <span className="label">Grid Units:</span>
                <span className="value">{measurement.formatted.gridDistance.toFixed(1)} squares</span>
              </div>
            )}
            
            <div className="measurement-item">
              <span className="label">Angle:</span>
              <span className="value">{measurement.angle.toFixed(1)}°</span>
            </div>
            
            <div className="measurement-item">
              <span className="label">Pixels:</span>
              <span className="value">{measurement.distance.toFixed(1)}px</span>
            </div>
            
            <div className="measurement-actions">
              <button 
                className="clear-measurement"
                onClick={clearMeasurement}
              >
                Clear
              </button>
              {engine && (
                <button 
                  className="save-measurement"
                  onClick={() => {
                    // Could save measurement to game state or notes
                    console.log('Measurement saved:', measurement);
                  }}
                >
                  Save
                </button>
              )}
            </div>
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
        
        .measurement-instructions {
          background: rgba(0, 100, 200, 0.9);
          color: white;
          padding: 8px 12px;
          border-radius: 4px;
          font-size: 14px;
          margin-bottom: 8px;
        }
        
        .measurement-results {
          background: rgba(0, 0, 0, 0.9);
          color: white;
          padding: 16px;
          border-radius: 8px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          min-width: 280px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .measurement-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
        }
        
        .measurement-header h4 {
          margin: 0;
          font-size: 16px;
          color: #fff;
        }
        
        .unit-selector {
          display: flex;
          gap: 4px;
        }
        
        .unit-btn {
          padding: 4px 8px;
          background: rgba(255, 255, 255, 0.1);
          color: #ccc;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 3px;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.2s;
        }
        
        .unit-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          color: white;
        }
        
        .unit-btn.active {
          background: #4CAF50;
          color: white;
          border-color: #4CAF50;
        }
        
        .measurement-item {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          padding: 4px 0;
        }
        
        .measurement-item.primary {
          font-size: 18px;
          font-weight: bold;
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
          padding-bottom: 8px;
          margin-bottom: 12px;
        }
        
        .measurement-item.secondary {
          font-size: 14px;
          color: #aaa;
          margin-bottom: 12px;
        }
        
        .label {
          color: #ccc;
        }
        
        .value {
          color: #4CAF50;
          font-weight: bold;
        }
        
        .measurement-item.primary .value {
          color: #66BB6A;
          font-size: 20px;
        }
        
        .measurement-actions {
          display: flex;
          gap: 8px;
          margin-top: 12px;
          padding-top: 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.2);
        }
        
        .clear-measurement, .save-measurement {
          flex: 1;
          padding: 8px 12px;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          transition: background 0.2s;
        }
        
        .clear-measurement {
          background: #f44336;
        }
        
        .clear-measurement:hover {
          background: #d32f2f;
        }
        
        .save-measurement {
          background: #2196F3;
        }
        
        .save-measurement:hover {
          background: #1976D2;
        }
      `}</style>
    </div>
  );
}
