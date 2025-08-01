import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import type { AbilitiesStepData } from './schemas';

const ABILITY_METHODS = [
  { value: 'standard', label: 'Standard Array' },
  { value: 'pointbuy', label: 'Point Buy' },
  { value: 'roll', label: 'Roll 4d6' },
  { value: 'manual', label: 'Manual Entry' },
];

const ABILITY_NAMES = [
  'Strength',
  'Dexterity',
  'Constitution',
  'Intelligence',
  'Wisdom',
  'Charisma',
];

const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

export function AbilitiesStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { control, formState, setError, clearErrors, getValues, setValue } = useFormContext<AbilitiesStepData>();
  const [method, setMethod] = useState<'standard' | 'pointbuy' | 'roll' | 'manual'>('standard');
  // For roll method
  const [rolledScores, setRolledScores] = useState<number[]>([]);

  // Set all abilities to 8 when Point Buy is selected or on first render
  useEffect(() => {
    if (method === 'pointbuy') {
      ABILITY_NAMES.forEach(name => setValue(name.toLowerCase(), 8, { shouldValidate: true }));
    } else if (method === 'standard') {
      ABILITY_NAMES.forEach(name => setValue(name.toLowerCase(), 0, { shouldValidate: true }));
    } else if (method === 'manual') {
      ABILITY_NAMES.forEach(name => setValue(name.toLowerCase(), 10, { shouldValidate: true }));
    } else if (method === 'roll') {
      ABILITY_NAMES.forEach(name => setValue(name.toLowerCase(), 0, { shouldValidate: true }));
    }
  }, [method, setValue]);

  // Point buy constants
  const POINT_BUY_TOTAL = 27;
  const POINT_BUY_MIN = 8;
  const POINT_BUY_MAX = 15;
  const POINT_BUY_COSTS: Record<number, number> = {8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9};

  // Helper for point buy: get current ability values and total spent
  function getPointBuyState() {
    const values = getValues();
    const assigned = ABILITY_NAMES.map(name => Number(values[name.toLowerCase()]));
    const spent = assigned.reduce((sum, val) => sum + (POINT_BUY_COSTS[val] ?? 0), 0);
    return { assigned, spent, remaining: POINT_BUY_TOTAL - spent };
  }

  function handlePointBuyChange(ability: string, delta: number) {
    const values = getValues();
    const current = Number(values[ability]);
    const next = current + delta;
    if (next < POINT_BUY_MIN || next > POINT_BUY_MAX) return;
    // Calculate new spent
    const { assigned } = getPointBuyState();
    const idx = ABILITY_NAMES.map(n => n.toLowerCase()).indexOf(ability);
    const newAssigned = [...assigned];
    newAssigned[idx] = next;
    const newSpent = newAssigned.reduce((sum, val) => sum + (POINT_BUY_COSTS[val] ?? 0), 0);
    if (newSpent > POINT_BUY_TOTAL) return;
    // Set value
    setValue(ability, next, { shouldValidate: true });
  }

  // Helper to check if all abilities are assigned and unique
  function validateAbilities(values: Record<string, any>) {
    const assigned = ABILITY_NAMES.map(name => Number(values[name.toLowerCase()]));
    if (method === 'standard') {
      const allAssigned = assigned.every(v => !isNaN(v) && v > 0);
      const unique = new Set(assigned).size === STANDARD_ARRAY.length;
      const validValues = assigned.every(v => STANDARD_ARRAY.includes(v));
      return allAssigned && unique && validValues;
    }
    if (method === 'pointbuy') {
      // Only require all assigned values to be in range, not that all points are spent
      return assigned.every(v => !isNaN(v) && v >= 8 && v <= 15);
    }
    if (method === 'roll') {
      if (rolledScores.length !== 6) return false;
      const allAssigned = assigned.every(v => !isNaN(v) && v > 0);
      const unique = new Set(assigned).size === rolledScores.length;
      const validValues = assigned.every(v => rolledScores.includes(v));
      return allAssigned && unique && validValues;
    }
    if (method === 'manual') {
      return assigned.every(v => !isNaN(v) && v >= 1 && v <= 30);
    }
    return false;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const values = getValues();
    if (validateAbilities(values)) {
      clearErrors('abilities');
      onNext();
    } else {
      setError('abilities', { type: 'manual', message: 'Assign each score to a different ability.' });
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Assign Ability Scores</div>
      <div style={{ marginBottom: 8 }}>
        <span>Choose a method:</span>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          {ABILITY_METHODS.map(m => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMethod(m.value as any)}
              style={{
                background: method === m.value ? '#6366f1' : '#eee',
                color: method === m.value ? '#fff' : '#333',
                border: 'none',
                borderRadius: 4,
                padding: '6px 12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      {method === 'standard' && (
        <>
          <div style={{ marginBottom: 8 }}>
            Assign each value from the standard array (15, 14, 13, 12, 10, 8) to a different ability.
          </div>
          {ABILITY_NAMES.map(name => (
            <label key={name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {name}:
              <Controller
                name={name.toLowerCase()}
                control={control}
                defaultValue={0}
                render={({ field }) => (
                  <select {...field} style={{ minWidth: 60 }}>
                    <option value={0}>Select...</option>
                    {STANDARD_ARRAY.map(val => (
                      <option key={val} value={val}>{val}</option>
                    ))}
                  </select>
                )}
              />
            </label>
          ))}
        </>
      )}
      {method === 'pointbuy' && (
        <>
          <div style={{ marginBottom: 8 }}>
            <b>Point Buy (27 points):</b> Assign points to each ability. Min 8, Max 15. Costs: 8(0), 9(1), 10(2), 11(3), 12(4), 13(5), 14(7), 15(9).
          </div>
          {(() => {
            const { assigned, remaining } = getPointBuyState();
            return (
              <>
                <div style={{ marginBottom: 8 }}>Points remaining: <b>{remaining}</b></div>
                {ABILITY_NAMES.map((name, i) => {
                  const key = name.toLowerCase();
                  const val = assigned[i];
                  return (
                    <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ minWidth: 90 }}>{name}:</span>
                      <button type="button" onClick={() => handlePointBuyChange(key, -1)} disabled={val <= POINT_BUY_MIN} style={{ width: 28, height: 28, fontWeight: 700 }}>-</button>
                      <Controller
                        name={key}
                        control={control}
                        defaultValue={8}
                        render={({ field }) => (
                          <input {...field} type="number" min={POINT_BUY_MIN} max={POINT_BUY_MAX} value={val} readOnly style={{ width: 40, textAlign: 'center' }} />
                        )}
                      />
                      <button type="button" onClick={() => handlePointBuyChange(key, 1)} disabled={val >= POINT_BUY_MAX || remaining < (POINT_BUY_COSTS[val+1] - POINT_BUY_COSTS[val])} style={{ width: 28, height: 28, fontWeight: 700 }}>+</button>
                      <span style={{ fontSize: 12, color: '#888' }}>(Cost: {POINT_BUY_COSTS[val]})</span>
                    </div>
                  );
                })}
              </>
            );
          })()}
        </>
      )}
      {method === 'roll' && (
        <>
          <div style={{ marginBottom: 8 }}>
            <b>Roll 4d6:</b> Roll six ability scores (drop lowest die per roll), then assign each to an ability.
          </div>
          <div style={{ marginBottom: 8 }}>
            <button type="button" onClick={() => {
              // Roll 4d6 drop lowest, six times
              function roll4d6() {
                const rolls = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1);
                rolls.sort((a, b) => a - b);
                return rolls.slice(1).reduce((a, b) => a + b, 0);
              }
              setRolledScores(Array.from({ length: 6 }, roll4d6));
            }} style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 12px', fontWeight: 600 }}>Roll Scores</button>
            {rolledScores.length === 6 && (
              <span style={{ marginLeft: 12 }}>Rolled: <b>{rolledScores.join(', ')}</b></span>
            )}
          </div>
          {rolledScores.length === 6 && ABILITY_NAMES.map(name => (
            <label key={name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {name}:
              <Controller
                name={name.toLowerCase()}
                control={control}
                defaultValue={0}
                render={({ field }) => (
                  <select {...field} style={{ minWidth: 60 }}>
                    <option value={0}>Select...</option>
                    {rolledScores.map(val => (
                      <option key={val} value={val}>{val}</option>
                    ))}
                  </select>
                )}
              />
            </label>
          ))}
        </>
      )}
      {method === 'manual' && (
        <>
          <div style={{ marginBottom: 8 }}>
            <b>Manual Entry:</b> Enter each ability score directly (1-30).
          </div>
          {ABILITY_NAMES.map(name => (
            <label key={name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {name}:
              <Controller
                name={name.toLowerCase()}
                control={control}
                defaultValue={10}
                render={({ field }) => (
                  <input {...field} type="number" min={1} max={30} style={{ width: 60 }} />
                )}
              />
            </label>
          ))}
        </>
      )}
      {formState.errors.abilities && (
        <span style={{ color: 'red' }}>{formState.errors.abilities.message as string}</span>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onBack} style={{ background: '#eee', color: '#333', border: 'none', borderRadius: 4, padding: '8px 16px' }}>Back</button>
        <button type="submit" style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', fontWeight: 600 }}>Next</button>
      </div>
    </form>
  );
}
