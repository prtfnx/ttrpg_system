import { useGameStore } from '@/store';
import { isDM } from '@features/session/types/roles';
import { MessageType } from '@lib/websocket';
import { Modal } from '@shared/components';
import { useCombatCommands } from '../hooks/useCombatCommands';
import { useEncounterStore } from '../stores/encounterStore';
import styles from './EncounterView.module.css';

const ignoreClose = () => {};

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
      <Modal isOpen onClose={() => clearEncounter(null)} title={encounter.title} size="small">
        <div className={styles.encounterContent}>
          <p className={styles.result}>{encounter.result}</p>
          <button
            type="button"
            className={styles.choiceBtn}
            onClick={() => clearEncounter(null)}
            autoFocus
          >
            Close
          </button>
        </div>
      </Modal>
    );
  }

  const submittedChoice = userId != null
    ? encounter.player_choices?.[String(userId)]
    : undefined;

  if (pendingRoll) {
    const skill = pendingRoll.roll_skill || pendingRoll.roll_ability || 'Skill';
    const dc = pendingRoll.roll_dc;
    return (
      <Modal
        isOpen
        onClose={ignoreClose}
        title="Roll required"
        size="small"
        closeOnEscape={false}
        closeOnOverlayClick={false}
        showCloseButton={false}
      >
        <div className={styles.encounterContent}>
          <p className={styles.desc}>
            {skill} check{dc != null ? ` - DC ${dc}` : ''}
          </p>
          <button
            type="button"
            className={styles.choiceBtn}
            onClick={() => send(MessageType.ENCOUNTER_ROLL, {
              encounter_id: encounter.encounter_id,
              choice_id: pendingRoll.choice_id,
            })}
            autoFocus
          >
            Roll {skill}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen
      onClose={ignoreClose}
      title={encounter.title}
      size="small"
      closeOnEscape={false}
      closeOnOverlayClick={false}
      showCloseButton={false}
    >
      <div className={styles.encounterContent}>
        <p className={styles.desc}>{encounter.description}</p>
        {submittedChoice ? (
          <p className={styles.result}>Choice submitted. Waiting for the GM.</p>
        ) : (
          <div className={styles.choices}>
            {encounter.choices.map((c, index) => (
              <button type="button" key={c.choice_id} className={styles.choiceBtn} onClick={() => makeChoice(c.choice_id)} autoFocus={index === 0}>
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
            type="button"
            className={styles.choiceBtn}
            onClick={() => send(MessageType.ENCOUNTER_END, { encounter_id: encounter.encounter_id })}
          >
            End Encounter
          </button>
        )}
      </div>
    </Modal>
  );
}
