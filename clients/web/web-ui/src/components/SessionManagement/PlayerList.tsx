import React from 'react';
import { toast } from 'react-toastify';
import { useRoleManagement } from '../../hooks/useRoleManagement';
import type { SessionPlayer } from '../../types/roles';
import { useAuth } from '../AuthContext';
import styles from './PlayerList.module.css';
import { PlayerRoleSelector } from './PlayerRoleSelector';

interface PlayerListProps {
  players: SessionPlayer[];
  sessionCode: string;
  onPlayerUpdate: () => void;
}

export const PlayerList: React.FC<PlayerListProps> = ({ players, sessionCode, onPlayerUpdate }) => {
  const { user } = useAuth();
  const { changeRole, kickPlayer, changing } = useRoleManagement(sessionCode);

  const currentPlayer = players.find(p => p.user_id === user?.id);
  const isOwner = currentPlayer?.role === 'owner';
  const canManagePlayers = currentPlayer?.permissions.includes('change_roles') || isOwner;

  const handleRoleChange = async (targetPlayer: SessionPlayer, newRole: string) => {
    if (!canManagePlayers) return;

    const result = await changeRole(targetPlayer.user_id, newRole as any);
    if (result) {
      toast.success(`Changed ${targetPlayer.username}'s role to ${newRole}`);
      onPlayerUpdate();
    }
  };

  const handleKick = async (targetPlayer: SessionPlayer) => {
    if (!canManagePlayers) return;
    if (!confirm(`Kick ${targetPlayer.username}?`)) return;

    const success = await kickPlayer(targetPlayer.user_id);
    if (success) {
      toast.success(`${targetPlayer.username} kicked`);
      onPlayerUpdate();
    }
  };

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Players ({players.length})</h3>

      <div className={styles.list}>
        {players.map(player => (
          <div key={player.id} className={styles.player}>
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
                  onChange={(newRole) => handleRoleChange(player, newRole)}
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
    </div>
  );
};
