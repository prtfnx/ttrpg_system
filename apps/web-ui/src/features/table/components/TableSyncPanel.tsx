import { useNetworkClient } from '@shared/hooks/useNetworkClient';
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
      <div className="panel-base">
        <div className="loading-state">
          <div className="loading-spinner">...</div>
          <p>Loading table sync...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-base">
      <div className={styles.panelHeader}>
        <h3>Table Sync</h3>
        <div className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
          <span>{isConnected ? '[ok]' : '[x]'}</span>
          <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span>[x] {error}</span>
        </div>
      )}

      <div className="panel-section">
        <h4>Table Request</h4>
        <div className="control-group">
          <div className="input-group">
            <label>Table ID</label>
            <input
              type="text"
              placeholder="Enter table ID"
              value={currentTableId}
              onChange={(e) => setCurrentTableId(e.target.value)}
              className="panel-input"
            />
          </div>
          <button
            onClick={handleRequestTable}
            disabled={!tableSync || !isConnected}
            className="panel-button primary"
          >
            Request Table
          </button>
        </div>
      </div>

      <div className="panel-section">
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

      <div className="panel-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h4>Activity Log</h4>
          <button onClick={clearLog} className="panel-button">
            Clear
          </button>
        </div>

        <div className="activity-log">
          {activityLog.length === 0 ? (
            <div className="empty-state">
              <span>No activity yet.</span>
            </div>
          ) : (
            activityLog.map((log) => (
              <div key={log.id} className={`log-entry ${log.type}`}>
                <span className="log-timestamp">
                  {log.timestamp.toLocaleTimeString()}
                </span>
                <span className="log-message">{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export { TableSyncPanel };
