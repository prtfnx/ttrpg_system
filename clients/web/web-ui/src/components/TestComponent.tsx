// Simple test component to verify the setup
export function TestComponent() {
  return (
    <div className="app">
      <h1>TTRPG Web Client</h1>
      <p>Development server is running!</p>
      <div className="game-client" style={{ 
        display: 'grid', 
        gridTemplateColumns: '300px 1fr 300px', 
        height: '100vh', 
        backgroundColor: '#1a1a1a' 
      }}>
        <div className="game-panel">
          <h2>Tools</h2>
          <p>Tools panel loaded</p>
        </div>
        <div className="canvas-container">
          <canvas width="800" height="600" style={{ backgroundColor: '#0a0a0a' }}>
            Canvas not supported
          </canvas>
        </div>
        <div className="game-panel">
          <h2>Entities</h2>
          <p>Entities panel loaded</p>
        </div>
      </div>
    </div>
  )
}
