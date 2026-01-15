import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { adminService } from '../../../services/admin.service';
import type { AuditLogEntry } from '../../../types/admin';
import styles from './AuditLogTab.module.css';

interface AuditLogTabProps {
  sessionCode: string;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  ROLE_CHANGE: '👤 Role Changed',
  ROLE_CHANGE_BULK: '👥 Bulk Role Change',
  PLAYER_KICKED: '🚪 Player Kicked',
  PERMISSION_GRANTED: '✅ Permission Granted',
  SETTINGS_UPDATED: '⚙️ Settings Updated',
  SESSION_DELETED: '🗑️ Session Deleted',
  PLAYER_JOINED: '📥 Player Joined',
};

export const AuditLogTab: React.FC<AuditLogTabProps> = ({ sessionCode }) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [limit, setLimit] = useState(100);

  useEffect(() => {
    loadLogs();
  }, [sessionCode, filterType, limit]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await adminService.getAuditLog(
        sessionCode,
        filterType === 'all' ? undefined : filterType,
        limit
      );
      setLogs(data);
    } catch (err) {
      toast.error('Failed to load audit log');
    } finally {
      setLoading(false);
    }
  };

  const getEventLabel = (eventType: string) => {
    return EVENT_TYPE_LABELS[eventType] || eventType;
  };

  const formatDetails = (details: Record<string, any> | null) => {
    if (!details) return null;

    const entries = Object.entries(details);
    if (entries.length === 0) return null;

    return (
      <div className={styles.details}>
        {entries.map(([key, value]) => (
          <div key={key} className={styles.detailItem}>
            <span className={styles.detailKey}>{key}:</span>
            <span className={styles.detailValue}>
              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  if (loading) return <div className={styles.loading}>Loading audit log...</div>;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Audit Log</h2>
        <div className={styles.filters}>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className={styles.filter}
          >
            <option value="all">All Events</option>
            <option value="ROLE_CHANGE">Role Changes</option>
            <option value="ROLE_CHANGE_BULK">Bulk Role Changes</option>
            <option value="PLAYER_KICKED">Player Kicks</option>
            <option value="PERMISSION_GRANTED">Permissions</option>
            <option value="SETTINGS_UPDATED">Settings Updates</option>
          </select>

          <select
            value={limit}
            onChange={(e) => setLimit(parseInt(e.target.value))}
            className={styles.filter}
          >
            <option value={50}>Last 50</option>
            <option value={100}>Last 100</option>
            <option value={250}>Last 250</option>
            <option value={500}>Last 500</option>
          </select>

          <button onClick={loadLogs} className={styles.refreshButton}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {logs.length === 0 ? (
        <div className={styles.empty}>No audit log entries found</div>
      ) : (
        <div className={styles.logList}>
          {logs.map((log) => (
            <div key={log.id} className={styles.logEntry}>
              <div className={styles.logHeader}>
                <span className={styles.eventType}>{getEventLabel(log.event_type)}</span>
                <span className={styles.timestamp}>
                  {new Date(log.created_at).toLocaleString()}
                </span>
              </div>

              <div className={styles.logBody}>
                <div className={styles.actorInfo}>
                  {log.username && (
                    <span>
                      <strong>Actor:</strong> {log.username}
                    </span>
                  )}
                  {log.target_username && (
                    <span>
                      <strong>Target:</strong> {log.target_username}
                    </span>
                  )}
                  {log.ip_address && (
                    <span className={styles.ip}>
                      <strong>IP:</strong> {log.ip_address}
                    </span>
                  )}
                </div>

                {log.details && formatDetails(log.details)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
