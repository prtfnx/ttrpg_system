import React, { useEffect, useRef, useState } from 'react';
import { useSessionPlayers } from '../../hooks/useSessionPlayers';
import { useProtocol } from '../../services/ProtocolContext';
import { InvitationManager } from '../Invitations/InvitationManager';
import { PlayerList } from './PlayerList';
import styles from './SessionManagementPanel.module.css';

interface SessionManagementPanelProps {
  sessionCode: string;
}

interface Position {
  bottom: number;
  right: number;
}

const STORAGE_KEY = 'session-management-position';

export const SessionManagementPanel: React.FC<SessionManagementPanelProps> = ({ sessionCode }) => {
  const { players, loading, error, refetch } = useSessionPlayers(sessionCode);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showInvites, setShowInvites] = useState(false);
  const { protocol } = useProtocol();
  
  // Draggable state
  const [position, setPosition] = useState<Position>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : { bottom: 24, right: 24 }; // default: var(--space-xl) = 24px
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<HTMLDivElement>(null);
  const dragStartPos = useRef({ x: 0, y: 0, bottom: 0, right: 0 });

  // Save position to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
  }, [position]);

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'BUTTON' || 
        (e.target as HTMLElement).tagName === 'A') {
      return; // Don't start drag on buttons/links
    }
    
    setIsDragging(true);
    dragStartPos.current = {
      x: e.clientX,
      y: e.clientY,
      bottom: position.bottom,
      right: position.right
    };
    e.preventDefault();
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = dragStartPos.current.x - e.clientX;
      const deltaY = e.clientY - dragStartPos.current.y;
      
      setPosition({
        bottom: Math.max(0, dragStartPos.current.bottom + deltaY),
        right: Math.max(0, dragStartPos.current.right + deltaX)
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, position.bottom, position.right]);

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
      <div 
        ref={dragRef}
        className={`${styles.collapsed} ${isDragging ? styles.dragging : ''}`}
        style={{ bottom: `${position.bottom}px`, right: `${position.right}px` }}
        onMouseDown={handleMouseDown}
      >
        <button className={styles.toggle} onClick={() => setIsExpanded(true)}>
          👥 Manage Players
        </button>
        <a href={`/game/session/${sessionCode}/admin`} className={styles.adminLink} target="_blank" rel="noopener noreferrer">
          ⚙️ Admin Panel
        </a>
        <div className={styles.dragHandle} title="Drag to move">⋮⋮</div>
      </div>
    );
  }

  return (
    <>
      <div 
        className={`${styles.panel} ${isDragging ? styles.dragging : ''}`}
        style={{ bottom: `${position.bottom}px`, right: `${position.right}px` }}
      >
        <div className={styles.header} onMouseDown={handleMouseDown}>
          <h2 className={styles.title}>Session Management</h2>
          <div className={styles.headerActions}>
            <span className={styles.dragHandle} title="Drag to move">⋮⋮</span>
            <button className={styles.closeBtn} onClick={() => setIsExpanded(false)}>
              ✕
            </button>
          </div>
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
