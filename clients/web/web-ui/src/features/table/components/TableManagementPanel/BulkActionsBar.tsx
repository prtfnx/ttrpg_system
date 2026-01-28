import type { FC } from 'react';
import styles from '../TableManagementPanel.module.css';

interface BulkActionsBarProps {
  selectedCount: number;
  onDuplicate: () => void;
  onDelete: () => void;
}

export const BulkActionsBar: FC<BulkActionsBarProps> = ({ 
  selectedCount, 
  onDuplicate, 
  onDelete 
}) => (
  <div className={styles.bulkActionsBar}>
    <span className={styles.bulkCount}>{selectedCount} selected</span>
    <div className={styles.bulkButtons}>
      <button 
        onClick={onDuplicate}
        className={styles.bulkDuplicateButton}
        title="Duplicate selected"
      >
        📋 Duplicate
      </button>
      <button 
        onClick={onDelete}
        className={styles.bulkDeleteButton}
        title="Delete selected"
      >
        🗑️ Delete
      </button>
    </div>
  </div>
);
