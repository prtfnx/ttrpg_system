import styles from './InitiativePanel.module.css';
import { useGameStore } from '@/store';
import { isDM } from '@features/session/types/roles';
import { ProtocolService } from '@lib/api';
import { createMessage, MessageType } from '@lib/websocket';
import { useCombatStore } from '../stores/combatStore';
import { ConditionBadges } from './ConditionBadges';

export function InitiativePanel() {
  const combat = useCombatStore((s) => s.combat);
  const role = useGameStore((s) => s.sessionRole);

  if (!combat || combat.phase === 'inactive') return null;

  const active = combat.combatants.filter((c) => !c.is_defeated);
  const current = active[combat.current_turn_index % Math.max(active.length, 1)];

  const skipTurn = (combatant_id: string) => {
    ProtocolService.getProtocol()?.sendMessage(
      createMessage(MessageType.TURN_SKIP, { combatant_id })
    );
  };

  const removeCombatant = (combatant_id: string) => {
    ProtocolService.getProtocol()?.sendMessage(
      createMessage(MessageType.INITIATIVE_REMOVE, { combatant_id })
    );
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span>Round {combat.round_number}</span>
        <span className={styles.phase}>{combat.phase}</span>
      </div>
      <ul className={styles.list}>
        {combat.combatants.map((c) => (
          <li
            key={c.combatant_id}
            className={[
              styles.item,
              c.combatant_id === current?.combatant_id ? styles.active : '',
              c.is_defeated ? styles.defeated : '',
            ].join(' ')}
          >
            <span className={styles.initiative}>{c.initiative ?? '—'}</span>
            <span className={styles.name}>{c.name}</span>
            {c.hp !== null && (
              <span className={styles.hp}>
                {c.hp_descriptor ?? `${c.hp}/${c.max_hp}`}
              </span>
            )}
            <ConditionBadges conditions={c.conditions} />
            {isDM(role) && !c.is_defeated && (
              <div className={styles.actions}>
                <button onClick={() => skipTurn(c.combatant_id)} title="Skip turn">⏭</button>
                <button onClick={() => removeCombatant(c.combatant_id)} title="Remove">✕</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
