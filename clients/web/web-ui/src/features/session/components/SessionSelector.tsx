/**
 * Session selection component for choosing game sessions before connecting
 * Shows user's available sessions with role information
 */
import styles from '@/App.module.css';
import { authService, type SessionInfo } from '@features/auth';
import clsx from 'clsx';
import { useEffect, useState } from 'react';

interface SessionSelectorProps {
  onSessionSelected: (sessionCode: string, role: 'dm' | 'player') => void;
}

export function SessionSelector({ onSessionSelected }: SessionSelectorProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const userSessions = await authService.getUserSessions();
      setSessions(userSessions);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load sessions';
      setError(errorMessage);
      console.error('Session loading error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSessionClick = (session: SessionInfo) => {
    onSessionSelected(session.session_code, session.role);
  };

  const handleRetry = () => {
    loadSessions();
  };

  const handleLogout = () => {
    authService.logout();
  };

  if (loading) {
    return (
      <div className={styles.sessionSelector}>
        <div className={styles.loadingContent}>
          <div className={styles.spinner}></div>
          <p>Loading your game sessions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.sessionSelector}>
        <div className={styles.errorContent}>
          <h2>Unable to Load Sessions</h2>
          <p className={styles.errorMessage}>{error}</p>
          <div className={styles.errorActions}>
            <button onClick={handleRetry} className={styles.retryBtn}>
              Try Again
            </button>
            <button onClick={handleLogout} className={styles.logoutBtn}>
              Logout
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className={styles.sessionSelector}>
        <div className={styles.emptyContent}>
          <h2>No Game Sessions</h2>
          <p>You don't have access to any game sessions yet.</p>
          <p>Contact your Dungeon Master to get invited to a game.</p>
          <button onClick={handleLogout} className={styles.logoutBtn}>
            Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.sessionSelector}>
      <div className={styles.sessionHeader}>
        <h2>Select Game Session</h2>
        <button onClick={handleLogout} className={clsx(styles.logoutBtn, styles.small)}>
          Logout
        </button>
      </div>
      
      <div className={styles.sessionsGrid} role="list" aria-label="Available game sessions">
        {sessions.map((session) => (
          <div 
            key={session.session_code}
            role="listitem"
            aria-label={`Session: ${session.session_name}, Role: ${session.role}`}
            className={clsx(styles.sessionCard, styles[session.role])}
            onClick={() => handleSessionClick(session)}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleSessionClick(session);
              }
            }}
          >
            <div className={styles.sessionInfo}>
              <h3>{session.session_name}</h3>
              <p>Code: {session.session_code}</p>
              <p>
                Created: {new Date(session.created_at).toLocaleDateString()}
              </p>
            </div>
            
            <div className={styles.sessionRole}>
              <span className={clsx(styles.roleBadge, styles[session.role])}>
                {session.role.toUpperCase()}
              </span>
            </div>
            
            <div>
              <button 
                className={styles.joinBtn}
                aria-label={`Join ${session.session_name} as ${session.role}`}
                onClick={(e) => {
                  e.stopPropagation(); // Prevent double-trigger from parent click
                  handleSessionClick(session);
                }}
              >
                Join Game
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
