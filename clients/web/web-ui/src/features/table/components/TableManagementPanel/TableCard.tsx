import type { TableInfo } from '@/store';
import { useGameStore } from '@/store';
import { isDM } from '@features/session/types/roles';
import clsx from 'clsx';
import { Copy, ExternalLink, Settings2, Trash2, Users } from 'lucide-react';
import type { FC } from 'react';
import styles from '../TableManagementPanel.module.css';
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
  table, isActive, isBulkMode, isSelected,
  onSelect, onOpen, onSettings, onDuplicate, onDelete, syncBadge
}) => {
  const sessionRole = useGameStore(s => s.sessionRole);
  const canSetForAll = isDM(sessionRole);

  const handleSetForAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('protocol-send-message', {
      detail: { type: 'table_active_set_all', data: { table_id: table.table_id } }
    }));
  };

  return (
    <div className={clsx(styles.tableCard, isActive && styles.active, isSelected && styles.selected)}>
      {isBulkMode && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelect(table.table_id)}
          className={styles.bulkCheckbox}
          onClick={e => e.stopPropagation()}
        />
      )}

      <div className={styles.tableCardInfo} onClick={() => onOpen(table.table_id)}>
        <span className={styles.tableCardName} title={table.table_name}>{table.table_name}</span>
        <span className={styles.tableCardMeta}>
          {table.width}×{table.height}
          {table.entity_count ? ` · ${table.entity_count}e` : ''}
          {' · '}{formatDate(table.created_at)}
        </span>
      </div>

      <div className={styles.tableCardActions}>
        {syncBadge}
        <button onClick={(e) => { e.stopPropagation(); onOpen(table.table_id); }} className={styles.actionBtn} title="Open">
          <ExternalLink size={12} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onSettings(table.table_id); }} className={styles.actionBtn} title="Settings">
          <Settings2 size={12} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDuplicate(table.table_id); }} className={styles.actionBtn} title="Duplicate">
          <Copy size={12} />
        </button>
        {canSetForAll && (
          <button onClick={handleSetForAll} className={styles.actionBtn} title="Switch all players">
            <Users size={12} />
          </button>
        )}
        <button onClick={(e) => { e.stopPropagation(); onDelete(table.table_id); }} className={clsx(styles.actionBtn, styles.actionBtnDelete)} title="Delete">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
};

