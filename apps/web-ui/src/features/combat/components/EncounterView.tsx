import { useGameStore } from '@/store';
import { isDM } from '@features/session/types/roles';
import { MessageType } from '@lib/websocket';
import { useCombatCommands } from '../hooks/useCombatCommands';
import { useEncounterStore } from '../stores/encounterStore';
import styles from './EncounterView.module.css';

export function EncounterView() {
  const encounter = useEncounterStore((s) => s.encounter);
  const clearEncounter = useEncounterStore((s) => s.setEncounter);
  const userId = useGameStore((s) => s.userId);
  const sessionRole = useGameStore((s) => s.sessionRole);
  const { sendProtocolMessage } = useCombatCommands();

  if (!encounter) return null;

  const send = (type: MessageType, data: Record<string, unknown>) =>
    sendProtocolMessage(type, data);

  const makeChoice = (choice_id: string) =>
    send(MessageType.ENCOUNTER_CHOICE, { encounter_id: encounter.encounter_id, choice_id });

  const pendingRoll = userId != null
    ? encounter.pending_rolls?.[String(userId)]
    : undefined;

  if (encounter.phase === 'completed') {
    return (
      <div className={styles.modal}>
        <div className={styles.card}>
          <h3 className={styles.title}>{encounter.title}</h3>
          <p className={styles.result}>{encounter.result}</p>
          <button
            className={styles.choiceBtn}
            onClick={() => clearEncounter(null)}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const submittedChoice = userId != null
    ? encounter.player_choices?.[String(userId)]
    : undefined;

  if (pendingRoll) {
    const skill = pendingRoll.roll_skill || pendingRoll.roll_ability || 'Skill';
    const dc = pendingRoll.roll_dc;
    return (
      <div className={styles.modal}>
        <div className={styles.card}>
          <h3 className={styles.title}>Roll Required</h3>
          <p className={styles.desc}>
            {skill} check{dc != null ? ` - DC ${dc}` : ''}
          </p>
          <button
            className={styles.choiceBtn}
            onClick={() => send(MessageType.ENCOUNTER_ROLL, {
              encounter_id: encounter.encounter_id,
              choice_id: pendingRoll.choice_id,
            })}
          >
            Roll {skill}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.modal}>
      <div className={styles.card}>
        <h3 className={styles.title}>{encounter.title}</h3>
        <p className={styles.desc}>{encounter.description}</p>
        {submittedChoice ? (
          <p className={styles.result}>Choice submitted. Waiting for the GM.</p>
        ) : (
          <div className={styles.choices}>
            {encounter.choices.map((c) => (
              <button key={c.choice_id} className={styles.choiceBtn} onClick={() => makeChoice(c.choice_id)}>
                {c.text}
                {c.requires_roll && (c.roll_skill || c.roll_ability) && (
                  <span className={styles.rollHint}>
                    {' '}[{c.roll_skill || c.roll_ability}{c.roll_dc != null ? ` DC ${c.roll_dc}` : ''}]
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        {isDM(sessionRole) && (
          <button
            className={styles.choiceBtn}
            onClick={() => send(MessageType.ENCOUNTER_END, { encounter_id: encounter.encounter_id })}
          >
            End Encounter
          </button>
        )}
      </div>
    </div>
  );
}
