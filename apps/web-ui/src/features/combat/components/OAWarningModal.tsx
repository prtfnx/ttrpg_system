import { useEffect, useId } from 'react';
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
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className={styles.overlay}>
      <div
        className={styles.modal}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <h3 id={titleId} className={styles.title}>Opportunity Attack!</h3>
        <p id={descriptionId} className={styles.body}>Moving away will provoke a reaction from:</p>
        <ul className={styles.list}>
          {triggers.map((t) => (
            <li key={t.combatant_id}>{t.name}</li>
          ))}
        </ul>
        <div className={styles.actions}>
          <button type="button" className={styles.btnDanger} onClick={onConfirm}>Continue anyway</button>
          <button type="button" className={styles.btnSecondary} onClick={onCancel} autoFocus>Stay put</button>
        </div>
      </div>
    </div>
  );
}
