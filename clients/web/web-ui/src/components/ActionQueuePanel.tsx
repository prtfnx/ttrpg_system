import React, { useCallback, useEffect, useState } from "react";
import { useAuthenticatedWebSocket } from "../hooks/useAuthenticatedWebSocket";
import { MessageType, createMessage } from "../protocol/message";
import type { UserInfo } from "../services/auth.service";

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
    <div className="game-panel action-queue-panel-minimal">
      <div className="panel-header-compact">
        <h3 className="panel-title">⚡ Actions</h3>
      </div>
      {error && <div className="error-message">{error}</div>}
      <div className="action-form">
        <input
          type="text"
          placeholder="Action (e.g. move, attack)"
          value={actionType}
          onChange={e => setActionType(e.target.value)}
          className="action-input"
        />
        <input
          type="text"
          placeholder='Data: {"target":"orc"}'
          value={actionPayload}
          onChange={e => setActionPayload(e.target.value)}
          className="action-input"
        />
        <button onClick={queueAction} className="queue-btn">
          Add
        </button>
      </div>
      <div className="actions-list">
        {queue.map(action => (
          <div key={action.id} className="action-item">
            <div className="action-header">
              <span className="action-type">{action.type}</span>
              <span className={`action-status ${action.status}`}>{action.status}</span>
            </div>
            <div className="action-details">
              {action.user} - {new Date(action.timestamp).toLocaleTimeString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
