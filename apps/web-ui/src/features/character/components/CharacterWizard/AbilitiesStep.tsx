import { useChatStore } from '@features/chat';
import { useRacesForCharacterWizard } from '@features/compendium';
import { Controller, useFormContext } from 'react-hook-form';
import type { Path } from 'react-hook-form';
import styles from './AbilitiesStep.module.css';
import { calculateRacialASI } from './raceData';
import type { AbilitiesStepData } from './schemas';
import type { WizardFormData } from './WizardFormData';

type AbilityName = keyof AbilitiesStepData;
type Method = 'standard' | 'pointbuy' | 'roll' | 'manual';

const ABILITIES: AbilityName[] = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
const ABILITY_LABELS = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'] as const;
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

export function AbilitiesStep({ onNext: _onNext, onBack: _onBack }: { onNext?: () => void; onBack?: () => void } = {}) {
  const { control, setValue, getValues, watch, formState: { errors } } = useFormContext<WizardFormData>();
  const addMessage = useChatStore(s => s.addMessage);

  // Persist method + rolls in form state so they survive step navigation
  const method: Method = (watch('_abilityMethod') as Method) ?? 'standard';
  const rolls: number[] = watch('_abilityRolls') ?? [];
  const rollAssignments: Partial<Record<string, number>> = watch('_rollAssignments') ?? {};

  const setMethod = (m: Method) => {
    setValue('_abilityMethod', m);
    if (m !== 'roll') {
      setValue('_abilityRolls', []);
      setValue('_rollAssignments', {});
    }
    const resetValue = m === 'pointbuy' ? 8 : 10;
    ABILITIES.forEach(ability => setValue(ability, resetValue, { shouldValidate: true }));
  };

  const selectedRace = watch('race') ?? '';
  const selectedSubrace = watch('subrace') ?? '';
  const characterName = watch('name') ?? '';
  const characterClass = watch('class') ?? '';
  const characterBackground = watch('background') ?? '';
  const { data: races } = useRacesForCharacterWizard();
  const racialASI = races ? calculateRacialASI(selectedRace, selectedSubrace, races) : {};

  const getRacialBonus = (ability: string): number => (racialASI as Record<string, number>)[ability] ?? 0;

  const rollAbilities = () => {
    const newRolls = Array.from({ length: 6 }, () => 
      Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1)
        .sort((a, b) => b - a)
        .slice(0, 3)
        .reduce((sum, roll) => sum + roll, 0)
    ).sort((a, b) => b - a);
    setValue('_abilityRolls', newRolls);
    setValue('_rollAssignments', {});
    // Reset ability scores since assignments cleared
    ABILITIES.forEach(ability => setValue(ability, 0, { shouldValidate: true }));

    addMessage({
      id: Date.now().toString(),
      user: 'System',
      text: `Ability roll (4d6 drop lowest): [${newRolls.join(', ')}]`,
      timestamp: Date.now(),
    });
  };

  // Assign a specific roll index to an ability (null = unassign)
  const assignRoll = (ability: AbilityName, rollIndex: number | null) => {
    const current = getValues('_rollAssignments') ?? {};
    // Unassign any other ability that had this roll index
    const cleared: Partial<Record<string, number>> = {};
    for (const [k, v] of Object.entries(current)) {
      if (v !== rollIndex) cleared[k] = v;
    }
    if (rollIndex !== null) {
      cleared[ability] = rollIndex;
      setValue(ability, rolls[rollIndex], { shouldValidate: true });
    } else {
      setValue(ability, 0, { shouldValidate: true });
    }
    setValue('_rollAssignments', cleared);
  };

  // Point buy calculation
  const getPointCost = (score: number): number => {
    if (score <= 8) return 0;
    if (score <= 13) return score - 8;
    if (score === 14) return 7;
    if (score === 15) return 9;
    return 999;
  };

  // Watch ability scores reactively for display
  const abilityValues = watch(ABILITIES as Array<Path<WizardFormData>>) as number[];
  const scores: Record<AbilityName, number> = Object.fromEntries(
    ABILITIES.map((a, i) => [a, abilityValues[i] || (method === 'pointbuy' ? 8 : 0)])
  ) as Record<AbilityName, number>;

  const totalPointsUsed = ABILITIES.reduce((t, a) => t + getPointCost(scores[a] ?? 8), 0);

  // Standard array - track which values are already used
  const usedStandardValues = new Set(ABILITIES.map(a => scores[a]).filter(Boolean));

  // Roll mode - show which roll indices are available vs assigned
  const assignedIndices = new Set(Object.values(rollAssignments).filter(v => v !== undefined) as number[]);

  return (
    <div className={styles.container}>
      {/* Character summary bar */}
      {(characterName || characterClass || characterBackground) && (
        <div className={styles.summaryBar}>
          {characterName && <span className={styles.summaryItem}><strong>{characterName}</strong></span>}
          {characterClass && <span className={styles.summaryItem}>{characterClass.charAt(0).toUpperCase() + characterClass.slice(1)}</span>}
          {characterBackground && <span className={styles.summaryItem}>{characterBackground.charAt(0).toUpperCase() + characterBackground.slice(1)}</span>}
          {Object.keys(racialASI).length > 0 && (
            <span className={styles.summaryItem}>
              Racial bonuses: {Object.entries(racialASI).map(([k, v]) => `+${v} ${k}`).join(', ')}
            </span>
          )}
        </div>
      )}

      <h2>Assign ability scores</h2>

      <div className={styles.methodRow}>
        {[
          { value: 'standard', label: 'Standard Array' },
          { value: 'pointbuy', label: 'Point Buy (27 pts)' },
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
        <div className={styles.rollSection}>
          <button type="button" className={styles.rollBtn} onClick={rollAbilities}>
            {rolls.length > 0 ? 'Re-roll' : 'Roll Abilities'}
          </button>
          {rolls.length > 0 && (
            <div className={styles.rollResults}>
              {rolls.map((r, i) => (
                <span
                  key={i}
                  className={assignedIndices.has(i) ? styles.rollChipUsed : styles.rollChipAvail}
                >
                  {r}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {method === 'pointbuy' && (
        <div className={styles.pointBuyInfo}>
          <span>
            Point Buy: <strong data-testid="points-remaining">{27 - totalPointsUsed}</strong> / 27 pts remaining
          </span>
          <small className={styles.infoNote}>8–13: cost = score−8 &nbsp;|&nbsp; 14 = 7 pts &nbsp;|&nbsp; 15 = 9 pts</small>
        </div>
      )}

      <div className={styles.abilityGrid}>
        {ABILITIES.map((ability, index) => {
          const score = scores[ability] ?? (method === 'pointbuy' ? 8 : 0);
          const racial = getRacialBonus(ability);
          const thisRollIdx = rollAssignments[ability] ?? null;

          return (
            <div key={ability} className={styles.abilityRow}>
              <label className={styles.abilityLabel}>{ABILITY_LABELS[index]}</label>

              {method === 'standard' ? (
                <select
                  className={styles.select}
                  value={score || ''}
                  onChange={(e) => setValue(ability, Number(e.target.value), { shouldValidate: true })}
                >
                  <option value="">—</option>
                  {STANDARD_ARRAY.map(s => (
                    <option key={s} value={s} disabled={s !== score && usedStandardValues.has(s)}>
                      {s}{s !== score && usedStandardValues.has(s) ? ' (used)' : ''}
                    </option>
                  ))}
                </select>
              ) : method === 'roll' && rolls.length > 0 ? (
                <select
                  className={styles.select}
                  value={thisRollIdx ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    assignRoll(ability, val === '' ? null : Number(val));
                  }}
                >
                  <option value="">—</option>
                  {rolls.map((r, i) => {
                    const takenByOther = assignedIndices.has(i) && thisRollIdx !== i;
                    return (
                      <option key={i} value={i} disabled={takenByOther}>
                        {r}{takenByOther ? ' (used)' : ''}
                      </option>
                    );
                  })}
                </select>
              ) : method === 'pointbuy' ? (
                <div className={styles.pbRow}>
                  <button
                    type="button"
                    className={score > 8 ? styles.decBtnActive : styles.decBtnDisabled}
                    onClick={() => { if (score > 8) setValue(ability, score - 1, { shouldValidate: true }); }}
                    disabled={score <= 8}
                  >−</button>
                  <span className={styles.scoreDisplay}>{score}</span>
                  <button
                    type="button"
                    className={score < 15 && totalPointsUsed < 27 ? styles.incBtnActive : styles.incBtnDisabled}
                    onClick={() => {
                      const next = score + 1;
                      const extra = getPointCost(next) - getPointCost(score);
                      if (next <= 15 && totalPointsUsed + extra <= 27) setValue(ability, next, { shouldValidate: true });
                    }}
                    disabled={score >= 15 || totalPointsUsed >= 27}
                  >+</button>
                  <span className={styles.costNote}>{getPointCost(score)} pts</span>
                </div>
              ) : (
                <Controller
                  name={ability as Path<WizardFormData>}
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="number"
                      min={3}
                      max={20}
                      className={styles.input}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  )}
                />
              )}

              {(method !== 'pointbuy') && (
                <span data-testid={`${ability}-final`} className={styles.finalScore}>
                  {score ? `= ${score + racial}${racial > 0 ? ` (+${racial} racial)` : ''}` : ''}
                </span>
              )}
              {method === 'pointbuy' && (
                <span data-testid={`${ability}-final`} className={styles.finalScore}>
                  Final: {score + racial}
                </span>
              )}

              {errors[ability as keyof typeof errors] && (
                <span className={styles.errorText}>{errors[ability as keyof typeof errors]?.message}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
