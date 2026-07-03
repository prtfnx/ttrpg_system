import { useEffect, useState } from 'react';
import { useCombatCommands, type DMResourceType } from '../hooks/useCombatCommands';
import styles from './DMCombatPanel.module.css';

interface DMResourcePanelProps {
  combatantId: string;
  spellSlotLevels?: number[];
}

export function DMResourcePanel({
  combatantId,
  spellSlotLevels = [],
}: DMResourcePanelProps) {
  const { sendDMOverride } = useCombatCommands();
  const [movementFeet, setMovementFeet] = useState('30');
  const [slotLevel, setSlotLevel] = useState('');
  const disabled = !combatantId;
  const availableSlotLevels = [...new Set(spellSlotLevels)]
    .filter((level) => Number.isInteger(level) && level >= 1 && level <= 9)
    .sort((left, right) => left - right);

  useEffect(() => {
    setSlotLevel(
      availableSlotLevels.length > 0
        ? String(availableSlotLevels[0])
        : '',
    );
  }, [availableSlotLevels.join(',')]);

  const restoreResource = (resource: DMResourceType) => {
    if (disabled) return;
    sendDMOverride({
      actorId: combatantId,
      overrideType: 'grant_resource',
      resource,
      value: 1,
    });
  };

  const grantMovement = () => {
    const value = Number(movementFeet);
    if (disabled || !Number.isFinite(value) || value <= 0) return;
    sendDMOverride({
      actorId: combatantId,
      overrideType: 'grant_resource',
      resource: 'movement',
      value,
    });
  };

  const restoreSpellSlot = () => {
    const value = Number(slotLevel);
    if (disabled || !Number.isInteger(value) || value < 1 || value > 9) return;
    sendDMOverride({
      actorId: combatantId,
      overrideType: 'restore_spell_slot',
      slotLevel: value,
    });
  };

  return (
    <div className={styles.section} aria-label="Resource overrides">
      <label className={styles.label}>Resource Overrides</label>
      <div className={styles.row}>
        <button
          className={styles.btn}
          disabled={disabled}
          onClick={() => restoreResource('action')}
        >
          Restore Action
        </button>
        <button
          className={styles.btn}
          disabled={disabled}
          onClick={() => restoreResource('bonus_action')}
        >
          Restore Bonus
        </button>
        <button
          className={styles.btn}
          disabled={disabled}
          onClick={() => restoreResource('reaction')}
        >
          Restore Reaction
        </button>
      </div>
      <div className={styles.row}>
        <input
          className={styles.input}
          type="number"
          min="1"
          placeholder="Movement feet"
          value={movementFeet}
          onChange={(event) => setMovementFeet(event.target.value)}
        />
        <button className={styles.btn} disabled={disabled} onClick={grantMovement}>
          Grant Movement
        </button>
      </div>
      {availableSlotLevels.length > 0 && (
        <div className={styles.row}>
          <select
            className={styles.select}
            aria-label="Spell slot level"
            value={slotLevel}
            onChange={(event) => setSlotLevel(event.target.value)}
          >
            {availableSlotLevels.map((level) => (
              <option key={level} value={level}>Level {level}</option>
            ))}
          </select>
          <button className={styles.btn} disabled={disabled} onClick={restoreSpellSlot}>
            Restore Spell Slot
          </button>
        </div>
      )}
    </div>
  );
}
