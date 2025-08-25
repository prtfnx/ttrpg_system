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
    <div className="action-queue-panel">
      <h2>Action Queue</h2>
      {error && <div className="error">{error}</div>}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Action Type (e.g. move, attack)"
          value={actionType}
          onChange={e => setActionType(e.target.value)}
          style={{ flex: 1 }}
        />
        <input
          type="text"
          placeholder='Payload (JSON: {"target":"orc"})'
          value={actionPayload}
          onChange={e => setActionPayload(e.target.value)}
          style={{ flex: 2 }}
        />
        <button onClick={queueAction} style={{ padding: "8px 18px", fontWeight: 700 }}>
          Queue Action
        </button>
      </div>
      <ul>
        {queue.map(action => (
          <li key={action.id} style={{ marginBottom: 8 }}>
            <span style={{ fontWeight: 600 }}>{action.type}</span> by <span>{action.user}</span> at {new Date(action.timestamp).toLocaleTimeString()}<br />
            <span>Status: {action.status}</span><br />
            <span>Payload: {JSON.stringify(action.payload)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
