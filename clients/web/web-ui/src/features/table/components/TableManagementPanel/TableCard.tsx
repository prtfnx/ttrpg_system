import clsx from 'clsx';
import type { FC } from 'react';
import type { TableInfo } from '@/store';
import styles from '../TableManagementPanel.module.css';
import { TablePreview } from '../TablePreview';
import { formatDate } from './utils';

interface TableCardProps {
  table: TableInfo;
  isActive: boolean;
  isBulkMode: boolean;
  isSelected: boolean;
  onSelect: (tableId: string) => void;
  onOpen: (tableId: string) => void;
  onSettings: (tableId: string) => void;
  onDuplicate: (tableId: string) => void;
  onDelete: (tableId: string) => void;
  syncBadge: React.ReactNode;
}

export const TableCard: FC<TableCardProps> = ({
  table,
  isActive,
  isBulkMode,
  isSelected,
  onSelect,
  onOpen,
  onSettings,
  onDuplicate,
  onDelete,
  syncBadge
}) => {
  const handleClick = () => {
    if (isBulkMode) {
      onSelect(table.table_id);
    } else {
      onOpen(table.table_id);
    }
  };

  return (
    <div 
      className={clsx(
        styles.tableCard,
        isActive && styles.active,
        isBulkMode && styles.bulkMode,
        isSelected && styles.selected
      )}
    >
      {isBulkMode && (
        <div className={styles.bulkCheckboxWrapper}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onSelect(table.table_id)}
            className={styles.bulkCheckbox}
          />
        </div>
      )}

      {syncBadge}

      <div className={styles.tablePreview} onClick={handleClick}>
        <TablePreview table={table} width={160} height={120} />
      </div>

      <div className={styles.tableCardInfo} onClick={handleClick}>
        <h4 className={styles.tableCardName} title={table.table_name}>
          {table.table_name}
        </h4>
        <div className={styles.tableCardMeta}>
          <span className={styles.metaItem}>
            <span className={styles.metaIcon}>📐</span>
            <span>{table.width} × {table.height}</span>
          </span>
          {table.entity_count !== undefined && table.entity_count > 0 && (
            <>
              <span className={styles.metaSeparator}>•</span>
              <span className={styles.metaItem}>
                <span className={styles.metaIcon}>🎭</span>
                <span>{table.entity_count}</span>
              </span>
            </>
          )}
        </div>
        <div className={styles.tableCardDate}>
          {formatDate(table.created_at)}
        </div>
      </div>

      <div className={styles.tableCardActions}>
        {!isBulkMode && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onOpen(table.table_id); }}
              className={clsx(styles.actionBtn, styles.actionBtnOpen)}
              title="Open table"
            >
              <span className={styles.actionIcon}>↗</span>
              <span className={styles.actionText}>Open</span>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onSettings(table.table_id); }}
              className={clsx(styles.actionBtn, styles.actionBtnSettings)}
              title="Settings"
            >
              <span className={styles.actionIcon}>⚙️</span>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDuplicate(table.table_id); }}
              className={clsx(styles.actionBtn, styles.actionBtnDuplicate)}
              title="Duplicate"
            >
              <span className={styles.actionIcon}>📋</span>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(table.table_id); }}
              className={clsx(styles.actionBtn, styles.actionBtnDelete)}
              title="Delete"
            >
              <span className={styles.actionIcon}>🗑️</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
};
