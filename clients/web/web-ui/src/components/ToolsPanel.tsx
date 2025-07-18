import { useGameStore } from '../store';

export function ToolsPanel() {
  const { isConnected, sessionId, addSprite, camera } = useGameStore()

  const handleAddSprite = () => {
    const newSprite = {
      id: `sprite-${Date.now()}`,
      name: `Sprite ${Date.now()}`,
      x: camera.x,
      y: camera.y,
      width: 50,
      height: 50,
      imageUrl: '',
      layer: 0,
      isSelected: false,
      isVisible: true
    };
    addSprite(newSprite);
  };

  return (
    <div className="game-panel">
      <h2>Tools</h2>
      
      <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
        {isConnected ? `Connected: ${sessionId}` : 'Disconnected'}
      </div>

      <div className="toolbar">
        <button className="active">
          Select Tool
        </button>
        <button>
          Move Tool
        </button>
        <button>
          Measure Tool
        </button>
        <button onClick={handleAddSprite}>
          Add Sprite
        </button>
        <button>
          Paint Tool
        </button>
      </div>
    </div>
  )
}
