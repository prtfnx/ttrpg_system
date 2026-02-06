/**
 * Session Management Panel - Main Orchestrator
 * Following the component refactoring pattern
 */

import React from 'react';
import { useSessionManagement } from '../hooks/useSessionManagement';
import { InvitationManager } from './Invitations/InvitationManager';
import { CollapsedView } from './CollapsedView';
import { PlayerList } from './PlayerList';
import styles from './SessionManagementPanel.module.css';

interface SessionManagementPanelProps {
  sessionCode: string;
}

export const SessionManagementPanel: React.FC<SessionManagementPanelProps> = ({ sessionCode }) => {
  const {
    // State
    players,
    loading,
    error,
    isExpanded,
    showInvites,
    changing,
    
    // Permissions
    canManagePlayers,
    
    // Actions
    toggleExpanded,
    toggleInvites,
    closeInvites,
    handleRoleChange,
    handleKick,
    refetch
  } = useSessionManagement(sessionCode);

  // Collapsed view
  if (!isExpanded) {
    return <CollapsedView sessionCode={sessionCode} onToggle={toggleExpanded} />;
  }

  // Expanded panel view
  return (
    <>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 className={styles.title}>Session Management</h2>
          <button className={styles.closeBtn} onClick={toggleExpanded}>
            ✕
          </button>
        </div>

        {loading && <div className={styles.loading}>Loading players...</div>}
        {error && <div className={styles.error}>{error}</div>}

        {!loading && !error && (
          <>
            <button
              className={styles.inviteBtn}
              onClick={toggleInvites}
            >
              📨 Manage Invites
            </button>
            <PlayerList
              players={players}
              sessionCode={sessionCode}
              canManagePlayers={canManagePlayers}
              changing={changing}
              onRoleChange={handleRoleChange}
              onKick={handleKick}
              onPlayerUpdate={refetch}
            />
          </>
        )}
      </div>

      {showInvites && (
        <InvitationManager
          sessionCode={sessionCode}
          onClose={closeInvites}
        />
      )}
    </>
  );
};