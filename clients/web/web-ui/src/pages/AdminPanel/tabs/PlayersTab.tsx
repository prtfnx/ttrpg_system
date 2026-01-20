import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { PlayerRoleSelector } from '../../../components/SessionManagement/PlayerRoleSelector';
import { useRoleManagement } from '../../../hooks/useRoleManagement';
import { useSessionPlayers } from '../../../hooks/useSessionPlayers';
import { adminService } from '../../../services/admin.service';
import type { UserInfo } from '../../../services/auth.service';
import type { SessionPlayer, SessionRole } from '../../../types/roles';
import styles from './PlayersTab.module.css';

interface PlayersTabProps {
  sessionCode: string;
  userInfo: UserInfo;
  userRole: SessionRole;
}

export const PlayersTab: React.FC<PlayersTabProps> = ({ sessionCode, userInfo, userRole }) => {
  const { players, loading, error, refetch } = useSessionPlayers(sessionCode);
  const { changeRole, kickPlayer, changing } = useRoleManagement(sessionCode);
  const [selectedPlayers, setSelectedPlayers] = useState<Set<number>>(new Set());
  const [bulkRole, setBulkRole] = useState<SessionRole>('player');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<SessionRole | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'offline'>('all');

  const isOwner = userRole === 'owner';

  const filteredPlayers = players.filter(p => {
    const matchesSearch = p.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.character_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = filterRole === 'all' || p.role === filterRole;
    const matchesStatus = 
      filterStatus === 'all' ||
      (filterStatus === 'online' && p.is_connected) ||
      (filterStatus === 'offline' && !p.is_connected);
    
    return matchesSearch && matchesRole && matchesStatus;
  });

  const handleSelectAll = () => {
    if (selectedPlayers.size === filteredPlayers.length) {
      setSelectedPlayers(new Set());
    } else {
      setSelectedPlayers(new Set(filteredPlayers.map(p => p.user_id)));
    }
  };

  const handleSelectPlayer = (userId: number) => {
    const newSelection = new Set(selectedPlayers);
    if (newSelection.has(userId)) {
      newSelection.delete(userId);
    } else {
      newSelection.add(userId);
    }
    setSelectedPlayers(newSelection);
  };

  const handleBulkRoleChange = async () => {
    if (selectedPlayers.size === 0) return;

    const userIds = Array.from(selectedPlayers);
    try {
      const result = await adminService.bulkChangeRoles(sessionCode, {
        user_ids: userIds,
        new_role: bulkRole,
      });
      
      toast.success(`${result.updated} players updated to ${bulkRole}`);
      if (result.failed.length > 0) {
        toast.warning(`${result.failed.length} players could not be updated`);
      }
      
      setSelectedPlayers(new Set());
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk role change failed');
    }
  };

  const handleKick = async (player: SessionPlayer) => {
    if (!confirm(`Kick ${player.username} from the session?`)) return;

    const success = await kickPlayer(player.user_id);
    if (success) {
      toast.success(`${player.username} has been kicked`);
      refetch();
    }
  };

  const handleIndividualRoleChange = async (player: SessionPlayer, newRole: SessionRole) => {
    const result = await changeRole(player.user_id, newRole);
    if (result) {
      toast.success(`${player.username}'s role changed to ${newRole}`);
      refetch();
    }
  };

  if (loading) return <div className={styles.loading}>Loading players...</div>;
  if (error) return <div className={styles.error}>{error}</div>;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Players & Roles</h2>
        <div className={styles.filters}>
          <input
            type="text"
            placeholder="Search players..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={styles.search}
          />
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value as any)}
            className={styles.filter}
          >
            <option value="all">All Roles</option>
            <option value="owner">Owner</option>
            <option value="co_dm">Co-DM</option>
            <option value="trusted_player">Trusted Player</option>
            <option value="player">Player</option>
            <option value="spectator">Spectator</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className={styles.filter}
          >
            <option value="all">All Status</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
        </div>
      </div>

      {selectedPlayers.size > 0 && isOwner && (
        <div className={styles.bulkActions}>
          <span>{selectedPlayers.size} selected</span>
          <select
            value={bulkRole}
            onChange={(e) => setBulkRole(e.target.value as SessionRole)}
            className={styles.bulkRoleSelect}
          >
            <option value="co_dm">Co-DM</option>
            <option value="trusted_player">Trusted Player</option>
            <option value="player">Player</option>
            <option value="spectator">Spectator</option>
          </select>
          <button
            onClick={handleBulkRoleChange}
            className={styles.bulkButton}
            disabled={changing}
          >
            Change Selected Roles
          </button>
          <button
            onClick={() => setSelectedPlayers(new Set())}
            className={styles.clearButton}
          >
            Clear Selection
          </button>
        </div>
      )}

      <div className={styles.playerTable}>
        <div className={styles.tableHeader}>
          {isOwner && (
            <div className={styles.checkboxCell}>
              <input
                type="checkbox"
                checked={selectedPlayers.size === filteredPlayers.length && filteredPlayers.length > 0}
                onChange={handleSelectAll}
              />
            </div>
          )}
          <div className={styles.usernameCell}>Player</div>
          <div className={styles.characterCell}>Character</div>
          <div className={styles.roleCell}>Role</div>
          <div className={styles.statusCell}>Status</div>
          <div className={styles.joinedCell}>Joined</div>
          <div className={styles.actionsCell}>Actions</div>
        </div>

        <div className={styles.tableBody}>
          {filteredPlayers.map(player => (
            <div key={player.id} className={styles.playerRow}>
              {isOwner && (
                <div className={styles.checkboxCell}>
                  <input
                    type="checkbox"
                    checked={selectedPlayers.has(player.user_id)}
                    onChange={() => handleSelectPlayer(player.user_id)}
                    disabled={player.role === 'owner' || player.user_id === userInfo.id}
                  />
                </div>
              )}
              <div className={styles.usernameCell}>
                {player.username}
                {player.user_id === userInfo.id && <span className={styles.you}>(You)</span>}
              </div>
              <div className={styles.characterCell}>
                {player.character_name || <span className={styles.empty}>—</span>}
              </div>
              <div className={styles.roleCell}>
                <PlayerRoleSelector
                  currentRole={player.role}
                  canEdit={isOwner && player.role !== 'owner' && player.user_id !== userInfo.id}
                  onChange={(newRole) => handleIndividualRoleChange(player, newRole)}
                  disabled={changing}
                />
              </div>
              <div className={styles.statusCell}>
                <span className={`${styles.status} ${player.is_connected ? styles.online : styles.offline}`}>
                  {player.is_connected ? '🟢 Online' : '⚫ Offline'}
                </span>
              </div>
              <div className={styles.joinedCell}>
                {new Date(player.joined_at).toLocaleDateString()}
              </div>
              <div className={styles.actionsCell}>
                {isOwner && player.role !== 'owner' && player.user_id !== userInfo.id && (
                  <button
                    onClick={() => handleKick(player)}
                    className={styles.kickButton}
                    disabled={changing}
                    title="Kick player"
                  >
                    ✕ Kick
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {filteredPlayers.length === 0 && (
        <div className={styles.empty}>No players match the current filters</div>
      )}
    </div>
  );
};
