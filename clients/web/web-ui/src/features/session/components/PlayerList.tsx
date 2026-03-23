/**
 * Player List Sub-component
 * Displays list of session players following the refactoring pattern
 */

import { useAuth } from '@app/providers';
import React from 'react';
import type { SessionPlayer, SessionRole } from '../types/roles';
import styles from './PlayerList.module.css';
import { PlayerRoleSelector } from './PlayerRoleSelector';

interface PlayerListProps {
  players: SessionPlayer[];
  sessionCode: string;
  canManagePlayers: boolean;
  changing: boolean;
  onRoleChange: (player: SessionPlayer, newRole: SessionRole) => Promise<boolean>;
  onKick: (player: SessionPlayer) => Promise<boolean>;
  onPlayerUpdate: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  player: 'Players',
  trusted_player: 'Trusted Players',
  co_dm: 'Co-DMs',
  spectator: 'Spectators',
  owner: 'Owner',
};

const ROLE_ORDER = ['owner', 'co_dm', 'player', 'trusted_player', 'spectator'];

export const PlayerList: React.FC<PlayerListProps> = ({ 
  players, 
  canManagePlayers,
  changing,
  onRoleChange,
  onKick
}) => {
  const { user } = useAuth();

  const handleRoleChange = async (player: SessionPlayer, newRole: SessionRole) => {
    await onRoleChange(player, newRole);
  };

  const handleKick = async (player: SessionPlayer) => {
    await onKick(player);
  };

  const grouped = ROLE_ORDER
    .map(role => ({ role, list: players.filter(p => p.role === role) }))
    .filter(g => g.list.length > 0);

  return (
    <div className={styles.container}>
      <div className={styles.list}>
        {grouped.map(({ role, list }) => (
          <div key={role}>
            <h4 className={styles.groupHeader}>{ROLE_LABELS[role] ?? role} ({list.length})</h4>
            {list.map(player => (
              <div key={player.id} className={styles.player} data-testid="player-item">
                <div className={styles.info}>
                  <div className={styles.header}>
                    <span className={styles.username}>
                      {player.username}
                      {player.user_id === user?.id && <span className={styles.you}>(You)</span>}
                    </span>
                    <span className={`${styles.status} ${player.is_connected ? styles.online : styles.offline}`}>
                      {player.is_connected ? '●' : '○'}
                    </span>
                  </div>

                  <div className={styles.roleRow}>
                    <PlayerRoleSelector
                      currentRole={player.role}
                      canEdit={canManagePlayers && player.role !== 'owner' && player.user_id !== user?.id}
                      onChange={(newRole) => handleRoleChange(player, newRole as SessionRole)}
                      disabled={changing}
                    />
                  </div>
                </div>

                {canManagePlayers && player.role !== 'owner' && player.user_id !== user?.id && (
                  <button
                    className={styles.kickBtn}
                    onClick={() => handleKick(player)}
                    disabled={changing}
                    title="Kick player"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};