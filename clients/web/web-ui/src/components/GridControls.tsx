import { useGameStore } from '../store';

export function GridControls() {
  const { 
    gridEnabled, 
    gridSnapping, 
    gridSize, 
    setGridEnabled, 
    setGridSnapping, 
    setGridSize 
  } = useGameStore();

  const handleGridToggle = () => {
    const newEnabled = !gridEnabled;
    setGridEnabled(newEnabled);
    if (window.rustRenderManager?.set_grid_enabled) {
      window.rustRenderManager.set_grid_enabled(newEnabled);
    }
  };

  const handleSnapToggle = () => {
    const newSnapping = !gridSnapping;
    setGridSnapping(newSnapping);
    if (window.rustRenderManager?.set_grid_snapping) {
      window.rustRenderManager.set_grid_snapping(newSnapping);
    }
  };

  const handleSizeChange = (newSize: number) => {
    setGridSize(newSize);
    if (window.rustRenderManager?.set_grid_size) {
      window.rustRenderManager.set_grid_size(newSize);
    }
  };

  return (
    <div className="game-panel">
      <h3 className="panel-title">
        Grid Controls
      </h3>
      
      <div className="form-container">
        {/* Grid Visibility */}
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={gridEnabled}
            onChange={handleGridToggle}
          />
          Show Grid
        </label>

        {/* Grid Snapping */}
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={gridSnapping}
            onChange={handleSnapToggle}
          />
          Snap to Grid
        </label>

        {/* Grid Size */}
        <div className="form-group">
          <label className="form-label">
            Grid Size: {gridSize}px
          </label>
          <input
            type="range"
            min="20"
            max="100"
            step="10"
            value={gridSize}
            onChange={(e) => handleSizeChange(Number(e.target.value))}
            className="range-input"
          />
          <div className="range-labels">
            <span>20px</span>
            <span>100px</span>
          </div>
        </div>
      </div>
    </div>
  );
}
