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
      padding: '16px', 
      background: '#f9fafb', 
      borderRadius: '8px',
      border: '1px solid #e9ecef',
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
    }}>
      <h3 style={{ 
        margin: '0 0 12px 0', 
        fontSize: '14px', 
        fontWeight: '600',
        color: '#374151'
      }}>
        Grid Controls
      </h3>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Grid Visibility */}
        <label style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px', 
          fontSize: '13px',
          color: '#374151',
          cursor: 'pointer'
        }}>
          <input
            type="checkbox"
            checked={gridEnabled}
            onChange={handleGridToggle}
            style={{ cursor: 'pointer' }}
          />
          Show Grid
        </label>

        {/* Grid Snapping */}
        <label style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px', 
          fontSize: '13px',
          color: '#374151',
          cursor: 'pointer'
        }}>
          <input
            type="checkbox"
            checked={gridSnapping}
            onChange={handleSnapToggle}
            style={{ cursor: 'pointer' }}
          />
          Snap to Grid
        </label>

        {/* Grid Size */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ 
            fontSize: '13px', 
            fontWeight: '500',
            color: '#374151'
          }}>
            Grid Size: {gridSize}px
          </label>
          <input
            type="range"
            min="20"
            max="100"
            step="10"
            value={gridSize}
            onChange={(e) => handleSizeChange(Number(e.target.value))}
            style={{ 
              width: '100%',
              cursor: 'pointer'
            }}
          />
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            fontSize: '11px', 
            color: '#6b7280',
            marginTop: '2px'
          }}>
            <span>20px</span>
            <span>100px</span>
          </div>
        </div>
      </div>
    </div>
  );
}
