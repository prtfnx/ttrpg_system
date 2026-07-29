import type { TableInfo } from '@/store';
import { useGameStore } from '@/store';
import { isDM } from '@features/session/types/roles';
import { emitProtocolEvent } from '@lib/websocket/protocolEvents';
import clsx from 'clsx';
import { Copy, ExternalLink, Settings2, Trash2, Users } from 'lucide-react';
import type { FC } from 'react';
import styles from '../TableManagementPanel.module.css';
import { TablePreview } from '../TablePreview';

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
    emitProtocolEvent('protocol-send-message', {
      type: 'table_active_set_all',
      data: { table_id: table.table_id },
    });
  };

  return (
    <div className={clsx(styles.tableCard, isActive && styles.active, isSelected && styles.selected)}>
      {/* Title row with optional bulk checkbox */}
      <div className={styles.tableCardHeader}>
        {isBulkMode && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onSelect(table.table_id)}
            className={styles.bulkCheckbox}
            onClick={e => e.stopPropagation()}
            aria-label={`Select ${table.table_name}`}
          />
        )}
        <button
          type="button"
          className={styles.tableCardName}
          title={table.table_name}
          onClick={() => onOpen(table.table_id)}
        >
          {table.table_name}
        </button>
        {syncBadge}
      </div>

      {/* Proportional preview — uses WASM screenshot for active, placeholder for inactive */}
      <button
        type="button"
        className={styles.tableThumbnail}
        onClick={() => onOpen(table.table_id)}
        aria-label={`Open ${table.table_name} table`}
      >
        <TablePreview table={table} width={130} height={73} />
      </button>

      {/* Meta info */}
      <span className={styles.tableCardMeta}>
        {table.width}×{table.height}
        {table.entity_count ? ` · ${table.entity_count} entities` : ''}
      </span>

      {/* Action buttons row */}
      <div className={styles.tableCardActions}>
        <button onClick={(e) => { e.stopPropagation(); onOpen(table.table_id); }} className={styles.actionBtn} title="Open" aria-label={`Open ${table.table_name}`}>
          <ExternalLink size={12} aria-hidden />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onSettings(table.table_id); }} className={styles.actionBtn} title="Settings" aria-label={`Settings for ${table.table_name}`}>
          <Settings2 size={12} aria-hidden />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDuplicate(table.table_id); }} className={styles.actionBtn} title="Duplicate" aria-label={`Duplicate ${table.table_name}`}>
          <Copy size={12} aria-hidden />
        </button>
        {canSetForAll && (
          <button onClick={handleSetForAll} className={styles.actionBtn} title="Switch all players" aria-label={`Switch all players to ${table.table_name}`}>
            <Users size={12} aria-hidden />
          </button>
        )}
        <button onClick={(e) => { e.stopPropagation(); onDelete(table.table_id); }} className={clsx(styles.actionBtn, styles.actionBtnDelete)} title="Delete" aria-label={`Delete ${table.table_name}`}>
          <Trash2 size={12} aria-hidden />
        </button>
      </div>
    </div>
  );
};

