import panelStyles from '@shared/styles/PanelBase.module.css';
import { AlertTriangle, FileEdit, Loader2 } from 'lucide-react';
import React from 'react';
import styles from '../CharacterPanel.module.css';

type SyncStatus = 'local' | 'syncing' | 'synced' | 'error';

interface SyncStatusIconProps {
  status?: SyncStatus;
}

const STATUS_CONFIG = {
  local:   { Icon: FileEdit,    tooltip: 'Not synced - changes are local only', cls: panelStyles.iconWarning },
  syncing: { Icon: Loader2,     tooltip: 'Syncing with server...',              cls: panelStyles.iconInfo    },
  error:   { Icon: AlertTriangle, tooltip: 'Sync failed - click retry button to try again', cls: panelStyles.iconDanger },
};

export const SyncStatusIcon: React.FC<SyncStatusIconProps> = ({ status }) => {
  if (!status || status === 'synced') return null;

  const { Icon, tooltip, cls } = STATUS_CONFIG[status];

  return (
    <span
      className={`${styles.syncStatusIcon} ${cls}`}
      title={tooltip}
      style={{ marginLeft: '4px', display: 'inline-flex' }}
    >
      <Icon
        size={14}
        aria-hidden
        className={status === 'syncing' ? panelStyles.spinning : undefined}
      />
    </span>
  );
};
