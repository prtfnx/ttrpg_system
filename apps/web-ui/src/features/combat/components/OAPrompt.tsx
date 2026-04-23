import styles from './OAPrompt.module.css';

interface Props {
  targetName: string;
  onUseReaction(): void;
  onPass(): void;
}

export function OAPrompt({ targetName, onUseReaction, onPass }: Props) {
  return (
    <div className={styles.prompt}>
      <p className={styles.text}>
        <strong>{targetName}</strong> is moving away. Use Reaction for an Opportunity Attack?
      </p>
      <div className={styles.actions}>
        <button className={styles.btnPrimary} onClick={onUseReaction}>Use Reaction</button>
        <button className={styles.btnSecondary} onClick={onPass}>Pass</button>
      </div>
    </div>
  );
}
