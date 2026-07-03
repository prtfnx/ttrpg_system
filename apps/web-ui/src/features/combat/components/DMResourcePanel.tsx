import { useState } from 'react';
import { useCombatCommands, type DMResourceType } from '../hooks/useCombatCommands';
import styles from './DMCombatPanel.module.css';

interface DMResourcePanelProps {
  combatantId: string;
}

export function DMResourcePanel({ combatantId }: DMResourcePanelProps) {
  const { sendDMOverride } = useCombatCommands();
  const [movementFeet, setMovementFeet] = useState('30');
  const disabled = !combatantId;

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
    </div>
  );
}
