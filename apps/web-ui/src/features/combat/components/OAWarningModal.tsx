import styles from './OAWarningModal.module.css';

interface Trigger {
  combatant_id: string;
  name: string;
}

interface Props {
  triggers: Trigger[];
  onConfirm(): void;
  onCancel(): void;
}

export function OAWarningModal({ triggers, onConfirm, onCancel }: Props) {
  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h3 className={styles.title}>Opportunity Attack!</h3>
        <p className={styles.body}>Moving away will provoke a reaction from:</p>
        <ul className={styles.list}>
          {triggers.map((t) => (
            <li key={t.combatant_id}>{t.name}</li>
          ))}
        </ul>
        <div className={styles.actions}>
          <button className={styles.btnDanger} onClick={onConfirm}>Continue anyway</button>
          <button className={styles.btnSecondary} onClick={onCancel}>Stay put</button>
        </div>
      </div>
    </div>
  );
}
