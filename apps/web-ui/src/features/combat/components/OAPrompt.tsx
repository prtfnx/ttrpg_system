import { useState } from 'react';
import type { AvailableCombatAction } from '../stores/combatStore';
import styles from './OAPrompt.module.css';

interface Props {
  targetName: string;
  allowResolution?: boolean;
  actions?: Pick<AvailableCombatAction, 'action_id' | 'name'>[];
  onUseReaction(actionId: string): void;
  onPass(): void;
}

export function OAPrompt({ targetName, actions = [], allowResolution = false, onUseReaction, onPass }: Props) {
  const [selected, setSelected] = useState('');
  const action = actions.find((item) => item.action_id === selected) ?? actions[0];
  return (
    <div className={styles.prompt}>
      <p className={styles.text}>
        <strong>{targetName}</strong> is moving away. Use Reaction for an Opportunity Attack?
      </p>
      {action ? <label>
        Attack
        <select value={action.action_id} onChange={(event) => setSelected(event.target.value)}>
          {actions.map((item) => <option key={item.action_id} value={item.action_id}>{item.name}</option>)}
        </select>
      </label> : <p>No supported melee attack. Ask the DM to resolve this reaction.</p>}
      {!allowResolution && <p>Ask the DM to resolve opportunity attack timing.</p>}
      <div className={styles.actions}>
        <button className={styles.btnPrimary} disabled={!action || !allowResolution} onClick={() => action && onUseReaction(action.action_id)}>Use Reaction</button>
        <button className={styles.btnSecondary} onClick={onPass}>Pass</button>
      </div>
    </div>
  );
}
