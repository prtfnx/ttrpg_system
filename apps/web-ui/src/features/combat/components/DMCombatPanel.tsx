import { useState } from 'react';
import styles from './DMCombatPanel.module.css';
import { ProtocolService } from '@lib/api';
import { createMessage, MessageType } from '@lib/websocket';
import { useCombatStore } from '../stores/combatStore';

export function DMCombatPanel() {
  const combat = useCombatStore((s) => s.combat);
  const [selectedId, setSelectedId] = useState('');
  const [hpValue, setHpValue] = useState('');
  const [damageValue, setDamageValue] = useState('');
  const [conditionType, setConditionType] = useState('poisoned');
  const [conditionDuration, setConditionDuration] = useState('1');

  if (!combat) return null;

  const send = (type: MessageType, data: Record<string, unknown>) =>
    ProtocolService.getProtocol()?.sendMessage(createMessage(type, data));

  const startCombat = () => send(MessageType.COMBAT_START, { table_id: combat.table_id });
  const endCombat = () => send(MessageType.COMBAT_END, {});

  const setHp = () => {
    if (!selectedId || !hpValue) return;
    send(MessageType.DM_SET_HP, { combatant_id: selectedId, hp: Number(hpValue) });
    setHpValue('');
  };

  const applyDamage = () => {
    if (!selectedId || !damageValue) return;
    send(MessageType.DM_APPLY_DAMAGE, { combatant_id: selectedId, amount: Number(damageValue) });
    setDamageValue('');
  };

  const addCondition = () => {
    if (!selectedId) return;
    send(MessageType.CONDITION_ADD, {
      combatant_id: selectedId,
      condition: conditionType,
      duration: Number(conditionDuration),
      source: 'dm',
    });
  };

  const revertLast = () => send(MessageType.DM_REVERT_ACTION, {});

  return (
    <div className={styles.panel}>
      <div className={styles.combatControls}>
        <button className={styles.startBtn} onClick={startCombat}>Start Combat</button>
        <button className={styles.endBtn} onClick={endCombat}>End Combat</button>
        <button className={styles.revertBtn} onClick={revertLast} title="Revert last action">↩ Revert</button>
      </div>

      <div className={styles.section}>
        <select
          className={styles.select}
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          <option value="">— Select combatant —</option>
          {combat.combatants.map((c) => (
            <option key={c.combatant_id} value={c.combatant_id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.section}>
        <label className={styles.label}>Set HP</label>
        <div className={styles.row}>
          <input
            className={styles.input}
            type="number"
            placeholder="HP"
            value={hpValue}
            onChange={(e) => setHpValue(e.target.value)}
          />
          <button className={styles.btn} onClick={setHp}>Set</button>
        </div>
      </div>

      <div className={styles.section}>
        <label className={styles.label}>Apply Damage</label>
        <div className={styles.row}>
          <input
            className={styles.input}
            type="number"
            placeholder="Amount"
            value={damageValue}
            onChange={(e) => setDamageValue(e.target.value)}
          />
          <button className={styles.btn} onClick={applyDamage}>Apply</button>
        </div>
      </div>

      <div className={styles.section}>
        <label className={styles.label}>Add Condition</label>
        <div className={styles.row}>
          <select
            className={styles.select}
            value={conditionType}
            onChange={(e) => setConditionType(e.target.value)}
          >
            {['poisoned','blinded','stunned','paralyzed','charmed','frightened','grappled','prone','restrained','exhaustion','incapacitated','unconscious','concentration'].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input
            className={styles.input}
            type="number"
            min="1"
            placeholder="Rounds"
            value={conditionDuration}
            onChange={(e) => setConditionDuration(e.target.value)}
          />
          <button className={styles.btn} onClick={addCondition}>Add</button>
        </div>
      </div>
    </div>
  );
}
