import { useChatStore } from '@features/chat';
import { useRacesForCharacterWizard } from '@features/compendium';
import { useEffect, useState } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import styles from './AbilitiesStep.module.css';
import { calculateRacialASI } from './raceData';
import type { AbilitiesStepData } from './schemas';

type AbilityName = keyof AbilitiesStepData;
type Method = 'standard' | 'pointbuy' | 'roll' | 'manual';

const ABILITIES: AbilityName[] = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
const ABILITY_LABELS = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'] as const;
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

export function AbilitiesStep({ onNext: _onNext, onBack: _onBack }: { onNext?: () => void; onBack?: () => void } = {}) {
  const { control, setValue, getValues, watch, formState: { errors } } = useFormContext<AbilitiesStepData>();
  const [method, setMethod] = useState<Method>('standard');
  const [rolls, setRolls] = useState<number[]>([]);
  const addMessage = useChatStore(s => s.addMessage);

  const selectedRace = watch('race' as any) as string ?? '';
  const selectedSubrace = watch('subrace' as any) as string ?? '';
  const { data: races } = useRacesForCharacterWizard();
  const racialASI = races ? calculateRacialASI(selectedRace, selectedSubrace, races) : {};

  const getRacialBonus = (ability: string): number => (racialASI as Record<string, number>)[ability] ?? 0;

  useEffect(() => {
    const resetValue = method === 'pointbuy' ? 8 : 10;
    ABILITIES.forEach(ability => setValue(ability, resetValue, { shouldValidate: true }));
  }, [method]); // Remove setValue from dependencies

  const rollAbilities = () => {
    const newRolls = Array.from({ length: 6 }, () => 
      Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1)
        .sort((a, b) => b - a)
        .slice(0, 3)
        .reduce((sum, roll) => sum + roll, 0)
    ).sort((a, b) => b - a);
    setRolls(newRolls);

    // Auto-assign rolls to abilities in order
    ABILITIES.forEach((ability, i) => {
      setValue(ability, newRolls[i], { shouldValidate: true });
    });

    // Log to chat
    addMessage({
      id: Date.now().toString(),
      user: 'System',
      text: `🎲 Ability roll (4d6 drop lowest): [${newRolls.join(', ')}] → assigned to Str/Dex/Con/Int/Wis/Cha`,
      timestamp: Date.now(),
    });
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

  return (
    <div className={styles.container}>
      <h2>Assign ability scores</h2>
      
      <div className={styles.methodRow}>
        {[
          { value: 'standard', label: 'Standard Array' },
          { value: 'pointbuy', label: 'Point Buy (27 points)' },
          { value: 'roll', label: 'Roll 4d6' },
          { value: 'manual', label: 'Manual' },
        ].map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className={method === value ? styles.methodBtnActive : styles.methodBtnInactive}
            onClick={() => setMethod(value as Method)}
          >
            {label}
          </button>
        ))}
      </div>

      {method === 'roll' && (
        <button type="button" className={styles.rollBtn} onClick={rollAbilities}>
          {rolls.length > 0 ? 'Re-roll Abilities' : 'Roll Abilities'}
        </button>
      )}

      {method === 'pointbuy' && (
        <div className={styles.pointBuyInfo}>
          <span>
            Point Buy (27 points): <span data-testid="points-remaining">{27 - getTotalPointsUsed()}</span> points remaining
          </span>
          <small className={styles.infoNote}>
            Costs: 8-13 = face value - 8, 14 = 7pts, 15 = 9pts
          </small>
        </div>
      )}

      <div className={styles.abilityGrid}>
        {ABILITIES.map((ability, index) => (
          <div key={ability} className={styles.abilityRow}>
            <label className={styles.abilityLabel}>{ABILITY_LABELS[index]}</label>
            
            {method === 'standard' ? (
              <select 
                className={styles.select}
                value={getValues()[ability] || ''}
                onChange={(e) => setValue(ability, Number(e.target.value), { shouldValidate: true })}
              >
                <option value="">Select...</option>
                {STANDARD_ARRAY.map(score => (
                  <option key={score} value={score}>{score}</option>
                ))}
              </select>
            ) : method === 'roll' && rolls.length > 0 ? (
              <select
                className={styles.select}
                value={getValues()[ability] || ''}
                onChange={(e) => setValue(ability, Number(e.target.value), { shouldValidate: true })}
              >
                <option value="">Select...</option>
                {rolls.map((roll, i) => (
                  <option key={i} value={roll}>{roll}</option>
                ))}
              </select>
            ) : method === 'pointbuy' ? (
              <div className={styles.pbRow}>
                <button
                  type="button"
                  className={(getValues()[ability] || 8) > 8 ? styles.decBtnActive : styles.decBtnDisabled}
                  onClick={() => {
                    const current = getValues()[ability] || 8;
                    if (current > 8 && getTotalPointsUsed() >= getPointCost(current)) {
                      setValue(ability, current - 1, { shouldValidate: true });
                    }
                  }}
                  disabled={(getValues()[ability] || 8) <= 8}
                >
                  -
                </button>
                <span className={styles.scoreDisplay}>
                  {getValues()[ability] || 8}
                </span>
                <button
                  type="button"
                  aria-label={`Increase ${ABILITY_LABELS[index]}`}
                  className={(getValues()[ability] || 8) < 15 && getTotalPointsUsed() < 27 ? styles.incBtnActive : styles.incBtnDisabled}
                  onClick={() => {
                    const current = getValues()[ability] || 8;
                    const newValue = current + 1;
                    const currentTotal = getTotalPointsUsed();
                    const additionalCost = getPointCost(newValue) - getPointCost(current);
                    if (newValue <= 15 && currentTotal + additionalCost <= 27) {
                      setValue(ability, newValue, { shouldValidate: true });
                    }
                  }}
                  disabled={(getValues()[ability] || 8) >= 15 || getTotalPointsUsed() >= 27}
                >
                  +
                </button>
                <span
                  data-testid={`${ability}-final`}
                  className={styles.finalScore}
                >
                  Final: {(getValues()[ability] || 8) + getRacialBonus(ability)}
                </span>
              </div>
            ) : (
              <Controller
                name={ability}
                control={control}
                render={({ field }) => (
                  <input
                    {...field}
                    type="number"
                    min={8}
                    max={20}
                    className={styles.input}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                )}
              />
            )}
            
            {method === 'pointbuy' && (
              <span className={styles.costNote}>
                Cost: {getPointCost(getValues()[ability] || 8)}pts
              </span>
            )}
            
            {errors[ability] && (
              <span className={styles.errorText}>{errors[ability]?.message}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
