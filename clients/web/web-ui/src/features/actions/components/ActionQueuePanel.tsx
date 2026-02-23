import type { UserInfo } from '@features/auth';
import { useAuthenticatedWebSocket } from '@features/auth';
import { MessageType, createMessage } from '@lib/websocket';
import React, { useCallback, useEffect, useState } from "react";
import styles from './ActionQueuePanel.module.css';

export interface QueuedAction {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  user: string;
  status: "pending" | "confirmed" | "failed";
  timestamp: number;
}

interface ActionQueuePanelProps {
  sessionCode: string;
  userInfo: UserInfo;
}

export const ActionQueuePanel: React.FC<ActionQueuePanelProps> = ({ sessionCode, userInfo }) => {
  const { protocol } = useAuthenticatedWebSocket({ sessionCode, userInfo });
  const [queue, setQueue] = useState<QueuedAction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionType, setActionType] = useState<string>("");
  const [actionPayload, setActionPayload] = useState<string>("");

  // Listen for action confirmations from server
  useEffect(() => {
    const handleActionConfirmed = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { id, status } = customEvent.detail;
      setQueue(prev => prev.map(a => a.id === id ? { ...a, status } : a));
    };
    window.addEventListener("action-confirmed", handleActionConfirmed);
    return () => window.removeEventListener("action-confirmed", handleActionConfirmed);
  }, []);

  // Optimistic queueing
  const queueAction = useCallback(() => {
    if (!actionType || !actionPayload) {
      setError("Action type and payload required.");
      return;
    }
    let payloadObj: Record<string, unknown> = {};
    try {
      payloadObj = JSON.parse(actionPayload);
    } catch {
      setError("Payload must be valid JSON.");
      return;
    }
    const newAction: QueuedAction = {
      id: `action-${Date.now()}`,
      type: actionType,
      payload: payloadObj,
      user: userInfo.username,
      status: "pending",
      timestamp: Date.now(),
    };
    setQueue(prev => [...prev, newAction]);
    setError(null);
    // Send to server
    protocol?.sendMessage(createMessage(MessageType.PLAYER_ACTION, { action: "queue_action", actionData: newAction }, 1));
  }, [actionType, actionPayload, userInfo, protocol]);

  return (
    <div className={styles.actionQueuePanel}>
      <div className={styles.panelHeaderCompact}>
        <h3 className={styles.panelTitle}>Actions</h3>
      </div>
      {error && <div className={styles.errorMessage}>{error}</div>}
      <div className={styles.actionForm}>
        <input
          type="text"
          placeholder="Action (e.g. move, attack)"
          value={actionType}
          onChange={e => setActionType(e.target.value)}
          className={styles.actionInput}
        />
        <input
          type="text"
          placeholder='{"target":"orc"}'
          value={actionPayload}
          onChange={e => setActionPayload(e.target.value)}
          className={styles.actionInput}
        />
        <button onClick={queueAction} className={styles.queueBtn}>
          Add
        </button>
      </div>
      <div className={styles.actionsList}>
        {queue.map(action => (
          <div key={action.id} className={styles.actionItem}>
            <div className={styles.actionHeader}>
              <span className={styles.actionType}>{action.type}</span>
              <span className={`${styles.actionStatus} ${styles[action.status]}`}>{action.status}</span>
            </div>
            <div className={styles.actionDetails}>
              {action.user} - {new Date(action.timestamp).toLocaleTimeString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
