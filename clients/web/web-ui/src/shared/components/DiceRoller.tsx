import { useState } from 'react';

/**
 * DiceRoller - Minimal, reusable dice roller component for TTRPGs.
 * - Rolls any standard dice (d4, d6, d8, d10, d12, d20, d100)
 * - TypeScript, no external dependencies, concise code
 * - Best practices: stateless dice logic, local state for UI, accessible
 */
export type DiceType = 4 | 6 | 8 | 10 | 12 | 20 | 100;

export interface DiceRollerProps {
  dice?: DiceType; // default: 20
  count?: number; // default: 1
  onRoll?: (results: number[]) => void;
}


export function DiceRoller({ dice = 20, count = 1, onRoll }: DiceRollerProps) {
  const [results, setResults] = useState<number[]>([]);
  const [rolling, setRolling] = useState(false);
  const [selectedDice, setSelectedDice] = useState<DiceType>(dice);
  const [sentToChat, setSentToChat] = useState(false);

  function rollDice() {
    setRolling(true);
    const newResults = Array.from({ length: count }, () => Math.floor(Math.random() * selectedDice) + 1);
    setResults(newResults);
    setRolling(false);
    onRoll?.(newResults);

    // Send to chat if possible
    const text = `🎲 Rolled ${count}d${selectedDice}: ${newResults.join(', ')}${newResults.length > 1 ? ` (Total: ${newResults.reduce((a, b) => a + b, 0)})` : ''}`;
    if (window.gameAPI && typeof window.gameAPI.sendMessage === 'function') {
      window.gameAPI.sendMessage('chat', { text });
      setSentToChat(true);
      setTimeout(() => setSentToChat(false), 1200);
    }
  }

  return (
    <div className="game-panel">
      <h3 className="panel-title">Dice Roller</h3>
      <div className="dice-controls">
        <span className="form-label">Roll:</span>
        <select
          value={selectedDice}
          onChange={e => setSelectedDice(Number(e.target.value) as DiceType)}
          className="form-select"
        >
          <option value={4}>d4</option>
          <option value={6}>d6</option>
          <option value={8}>d8</option>
          <option value={10}>d10</option>
          <option value={12}>d12</option>
          <option value={20}>d20</option>
          <option value={100}>d100</option>
        </select>
        <span className="dice-count">(x{count})</span>
      </div>
      <button
        onClick={rollDice}
        disabled={rolling}
        className="btn-primary"
        aria-label={`Roll ${count}d${selectedDice}`}
      >
        Roll
      </button>
      <div className="dice-results">
        {results.length > 0 && (
          <span>
            Result: {results.join(', ')}
            {results.length > 1 && (
              <span className="dice-total">
                (Total: {results.reduce((a, b) => a + b, 0)})
              </span>
            )}
          </span>
        )}
      </div>
      {sentToChat && (
        <div className="chat-sent-message">Sent to chat!</div>
      )}
    </div>
  );
}

export default DiceRoller;
