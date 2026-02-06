/**
 * Session Management Hook
 * Main hook for SessionManagementPanel following the refactoring pattern
 */

import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '@features/auth/components/AuthContext';
import { useProtocol } from '@lib/api/ProtocolContext';
import { useSessionPlayers } from './useSessionPlayers';
import { useRoleManagement } from './useRoleManagement';
import type { SessionPlayer, SessionRole } from '../types/roles';

export const useSessionManagement = (sessionCode: string) => {
  const { user } = useAuth();
  const { protocol } = useProtocol();
  const { players, loading, error, refetch } = useSessionPlayers(sessionCode);
  const { changeRole, kickPlayer, changing } = useRoleManagement(sessionCode);

  // UI State
  const [isExpanded, setIsExpanded] = useState(false);
  const [showInvites, setShowInvites] = useState(false);

  // Derived state
  const currentPlayer = players.find(p => p.user_id === user?.id);
  const isOwner = currentPlayer?.role === 'owner';
  const canManagePlayers = currentPlayer?.permissions.includes('change_roles') || isOwner;

  // Protocol event handling
  useEffect(() => {
    if (!protocol) return;

    const handlePlayerEvent = (message: any) => {
      const eventType = message.data?.event;
      if (eventType === 'PLAYER_JOINED' ||
          eventType === 'PLAYER_ROLE_CHANGED' ||
          eventType === 'PLAYER_KICKED') {
        refetch();
      }
    };

    protocol.registerHandler('CUSTOM', handlePlayerEvent);

    return () => {
      protocol.unregisterHandler('CUSTOM');
    };
  }, [protocol, refetch]);

  const handleRoleChange = async (targetPlayer: SessionPlayer, newRole: SessionRole) => {
    if (!canManagePlayers) return false;

    const result = await changeRole(targetPlayer.user_id, newRole);
    if (result) {
      toast.success(`Changed ${targetPlayer.username}'s role to ${newRole}`);
      refetch();
      return true;
    }
    return false;
  };

  const handleKick = async (targetPlayer: SessionPlayer) => {
    if (!canManagePlayers) return false;
    if (!confirm(`Kick ${targetPlayer.username}?`)) return false;

    const success = await kickPlayer(targetPlayer.user_id);
    if (success) {
      toast.success(`${targetPlayer.username} kicked`);
      refetch();
      return true;
    }
    return false;
  };

  const toggleExpanded = () => setIsExpanded(!isExpanded);
  const toggleInvites = () => setShowInvites(true);
  const closeInvites = () => setShowInvites(false);

  return {
    // State
    players,
    loading,
    error,
    isExpanded,
    showInvites,
    changing,
    
    // Permissions
    currentPlayer,
    canManagePlayers,
    
    // Actions
    handleRoleChange,
    handleKick,
    toggleExpanded,
    toggleInvites,
    closeInvites,
    refetch
  };
};