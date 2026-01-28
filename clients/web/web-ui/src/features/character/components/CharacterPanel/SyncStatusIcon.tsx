import clsx from 'clsx';
import React from 'react';
import styles from '../CharacterPanel.module.css';

type SyncStatus = 'local' | 'syncing' | 'synced' | 'error';

interface SyncStatusIconProps {
  status?: SyncStatus;
}

const STATUS_CONFIG = {
  local: { icon: '📝', tooltip: 'Not synced - changes are local only', color: '#fbbf24' },
  syncing: { icon: '⟳', tooltip: 'Syncing with server...', color: '#3b82f6' },
  error: { icon: '⚠️', tooltip: 'Sync failed - click retry button to try again', color: '#ef4444' },
};

export const SyncStatusIcon: React.FC<SyncStatusIconProps> = ({ status }) => {
  if (!status || status === 'synced') return null;
  
  const config = STATUS_CONFIG[status];
  
  return (
    <span 
      className={clsx(styles.syncStatusIcon, status)} 
      title={config.tooltip}
      style={{ color: config.color, fontSize: '14px', marginLeft: '4px' }}
    >
      {status === 'syncing' ? (
        <span className={styles.syncSpinner}>{config.icon}</span>
      ) : (
        config.icon
      )}
    </span>
  );
};
