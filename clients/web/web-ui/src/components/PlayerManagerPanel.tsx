

import React, { useEffect, useState } from "react";
import type { UserInfo } from "../services/auth.service";
import { useAuthenticatedWebSocket } from "../hooks/useAuthenticatedWebSocket";
import { createMessage, MessageType } from "../protocol/message";

interface Player {
  id: string;
  name: string;
  status: "connected" | "disconnected" | "kicked" | "banned";
  role: "dm" | "player";
}

export const PlayerManagerPanel: React.FC<{ sessionCode: string; userInfo: UserInfo }> = ({ sessionCode, userInfo }) => {
  const { protocol } = useAuthenticatedWebSocket({ sessionCode, userInfo });
  const [players, setPlayers] = useState<Player[]>([]);

  useEffect(() => {
    if (!protocol) return;
    protocol.sendMessage(createMessage(MessageType.PLAYER_LIST_REQUEST, {}, 1));
    const handler = (event: Event) => {
      const { detail } = event as CustomEvent;
      if (detail && detail.players) setPlayers(detail.players);
    };
    window.addEventListener("player-list-updated", handler);
    return () => window.removeEventListener("player-list-updated", handler);
  }, [protocol]);

  const kick = (id: string) => protocol?.sendMessage(createMessage(MessageType.PLAYER_KICK_REQUEST, { id }, 1));
  const ban = (id: string) => protocol?.sendMessage(createMessage(MessageType.PLAYER_BAN_REQUEST, { id }, 1));

  if (userInfo.role !== "dm") return null;

  return (
    <div className="panel">
      <h3>Player Management</h3>
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
