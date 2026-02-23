import { Copy, Trash2 } from 'lucide-react';
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
        <Copy size={13} /> Duplicate
      </button>
      <button 
        onClick={onDelete}
        className={styles.bulkDeleteButton}
        title="Delete selected"
      >
        <Trash2 size={13} /> Delete
      </button>
    </div>
  </div>
);
