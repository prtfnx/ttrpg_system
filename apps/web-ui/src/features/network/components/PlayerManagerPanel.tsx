
import type { UserInfo } from '@features/auth';
import { useAuthenticatedWebSocket } from '@features/auth';
import { isDM, type SessionRole } from '@features/session/types/roles';
import { onProtocolEvent } from '@lib/websocket/protocolEvents';
import React, { useEffect, useState } from 'react';
import styles from './PlayerManagerPanel.module.css';

interface ConnectedPlayer {
  client_id: string;
  user_id: number;
  username: string;
  role: SessionRole;
  ready: boolean;
  connected_at: number;
  last_ping: number;
}

interface PlayerManagerPanelProps {
  sessionCode: string;
  userInfo: UserInfo;
  sessionRole: SessionRole;
}

export const PlayerManagerPanel: React.FC<PlayerManagerPanelProps> = ({ sessionCode, userInfo, sessionRole }) => {
  const { protocol } = useAuthenticatedWebSocket({ sessionCode, userInfo });
  const [players, setPlayers] = useState<ConnectedPlayer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const canManagePlayers = isDM(sessionRole);

  useEffect(() => {
    if (!protocol || !canManagePlayers) return;

    const refreshPlayers = () => protocol.requestPlayerList();
    const removeListListener = onProtocolEvent('player-list-updated', (detail) => {
      if (Array.isArray(detail?.players)) {
        setPlayers(detail.players as unknown as ConnectedPlayer[]);
        setError(null);
      }
    });
    const removeJoinListener = onProtocolEvent('player-joined', refreshPlayers);
    const removeLeftListener = onProtocolEvent('player-left', refreshPlayers);
    const removeRoleListener = onProtocolEvent('player-role-changed', refreshPlayers);
    const removeStatusListener = onProtocolEvent('player-status-changed', refreshPlayers);
    const removeErrorListener = onProtocolEvent('protocol-error', (detail) => {
      if (typeof detail?.error === 'string') setError(detail.error);
    });

    refreshPlayers();
    return () => {
      removeListListener();
      removeJoinListener();
      removeLeftListener();
      removeRoleListener();
      removeStatusListener();
      removeErrorListener();
    };
  }, [canManagePlayers, protocol]);

  const kick = (player: ConnectedPlayer) => {
    setError(null);
    protocol?.kickPlayer(String(player.user_id));
  };
  const ban = (player: ConnectedPlayer) => {
    setError(null);
    protocol?.banPlayer(String(player.user_id));
  };

  if (!canManagePlayers) {
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
      {error && <div className={styles.error} role="alert">{error}</div>}
      <div className={styles.playerList}>
        {players.length === 0 ? (
          <p className={styles.info}>No players connected</p>
        ) : (
          <ul className={styles.list}>
            {players.map((p) => (
              <li key={p.client_id} className={styles.playerItem}>
                <span className={styles.playerInfo}>
                  {p.username} ({p.ready ? 'ready' : 'connected'})
                </span>
                {p.user_id !== userInfo.id && !isDM(p.role) && (
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.kickButton}
                      aria-label={`Kick ${p.username}`}
                      onClick={() => kick(p)}
                    >
                      Kick
                    </button>
                    <button
                      type="button"
                      className={styles.banButton}
                      aria-label={`Ban ${p.username}`}
                      onClick={() => ban(p)}
                    >
                      Ban
                    </button>
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
