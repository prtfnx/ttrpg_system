import { useEffect, useState } from 'react';

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

  // Listen for measurement completion from Rust
  useEffect(() => {
    const handleMeasurementComplete = (event: CustomEvent<MeasurementResult>) => {
      console.log('[MeasurementTool] Received measurement from Rust:', event.detail);
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
    if (window.rustRenderManager) {
      window.rustRenderManager.set_input_mode_select();
    }
    
    console.log('[MeasurementTool] Measurement cleared');
  };

  /* Save function disabled - actionsProtocol not available in WASM mode
  const handleSave = async () => {
    if (!measurement) return;

    // Create a line sprite representing the measurement arrow
    const sprite = {
      type: 'line',
      worldX: measurement.startX,
      worldY: measurement.startY,
      endX: measurement.endX,
      endY: measurement.endY,
      color: '#FFFF00', // Yellow arrow
      lineWidth: 2,
      metadata: {
        measurement: true,
        distance: measurement.distance,
        feet: measurement.feet,
        angle: measurement.angle
      }
    };

    try {
      // Send create sprite action to server via protocol
      if (window.actionsProtocol) {
        await window.actionsProtocol.createSprite(sprite);
        console.log('[MeasurementTool] Measurement saved as sprite');
        handleClear();
      } else {
        console.error('[MeasurementTool] Actions protocol not available');
      }
    } catch (error) {
      console.error('[MeasurementTool] Failed to save measurement:', error);
    }
  };
  */

  if (!measurement) return null;

  // NOTE: Label is now rendered directly in Rust/WebGL on the arrow
  // No need for screen coordinate conversion or HTML overlay positioning

  return (
    <div className="measurement-tool">
      {/* Label removed - now rendered in WebGL by Rust text_renderer.rs */}
      
      <div className="measurement-overlay">
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
            <span className="value">{formatDistance(measurement)}</span>
          </div>
          
          <div className="measurement-item secondary">
            <span className="label">Grid Units:</span>
            <span className="value">{measurement.gridUnits.toFixed(1)} squares</span>
          </div>
          
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
