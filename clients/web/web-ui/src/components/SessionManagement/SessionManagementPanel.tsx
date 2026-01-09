import React, { useEffect, useState } from 'react';
import { useSessionPlayers } from '../../hooks/useSessionPlayers';
import { useProtocol } from '../../services/ProtocolContext';
import { InvitationManager } from '../Invitations/InvitationManager';
import { PlayerList } from './PlayerList';
import styles from './SessionManagementPanel.module.css';

interface SessionManagementPanelProps {
  sessionCode: string;
}

export const SessionManagementPanel: React.FC<SessionManagementPanelProps> = ({ sessionCode }) => {
  const { players, loading, error, refetch } = useSessionPlayers(sessionCode);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showInvites, setShowInvites] = useState(false);
  const { protocol } = useProtocol();

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

  if (!isExpanded) {
    return (
      <button className={styles.toggle} onClick={() => setIsExpanded(true)}>
        👥 Manage Players
      </button>
    );
  }

  return (
    <>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 className={styles.title}>Session Management</h2>
          <button className={styles.closeBtn} onClick={() => setIsExpanded(false)}>
            ✕
          </button>
        </div>

        {loading && <div className={styles.loading}>Loading players...</div>}
        {error && <div className={styles.error}>{error}</div>}
        
        {!loading && !error && (
          <>
            <button
              className={styles.inviteBtn}
              onClick={() => setShowInvites(true)}
            >
              📨 Manage Invites
            </button>
            <PlayerList
              players={players}
              sessionCode={sessionCode}
              onPlayerUpdate={refetch}
            />
          </>
        )}
      </div>

      {showInvites && (
        <InvitationManager
          sessionCode={sessionCode}
          onClose={() => setShowInvites(false)}
        />
      )}
    </>
  );
};
