import { useId } from 'react';
import { Modal } from '@shared/components';
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
  const descriptionId = useId();

  return (
    <Modal
      isOpen
      onClose={onCancel}
      title="Opportunity Attack!"
      role="alertdialog"
      ariaDescribedBy={descriptionId}
      size="small"
      showCloseButton={false}
      closeOnOverlayClick={false}
    >
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
    </Modal>
  );
}
