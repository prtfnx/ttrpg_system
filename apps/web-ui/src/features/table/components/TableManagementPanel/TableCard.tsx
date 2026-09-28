import type { TableInfo } from '@/store';
import { useGameStore } from '@/store';
import { isDM } from '@features/session/types/roles';
import { emitProtocolEvent } from '@lib/websocket/protocolEvents';
import clsx from 'clsx';
import { Copy, ExternalLink, Settings2, Trash2, Users } from 'lucide-react';
import { type FC, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from '../TableManagementPanel.module.css';
import { TablePreview } from '../TablePreview';
import { tableThumbnailService } from '../../services/tableThumbnail.service';

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
  const previewButtonRef = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState({ left: 16, top: 16 });

  const showExpandedPreview = () => {
    const rect = previewButtonRef.current?.getBoundingClientRect();
    if (rect) {
      const width = Math.min(520, window.innerWidth - 32);
      const height = width * 9 / 16;
      setPopoverPosition({
        left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
        top: rect.bottom + height + 12 <= window.innerHeight
          ? rect.bottom + 8
          : Math.max(16, rect.top - height - 8),
      });
    }
    tableThumbnailService.setHoveredTable(table.table_id);
    setExpanded(true);
  };

  const hideExpandedPreview = () => {
    tableThumbnailService.setHoveredTable(null);
    setExpanded(false);
  };

  useEffect(() => {
    if (!expanded) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hideExpandedPreview();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [expanded]);

  useEffect(() => () => tableThumbnailService.setHoveredTable(null), []);

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
        ref={previewButtonRef}
        type="button"
        className={styles.tableThumbnail}
        onClick={() => onOpen(table.table_id)}
        onMouseEnter={showExpandedPreview}
        onMouseLeave={hideExpandedPreview}
        onFocus={showExpandedPreview}
        onBlur={hideExpandedPreview}
        aria-label={`Open ${table.table_name} table`}
        aria-describedby={expanded ? `table-preview-${table.table_id}` : undefined}
      >
        <TablePreview table={table} />
      </button>
      {expanded && createPortal(
        <div
          id={`table-preview-${table.table_id}`}
          role="tooltip"
          className={styles.tablePreviewPopover}
          style={popoverPosition}
        >
          <TablePreview table={table} priority />
        </div>,
        document.body,
      )}

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

