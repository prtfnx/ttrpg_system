import React, { useCallback, useEffect, useState } from "react";
import { useAuthenticatedWebSocket } from "../hooks/useAuthenticatedWebSocket";
import { MessageType, createMessage } from "../protocol/message";
import type { UserInfo } from "../services/auth.service";
import styles from './PlayerManager.module.css';

/**
 * Legacy PlayerManager component using WebSocket protocol messages
 * 
 * Note: This component coexists with SessionManagementPanel:
 * - PlayerManager: Protocol-based player list/kick/ban (WebSocket events)
 * - SessionManagementPanel: REST API-based role management (new system)
 * 
 * Role check: userInfo.role === 'dm' maps to owner/co_dm in new role system
 * See auth.service.ts getRole() for role mapping logic
 */

export interface Player {
  id: string;
  username: string;
  status: string;
  role: "dm" | "player";  // Legacy role type - mapped from new 5-tier system
}

interface PlayerManagerProps {
  sessionCode: string;
  userInfo: UserInfo;
}

export const PlayerManager: React.FC<PlayerManagerProps> = ({ sessionCode, userInfo }) => {
  const { protocol } = useAuthenticatedWebSocket({ sessionCode, userInfo });
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Event-driven player list fetch and updates
  useEffect(() => {
    setLoading(true);
    if (protocol) {
      protocol.sendMessage(createMessage(MessageType.PLAYER_LIST_REQUEST, { sessionCode }, 1));
    }
    const handlePlayerList = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.players) {
        setPlayers(customEvent.detail.players);
        setError(null);
      } else {
        setError("Failed to fetch player list");
      }
      setLoading(false);
    };
    window.addEventListener("player-list-updated", handlePlayerList);
    return () => window.removeEventListener("player-list-updated", handlePlayerList);
  }, [protocol, sessionCode]);

  // DM-only controls
  const handleKick = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      await protocol?.sendMessage(createMessage(MessageType.PLAYER_KICK_REQUEST, { id }, 1));
    } catch (err) {
      setError("Failed to kick player");
    } finally {
      setLoading(false);
    }
  }, [protocol]);

  const handleBan = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      await protocol?.sendMessage(createMessage(MessageType.PLAYER_BAN_REQUEST, { id }, 1));
    } catch (err) {
      setError("Failed to ban player");
    } finally {
      setLoading(false);
    }
  }, [protocol]);

  if (loading) return <div className={styles.loading}>Loading players...</div>;
  if (error) return <div className={styles.error}>{error}</div>;

  return (
    <div className={styles.playerManager}>
      <h2>Players</h2>
      <ul>
        {players.map((player) => (
          <li key={player.id}>
            <span>{player.username} ({player.role})</span>
            {userInfo.role === "dm" && player.role !== "dm" && (
              <>
                <button onClick={() => handleKick(player.id)}>Kick</button>
                <button onClick={() => handleBan(player.id)}>Ban</button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};
