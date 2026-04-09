import { useGameModeStore } from '../stores/gameModeStore';
import type { GameMode } from '../stores/gameModeStore';
import { useGameStore } from '@/store';
import { isDM } from '@features/session/types/roles';
import { ProtocolService } from '@lib/api';
import { createMessage, MessageType } from '@lib/websocket';

const MODES: { value: GameMode; label: string }[] = [
  { value: 'free_roam', label: 'Free Roam' },
  { value: 'explore', label: 'Explore' },
  { value: 'fight', label: 'Fight' },
  { value: 'custom', label: 'Custom' },
];

export function GameModeSwitch() {
  const mode = useGameModeStore((s) => s.mode);
  const roundNumber = useGameModeStore((s) => s.roundNumber);
  const role = useGameStore((s) => s.sessionRole);

  if (!isDM(role)) return null;

  const change = (next: GameMode) => {
    const proto = ProtocolService.getProtocol();
    proto?.sendMessage(createMessage(MessageType.GAME_MODE_CHANGE, { game_mode: next }));
  };

  return (
    <div className="game-mode-switch">
      <select value={mode} onChange={(e) => change(e.target.value as GameMode)}>
        {MODES.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      {mode === 'fight' && roundNumber > 0 && (
        <span className="round-badge">Round {roundNumber}</span>
      )}
    </div>
  );
}
