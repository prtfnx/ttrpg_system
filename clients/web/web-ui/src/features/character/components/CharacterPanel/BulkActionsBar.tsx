import clsx from 'clsx';
import { Download, Trash2, Users } from 'lucide-react';
import React from 'react';
import styles from '../CharacterPanel.module.css';

interface BulkActionsBarProps {
  selectedCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onBulkExport: () => void;
  onBulkShare: () => void;
  onBulkDelete: () => void;
}

export const BulkActionsBar: React.FC<BulkActionsBarProps> = ({
  selectedCount,
  onSelectAll,
  onDeselectAll,
  onBulkExport,
  onBulkShare,
  onBulkDelete
}) => (
  <div className={styles.bulkActionsBar}>
    <div className={styles.bulkActionsLeft}>
      <span className={styles.bulkSelectionCount}>{selectedCount} selected</span>
      <button className={styles.bulkActionLink} onClick={onSelectAll}>Select All</button>
      <button className={styles.bulkActionLink} onClick={onDeselectAll}>Deselect All</button>
    </div>
    {selectedCount > 0 && (
      <div className={styles.bulkActionsRight}>
        <button className={clsx(styles.bulkActionBtn, "export")} onClick={onBulkExport}>
          <Download size={14} aria-hidden /> Export Selected
        </button>
        <button className={clsx(styles.bulkActionBtn, "share")} onClick={onBulkShare}>
          <Users size={14} aria-hidden /> Share Selected
        </button>
        <button className={clsx(styles.bulkActionBtn, "delete")} onClick={onBulkDelete}>
          <Trash2 size={14} aria-hidden /> Delete Selected
        </button>
      </div>
    )}
  </div>
);
