import { ToolsPanel } from './ToolsPanel';
import { RightPanel } from './RightPanel';
import { GameCanvas } from './GameCanvas';

export function GameClient() {
  return (
    <div className="game-client" style={{ display: 'flex', height: '100vh' }}>
      <ToolsPanel />
      <div className="canvas-container" style={{ flex: 1, position: 'relative' }}>
        <GameCanvas />
        {/* Optionally overlay EntitiesPanel/CharacterPanel here if needed */}
      </div>
      <RightPanel />
    </div>
  );
}
