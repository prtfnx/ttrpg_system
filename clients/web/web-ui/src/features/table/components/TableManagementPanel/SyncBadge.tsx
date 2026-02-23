import clsx from 'clsx';
import { AlertTriangle, Cloud, HardDrive, RefreshCw } from 'lucide-react';
import type { FC } from 'react';
import styles from '../TableManagementPanel.module.css';

interface SyncBadgeProps {
  syncStatus?: 'local' | 'syncing' | 'synced' | 'error';
  lastSyncTime?: number;
  syncError?: string;
  formatRelativeTime: (timestamp?: number) => string;
}

export const SyncBadge: FC<SyncBadgeProps> = ({ 
  syncStatus, 
  lastSyncTime, 
  syncError, 
  formatRelativeTime 
}) => {
  const status = syncStatus ?? 'synced';

  const title = {
    local: 'Local only — not synced',
    syncing: 'Syncing...',
    synced: `Synced ${formatRelativeTime(lastSyncTime)}`,
    error: `Sync error: ${syncError ?? 'Unknown'}`,
  }[status];

  const icon = {
    local: <HardDrive size={12} />,
    syncing: <span className={styles.syncSpin}><RefreshCw size={12} /></span>,
    synced: <Cloud size={12} />,
    error: <AlertTriangle size={12} />,
  }[status];

  return (
    <div
      className={clsx(
        styles.syncBadge,
        styles[`syncBadge${status.charAt(0).toUpperCase() + status.slice(1)}`]
      )}
      title={title}
    >
      {icon}
    </div>
  );
};
