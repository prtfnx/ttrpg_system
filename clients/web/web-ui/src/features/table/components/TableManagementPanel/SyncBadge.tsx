import clsx from 'clsx';
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
  const icons = {
    local: '💾',
    syncing: '🔄',
    synced: '☁️',
    error: '⚠️'
  };

  const titles = {
    local: 'Local only - not synced to server',
    syncing: 'Syncing with server...',
    synced: `Synced ${formatRelativeTime(lastSyncTime)}`,
    error: `Sync error: ${syncError || 'Unknown error'}`
  };

  return (
    <div 
      className={clsx(
        styles.syncBadge,
        syncStatus && styles[`syncBadge${syncStatus.charAt(0).toUpperCase() + syncStatus.slice(1)}`]
      )}
      title={syncStatus ? titles[syncStatus] : 'Synced with server'}
    >
      {syncStatus ? icons[syncStatus] : icons.synced}
    </div>
  );
};
