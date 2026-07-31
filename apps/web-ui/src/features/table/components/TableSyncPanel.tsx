import { useNetworkClient } from '@shared/hooks/useNetworkClient';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { useTableSync } from '../hooks/useTableSync';
import styles from './TableSyncPanel.module.css';

interface ActivityLog {
  id: number;
  timestamp: Date;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
}

function TableSyncPanel() {
  const {
    tableSync,
    tableData,
    tableId,
    sprites,
    isLoading,
    error,
    requestTable,
  } = useTableSync();
  const { networkState } = useNetworkClient();
  const isConnected = networkState.isConnected;
  const [activityLog, setActivityLog] = useState<ActivityLog[]>([]);
  const [currentTableId, setCurrentTableId] = useState<string>('');

  const addLog = (type: ActivityLog['type'], message: string) => {
    const newLog: ActivityLog = {
      id: Date.now(),
      timestamp: new Date(),
      type,
      message,
    };
    setActivityLog(prev => [newLog, ...prev.slice(0, 49)]);
  };

  useEffect(() => {
    addLog(
      isConnected ? 'success' : 'warning',
      isConnected ? 'Connected to table sync service' : 'Disconnected from table sync service',
    );
  }, [isConnected]);

  useEffect(() => {
    if (error) addLog('error', `Error: ${error}`);
  }, [error]);

  const handleRequestTable = () => {
    const trimmedId = currentTableId.trim();
    if (!trimmedId) {
      addLog('warning', 'Please enter a table ID');
      return;
    }

    if (!tableSync) {
      addLog('warning', 'Table sync not available');
      return;
    }

    if (!isConnected) {
      addLog('warning', 'Not connected to table sync service');
      return;
    }

    requestTable(trimmedId);
    addLog('info', `Requested table: ${trimmedId}`);
  };

  const clearLog = () => {
    setActivityLog([]);
  };

  if (isLoading) {
    return (
      <div className={styles.panelBase}>
        <div className={styles.loadingState}>
          <div className={styles.loadingSpinner}>...</div>
          <p>Loading table sync...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panelBase}>
      <div className={styles.panelHeader}>
        <h3>Table Sync</h3>
        <div
          className={clsx(
            styles.statusIndicator,
            isConnected ? styles.connected : styles.disconnected,
          )}
          role="status"
        >
          <span>{isConnected ? '[ok]' : '[x]'}</span>
          <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </div>

      {error && (
        <div className={styles.errorBanner} role="alert">
          <span>[x] {error}</span>
        </div>
      )}

      <div className={styles.panelSection}>
        <h4>Table Request</h4>
        <div className={styles.controlGroup}>
          <div className={styles.inputGroup}>
            <label className={styles.inputLabel} htmlFor="table-sync-id">Table ID</label>
            <input
              id="table-sync-id"
              type="text"
              placeholder="Enter table ID"
              value={currentTableId}
              onChange={(e) => setCurrentTableId(e.target.value)}
              className={styles.panelInput}
            />
          </div>
          <button
            type="button"
            onClick={handleRequestTable}
            disabled={!tableSync || !isConnected}
            className={styles.primaryButton}
          >
            Request Table
          </button>
        </div>
      </div>

      <div className={styles.panelSection}>
        <h4>Runtime State</h4>
        <div className={styles.stateGrid}>
          <div>
            <span className={styles.stateLabel}>Active table</span>
            <span className={styles.stateValue}>{tableId || 'None'}</span>
          </div>
          <div>
            <span className={styles.stateLabel}>Sprites</span>
            <span className={styles.stateValue}>{sprites.length}</span>
          </div>
          <div>
            <span className={styles.stateLabel}>Table data</span>
            <span className={styles.stateValue}>{tableData ? 'Loaded' : 'Empty'}</span>
          </div>
        </div>
      </div>

      <div className={styles.panelSection}>
        <div className={styles.activityHeader}>
          <h4>Activity Log</h4>
          <button type="button" onClick={clearLog} className={styles.panelButton}>
            Clear
          </button>
        </div>

        <div className={styles.activityLog}>
          {activityLog.length === 0 ? (
            <div className={styles.emptyState}>
              <span>No activity yet.</span>
            </div>
          ) : (
            activityLog.map((log) => (
              <div key={log.id} className={clsx(styles.logEntry, styles[log.type])}>
                <span className={styles.logTimestamp}>
                  {log.timestamp.toLocaleTimeString()}
                </span>
                <span className={styles.logMessage}>{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export { TableSyncPanel };
