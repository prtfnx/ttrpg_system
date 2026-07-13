
import type { UserInfo } from '@features/auth';
import { useAuthenticatedWebSocket } from '@features/auth';
import { isDM, type SessionRole } from '@features/session/types/roles';
import { createMessage, MessageType } from '@lib/websocket';
import React, { useEffect, useState } from "react";
import styles from './PlayerManagerPanel.module.css';

interface Player {
  id: string;
  name: string;
  status: "connected" | "disconnected" | "kicked" | "banned";
  role: "dm" | "player";
}

interface PlayerManagerPanelProps {
  sessionCode: string;
  userInfo: UserInfo;
  sessionRole: SessionRole;
}

export const PlayerManagerPanel: React.FC<PlayerManagerPanelProps> = ({ sessionCode, userInfo, sessionRole }) => {
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

  if (!isDM(sessionRole)) {
    return (
      <div className={styles.panel}>
        <h3>Player Management</h3>
        <p className={styles.info}>Only DMs can manage players.</p>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <h3>Player Management</h3>
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.playerList}>
        {players.length === 0 ? (
          <p className={styles.info}>No players connected</p>
        ) : (
          <ul className={styles.list}>
            {players.map((p) => (
              <li key={p.id} className={styles.playerItem}>
                <span className={styles.playerInfo}>
                  {p.name} ({p.status})
                </span>
                {p.role !== "dm" && (
                  <div className={styles.actions}>
                    <button className={styles.kickButton} onClick={() => kick(p.id)}>Kick</button>
                    <button className={styles.banButton} onClick={() => ban(p.id)}>Ban</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
