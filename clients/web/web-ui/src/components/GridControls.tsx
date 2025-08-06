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
    <div style={{ 
      margin: '16px 0', 
      padding: '12px', 
      background: '#f8f9fa', 
      borderRadius: '6px',
      border: '1px solid #e9ecef'
    }}>
      <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600' }}>
        Grid Controls
      </h4>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* Grid Visibility */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
          <input
            type="checkbox"
            checked={gridEnabled}
            onChange={handleGridToggle}
          />
          Show Grid
        </label>

        {/* Grid Snapping */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
          <input
            type="checkbox"
            checked={gridSnapping}
            onChange={handleSnapToggle}
          />
          Snap to Grid
        </label>

        {/* Grid Size */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '13px', fontWeight: '500' }}>
            Grid Size: {gridSize}px
          </label>
          <input
            type="range"
            min="20"
            max="100"
            step="10"
            value={gridSize}
            onChange={(e) => handleSizeChange(Number(e.target.value))}
            style={{ width: '100%' }}
          />
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            fontSize: '11px', 
            color: '#6c757d' 
          }}>
            <span>20px</span>
            <span>100px</span>
          </div>
        </div>
      </div>
    </div>
  );
}
