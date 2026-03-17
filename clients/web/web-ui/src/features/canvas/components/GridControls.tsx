import { useGameStore } from '@/store';
import type { DistanceUnit } from '@/utils/unitConverter';
import { ProtocolService } from '@lib/api';

export function GridControls() {
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
    window.rustRenderManager?.set_grid_enabled?.(newEnabled);
  };

  const handleSnapToggle = () => {
    const newSnapping = !gridSnapping;
    setGridSnapping(newSnapping);
    window.rustRenderManager?.set_grid_snapping?.(newSnapping);
  };

  const handleSizeChange = (newSize: number) => {
    setGridSize(newSize);
    window.rustRenderManager?.set_grid_size?.(newSize);
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
    <div className="game-panel">
      <h3 className="panel-title">Grid Controls</h3>
      
      <div className="form-container">
        <label className="checkbox-label">
          <input type="checkbox" checked={gridEnabled} onChange={handleGridToggle} />
          Show Grid
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={gridSnapping} onChange={handleSnapToggle} />
          Snap to Grid
        </label>

        <div className="form-group">
          <label className="form-label">Cell size: {gridSize}px</label>
          <input
            type="range"
            min="20"
            max="200"
            step="5"
            value={gridSize}
            onChange={(e) => handleSizeChange(Number(e.target.value))}
            className="range-input"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Distance per cell</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={cellDistance}
              onChange={(e) => handleDistanceChange(parseFloat(e.target.value) || 5)}
              style={{ width: '60px' }}
            />
            <div style={{ display: 'flex', gap: '3px' }}>
              {(['ft', 'm'] as DistanceUnit[]).map(u => (
                <button
                  key={u}
                  onClick={() => handleUnitChange(u)}
                  style={{
                    padding: '2px 8px',
                    background: distanceUnit === u ? '#4a7ec7' : '#333',
                    color: '#fff',
                    border: '1px solid #555',
                    borderRadius: '3px',
                    cursor: 'pointer',
                  }}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
          {pixelsPerUnit.toFixed(1)} px/{distanceUnit} · 1 cell = {cellDistance} {distanceUnit}
        </div>
      </div>
    </div>
  );
}
