import styles from './AIControlPanel.module.css';
import { MessageType } from '@lib/websocket';
import { useCombatCommands } from '../hooks/useCombatCommands';
import { useCombatStore } from '../stores/combatStore';

const BEHAVIORS = ['aggressive', 'defensive', 'support', 'cowardly', 'berserker', 'tactical'];

export function AIControlPanel() {
  const combat = useCombatStore((s) => s.combat);
  const { sendDMOverride, sendProtocolMessage } = useCombatCommands();
  if (!combat) return null;

  const npcs = combat.combatants.filter((c) => c.is_npc && !c.is_defeated);
  if (!npcs.length) return null;

  const toggleAI = (combatant_id: string, enabled: boolean) =>
    sendDMOverride({
      actorId: combatant_id,
      overrideType: 'configure_ai',
      aiEnabled: enabled,
    });

  const setBehavior = (combatant_id: string, behavior: string) =>
    sendDMOverride({
      actorId: combatant_id,
      overrideType: 'configure_ai',
      aiBehavior: behavior,
    });

  const triggerAI = (combatant_id: string) =>
    sendProtocolMessage(MessageType.AI_ACTION, { combatant_id });

  return (
    <div className={styles.panel}>
      <div className={styles.title}>NPC AI</div>
      {npcs.map((npc) => (
        <div key={npc.combatant_id} className={styles.row}>
          <span className={styles.name}>{npc.name}</span>
          <select
            className={styles.select}
            value={npc.ai_behavior}
            onChange={(e) => setBehavior(npc.combatant_id, e.target.value)}
          >
            {BEHAVIORS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={npc.ai_enabled}
              onChange={(e) => toggleAI(npc.combatant_id, e.target.checked)}
            />
            Auto
          </label>
          <button
            className={styles.actBtn}
            onClick={() => triggerAI(npc.combatant_id)}
            title="Trigger AI action now"
          >
            Act
          </button>
        </div>
      ))}
    </div>
  );
}
