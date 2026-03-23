/**
 * Session Management Panel - Main Orchestrator
 * Following the component refactoring pattern
 */

import React from 'react';
import { useSessionManagement } from '../hooks/useSessionManagement';
import { CollapsedView } from './CollapsedView';
import { InvitationManager } from './Invitations/InvitationManager';
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
      <div className={`${styles.panel}${changing ? ' changing' : ''}`}>
        <div className={styles.header}>
          <h2 className={styles.title}>Session Management</h2>
          <button className={styles.closeBtn} onClick={toggleExpanded}>
            ×
          </button>
        </div>

        {loading && <div className={styles.loading}>Loading session data...</div>}
        {error && (
          <div className={styles.error}>
            Error: {error}
            <button onClick={refetch}>Retry</button>
          </div>
        )}

        {!loading && !error && (
          <>
            <button
              className={styles.inviteBtn}
              onClick={toggleInvites}
            >
              Manage Invitations
            </button>
            <PlayerList
              players={players}
              sessionCode={sessionCode}
              canManagePlayers={canManagePlayers}
              canModify={canManagePlayers}
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