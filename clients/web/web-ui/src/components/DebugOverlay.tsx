import React from 'react';

interface DebugOverlayProps {
  cursorScreen: { x: number; y: number };
  cursorWorld: { x: number; y: number };
  grid: { x: number; y: number };
}

export const DebugOverlay: React.FC<DebugOverlayProps> = ({ cursorScreen, cursorWorld, grid }) => {
  // Position overlay near cursor, but keep within canvas bounds
  const style: React.CSSProperties = {
    position: 'absolute',
    left: cursorScreen.x + 16,
    top: cursorScreen.y + 16,
    background: 'rgba(0,0,0,0.8)',
    color: '#fff',
    padding: '8px 14px',
    borderRadius: '8px',
    fontSize: '15px',
    pointerEvents: 'none',
    zIndex: 10,
    minWidth: '120px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
    border: '1px solid #333',
  };

  return (
    <div style={style}>
      <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '2px' }}>
        World: <span style={{ color: '#ffd700' }}>({cursorWorld.x.toFixed(2)}, {cursorWorld.y.toFixed(2)})</span>
      </div>
      <div style={{ fontSize: '12px', color: '#aaa' }}>
        Screen: ({cursorScreen.x.toFixed(1)}, {cursorScreen.y.toFixed(1)})<br />
        Grid: ({grid.x.toFixed(2)}, {grid.y.toFixed(2)})
      </div>
    </div>
  );
};
