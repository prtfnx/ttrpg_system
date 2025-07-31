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
    <div style={{
      background: '#f3f4f6',
      borderRadius: 8,
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12,
      border: '1px solid #e5e7eb',
      minWidth: 220,
      maxWidth: 320,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 600 }}>Roll:</span>
        <select
          value={selectedDice}
          onChange={e => setSelectedDice(Number(e.target.value) as DiceType)}
          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db', fontWeight: 600, fontSize: 15 }}
        >
          <option value={4}>d4</option>
          <option value={6}>d6</option>
          <option value={8}>d8</option>
          <option value={10}>d10</option>
          <option value={12}>d12</option>
          <option value={20}>d20</option>
          <option value={100}>d100</option>
        </select>
        <span style={{ color: '#888', fontSize: 13 }}>(x{count})</span>
      </div>
      <button
        onClick={rollDice}
        disabled={rolling}
        style={{ padding: '8px 24px', borderRadius: 6, fontWeight: 700, fontSize: 15, background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', marginTop: 4, marginBottom: 4 }}
        aria-label={`Roll ${count}d${selectedDice}`}
      >
        Roll
      </button>
      <div style={{ marginTop: 4, minHeight: 24, fontSize: 15, color: '#222', fontWeight: 500 }}>
        {results.length > 0 && (
          <span>
            Result: {results.join(', ')}
            {results.length > 1 && (
              <span style={{ color: '#888', marginLeft: 8 }}>
                (Total: {results.reduce((a, b) => a + b, 0)})
              </span>
            )}
          </span>
        )}
      </div>
      {sentToChat && (
        <div style={{ color: '#22c55e', fontWeight: 600, fontSize: 14, marginTop: 2 }}>Sent to chat!</div>
      )}
    </div>
  );
}

export default DiceRoller;
