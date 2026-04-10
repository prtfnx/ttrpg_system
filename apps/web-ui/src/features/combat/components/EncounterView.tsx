import styles from './EncounterView.module.css';
import { ProtocolService } from '@lib/api';
import { createMessage, MessageType } from '@lib/websocket';
import { useEncounterStore } from '../stores/encounterStore';

export function EncounterView() {
  const encounter = useEncounterStore((s) => s.encounter);

  if (!encounter || encounter.phase === 'idle') return null;

  const send = (type: MessageType, data: Record<string, unknown>) =>
    ProtocolService.getProtocol()?.sendMessage(createMessage(type, data));

  const makeChoice = (choice_id: string) =>
    send(MessageType.ENCOUNTER_CHOICE, { encounter_id: encounter.encounter_id, choice_id });

  if (encounter.phase === 'resolved') {
    return (
      <div className={styles.modal}>
        <div className={styles.card}>
          <h3 className={styles.title}>{encounter.title}</h3>
          <p className={styles.result}>{encounter.result}</p>
          <button
            className={styles.choiceBtn}
            onClick={() => send(MessageType.ENCOUNTER_END, { encounter_id: encounter.encounter_id })}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (encounter.phase === 'rolling' && encounter.pending_roll) {
    const { skill, dc } = encounter.pending_roll;
    return (
      <div className={styles.modal}>
        <div className={styles.card}>
          <h3 className={styles.title}>Roll Required</h3>
          <p className={styles.desc}>
            {skill} check — DC {dc}
          </p>
          <button
            className={styles.choiceBtn}
            onClick={() => send(MessageType.ENCOUNTER_ROLL, {
              encounter_id: encounter.encounter_id,
              choice_id: encounter.pending_roll!.choice_id,
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
        <div className={styles.choices}>
          {encounter.choices.map((c) => (
            <button key={c.id} className={styles.choiceBtn} onClick={() => makeChoice(c.id)}>
              {c.text}
              {c.requires_roll && c.skill && (
                <span className={styles.rollHint}> [{c.skill} DC {c.dc}]</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
