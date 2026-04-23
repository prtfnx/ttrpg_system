import { useGameStore } from '@/store';
import { isDM } from '@features/session/types/roles';
import { ProtocolService } from '@lib/api';
import { createMessage, MessageType } from '@lib/websocket';
import type { Combatant } from '../stores/combatStore';
import { useCombatStore } from '../stores/combatStore';
import { ConditionBadges } from './ConditionBadges';
import styles from './InitiativePanel.module.css';

function HpBar({ c }: { c: Combatant }) {
  if (c.hp === null || c.max_hp === null || c.max_hp === 0) return null;
  const pct = Math.max(0, Math.min(100, (c.hp / c.max_hp) * 100));
  const tempPct = Math.min(100 - pct, (c.temp_hp / c.max_hp) * 100);
  const color = pct > 50 ? 'var(--status-success-text)' : pct > 25 ? 'var(--status-warning-text)' : 'var(--status-error-text)';
  return (
    <div className={styles.hpBar} title={c.hp_descriptor ?? `${c.hp}/${c.max_hp} HP${c.temp_hp > 0 ? ` (+${c.temp_hp} temp)` : ''}`}>
      <div className={styles.hpFill} style={{ width: `${pct}%`, background: color }} />
      {tempPct > 0 && <div className={styles.tempHpFill} style={{ width: `${tempPct}%`, left: `${pct}%` }} />}
    </div>
  );
}

function DeathSavePips({ successes, failures }: { successes: number; failures: number }) {
  return (
    <div className={styles.deathSaves}>
      {[0, 1, 2].map((i) => (
        <span key={`s${i}`} className={[styles.pip, i < successes ? styles.pipSuccess : styles.pipEmpty].join(' ')} />
      ))}
      {[0, 1, 2].map((i) => (
        <span key={`f${i}`} className={[styles.pip, i < failures ? styles.pipFail : styles.pipEmpty].join(' ')} />
      ))}
    </div>
  );
}

export function InitiativePanel() {
  const combat = useCombatStore((s) => s.combat);
  const role = useGameStore((s) => s.sessionRole);
  const userId = useGameStore((s) => s.userId);

  if (!combat || combat.phase === 'inactive') return null;

  const active = combat.combatants.filter((c) => !c.is_defeated);
  const current = active[combat.current_turn_index % Math.max(active.length, 1)];

  const isControlledByMe = (c: Combatant) =>
    userId !== null && c.controlled_by.includes(String(userId));

  const rollInitiative = (combatant_id: string) => {
    ProtocolService.getProtocol()?.sendMessage(
      createMessage(MessageType.INITIATIVE_ROLL, { combatant_id })
    );
  };

  const rollDeathSave = (combatant_id: string) => {
    ProtocolService.getProtocol()?.sendMessage(
      createMessage(MessageType.DEATH_SAVE_ROLL, { combatant_id })
    );
  };

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
            <div className={styles.nameCol}>
              <span className={styles.name}>{c.name}</span>
              <HpBar c={c} />
            </div>
            {c.concentration_spell && (
              <span className={styles.concentrating} title={`Concentrating: ${c.concentration_spell}`}>🔮</span>
            )}
            {c.surprised && (
              <span className={styles.surprisedBadge} title="Surprised — loses first turn">⚡</span>
            )}
            {c.hp === 0 && (isDM(role) || isControlledByMe(c)) && (
              <button className={styles.rollInitBtn} onClick={() => rollDeathSave(c.combatant_id)} title="Roll death save">💀</button>
            )}
            {c.hp === 0 && ((c.death_save_successes ?? 0) > 0 || (c.death_save_failures ?? 0) > 0) && (
              <DeathSavePips successes={c.death_save_successes ?? 0} failures={c.death_save_failures ?? 0} />
            )}
            {c.initiative === null && isControlledByMe(c) && (
              <button className={styles.rollInitBtn} onClick={() => rollInitiative(c.combatant_id)} title="Roll initiative">🎲</button>
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
