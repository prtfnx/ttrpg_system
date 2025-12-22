

import React, { useEffect, useState } from "react";
import { useAuthenticatedWebSocket } from "../hooks/useAuthenticatedWebSocket";
import { createMessage, MessageType } from "../protocol/message";
import type { UserInfo } from "../services/auth.service";
import styles from './PlayerManagerPanel.module.css';

interface Player {
  id: string;
  name: string;
  status: "connected" | "disconnected" | "kicked" | "banned";
  role: "dm" | "player";
}

export const PlayerManagerPanel: React.FC<{ sessionCode: string; userInfo: UserInfo }> = ({ sessionCode, userInfo }) => {
  const { protocol } = useAuthenticatedWebSocket({ sessionCode, userInfo });
  const [players, setPlayers] = useState<Player[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!protocol) return;
    protocol.sendMessage(createMessage(MessageType.PLAYER_LIST_REQUEST, {}, 1));
    const listHandler = (event: Event) => {
      const { detail } = event as CustomEvent;
      if (detail && detail.players) setPlayers(detail.players);
    };
    const statusHandler = (event: Event) => {
      const { detail } = event as CustomEvent;
      if (detail && detail.players) setPlayers(detail.players);
    };
    const errorHandler = (event: Event) => {
      const { detail } = event as CustomEvent;
      if (detail && detail.error) setError(detail.error);
    };
    window.addEventListener("player-list-updated", listHandler);
    window.addEventListener("player-status-updated", statusHandler);
    window.addEventListener("player-kicked", statusHandler);
    window.addEventListener("player-banned", statusHandler);
    window.addEventListener("player-action-error", errorHandler);
    return () => {
      window.removeEventListener("player-list-updated", listHandler);
      window.removeEventListener("player-status-updated", statusHandler);
      window.removeEventListener("player-kicked", statusHandler);
      window.removeEventListener("player-banned", statusHandler);
      window.removeEventListener("player-action-error", errorHandler);
    };
  }, [protocol]);

  const kick = (id: string) => {
    setError(null);
    protocol?.sendMessage(createMessage(MessageType.PLAYER_KICK_REQUEST, { id }, 1));
  };
  const ban = (id: string) => {
    setError(null);
    protocol?.sendMessage(createMessage(MessageType.PLAYER_BAN_REQUEST, { id }, 1));
  };

  if (userInfo.role !== "dm") return null;

  return (
    <div className={styles.panel}>
      <h3>Player Management</h3>
      {error && <div className={styles.error}>{error}</div>}
      <ul>
        {players.map((p) => (
          <li key={p.id}>
            <span>{p.name} ({p.status})</span>
            {p.role !== "dm" && (
              <>
                <button onClick={() => kick(p.id)}>Kick</button>
                <button onClick={() => ban(p.id)}>Ban</button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};


