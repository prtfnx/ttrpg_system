import { useEffect, useState } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import type { AbilitiesStepData } from './schemas';

type AbilityName = keyof AbilitiesStepData;
type Method = 'standard' | 'pointbuy' | 'roll' | 'manual';

const ABILITIES: AbilityName[] = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
const ABILITY_LABELS = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'] as const;
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

export function AbilitiesStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { control, setValue, getValues, formState: { errors } } = useFormContext<AbilitiesStepData>();
  const [method, setMethod] = useState<Method>('standard');
  const [rolls, setRolls] = useState<number[]>([]);

  useEffect(() => {
    const resetValue = method === 'pointbuy' ? 8 : 10;
    ABILITIES.forEach(ability => setValue(ability, resetValue, { shouldValidate: true }));
  }, [method, setValue]);

  const rollAbilities = () => {
    const newRolls = Array.from({ length: 6 }, () => 
      Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1)
        .sort((a, b) => b - a)
        .slice(0, 3)
        .reduce((sum, roll) => sum + roll, 0)
    ).sort((a, b) => b - a);
    setRolls(newRolls);
  };

  // Point buy calculation
  const getPointCost = (score: number): number => {
    if (score <= 8) return 0;
    if (score <= 13) return score - 8;
    if (score === 14) return 7;
    if (score === 15) return 9;
    return 999; // Invalid
  };

  const getTotalPointsUsed = (): number => {
    const values = getValues();
    return ABILITIES.reduce((total, ability) => total + getPointCost(values[ability] || 8), 0);
  };

  const isValid = () => {
    const values = getValues();
    const allValues = Object.values(values);
    
    if (method === 'standard') {
      // All values must be from standard array and unique
      return allValues.every(v => STANDARD_ARRAY.includes(v)) && 
             new Set(allValues).size === 6 &&
             allValues.every(v => v > 0);
    } else if (method === 'pointbuy') {
      // Must use exactly 27 points and all scores 8-15
      return getTotalPointsUsed() === 27 && 
             allValues.every(v => v >= 8 && v <= 15);
    } else if (method === 'roll') {
      // All values must be assigned from rolls
      return rolls.length > 0 && 
             allValues.every(v => rolls.includes(v)) &&
             new Set(allValues).size === allValues.length &&
             allValues.every(v => v > 0);
    } else {
      // Manual: just check range
      return allValues.every(v => v >= 8 && v <= 20) &&
             allValues.every(v => v > 0);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2>Choose Ability Scores</h2>
      
      <div style={{ display: 'flex', gap: 8 }}>
        {[
          { value: 'standard', label: 'Standard Array' },
          { value: 'pointbuy', label: 'Point Buy' },
          { value: 'roll', label: 'Roll 4d6' },
          { value: 'manual', label: 'Manual' },
        ].map(({ value, label }) => (
          <button
            key={value}
            type="button" 
            onClick={() => setMethod(value as Method)}
            style={{
              padding: '8px 16px',
              background: method === value ? '#007acc' : '#f0f0f0',
              color: method === value ? 'white' : 'black',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer'
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {method === 'roll' && (
        <button type="button" onClick={rollAbilities} style={{ padding: '8px 16px', width: 'fit-content' }}>
          Roll Abilities
        </button>
      )}

      {method === 'pointbuy' && (
        <div style={{ 
          padding: '12px', 
          background: '#f0f8ff', 
          border: '1px solid #007acc', 
          borderRadius: 4,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>Point Buy Budget: {getTotalPointsUsed()}/27 points used</span>
          <small style={{ color: '#666' }}>
            Costs: 8-13 = face value - 8, 14 = 7pts, 15 = 9pts
          </small>
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {ABILITIES.map((ability, index) => (
          <div key={ability} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ minWidth: 100, fontWeight: 'bold' }}>{ABILITY_LABELS[index]}</label>
            
            {method === 'standard' ? (
              <select 
                value={getValues()[ability] || ''}
                onChange={(e) => setValue(ability, Number(e.target.value), { shouldValidate: true })}
                style={{ padding: 8, minWidth: 100 }}
              >
                <option value="">Select...</option>
                {STANDARD_ARRAY.map(score => (
                  <option key={score} value={score}>{score}</option>
                ))}
              </select>
            ) : method === 'roll' && rolls.length > 0 ? (
              <select
                value={getValues()[ability] || ''}
                onChange={(e) => setValue(ability, Number(e.target.value), { shouldValidate: true })}
                style={{ padding: 8, minWidth: 100 }}
              >
                <option value="">Select...</option>
                {rolls.map((roll, i) => (
                  <option key={i} value={roll}>{roll}</option>
                ))}
              </select>
            ) : (
              <Controller
                name={ability}
                control={control}
                render={({ field }) => (
                  <input
                    {...field}
                    type="number"
                    min={method === 'pointbuy' ? 8 : 1}
                    max={method === 'pointbuy' ? 15 : 20}
                    style={{ 
                      padding: 8, 
                      width: 80,
                      border: method === 'pointbuy' && getTotalPointsUsed() > 27 ? '2px solid red' : '1px solid #ccc'
                    }}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                )}
              />
            )}
            
            {method === 'pointbuy' && (
              <span style={{ fontSize: 12, color: '#666', minWidth: 60 }}>
                Cost: {getPointCost(getValues()[ability] || 8)}pts
              </span>
            )}
            
            {errors[ability] && (
              <span style={{ color: 'red', fontSize: 14 }}>{errors[ability]?.message}</span>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button type="button" onClick={onBack} style={{ padding: '8px 16px' }}>
          Back
        </button>
        <button 
          type="button" 
          onClick={onNext}
          disabled={!isValid()}
          style={{ 
            padding: '8px 16px', 
            background: isValid() ? '#007acc' : '#ccc',
            color: 'white', 
            border: 'none', 
            borderRadius: 4,
            cursor: isValid() ? 'pointer' : 'not-allowed'
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
