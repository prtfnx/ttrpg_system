/**
 * Session selection component for choosing game sessions before connecting
 * Shows user's available sessions with role information
 */
import { useEffect, useState } from 'react';
import { authService, type SessionInfo } from '../services/auth.service';

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
      <div className="session-selector loading">
        <div className="loading-content">
          <div className="spinner"></div>
          <p>Loading your game sessions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="session-selector error">
        <div className="error-content">
          <h2>Unable to Load Sessions</h2>
          <p className="error-message">{error}</p>
          <div className="error-actions">
            <button onClick={handleRetry} className="retry-btn">
              Try Again
            </button>
            <button onClick={handleLogout} className="logout-btn">
              Logout
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="session-selector empty">
        <div className="empty-content">
          <h2>No Game Sessions</h2>
          <p>You don't have access to any game sessions yet.</p>
          <p>Contact your Dungeon Master to get invited to a game.</p>
          <button onClick={handleLogout} className="logout-btn">
            Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="session-selector">
      <div className="session-header">
        <h2>Select Game Session</h2>
        <button onClick={handleLogout} className="logout-btn small">
          Logout
        </button>
      </div>
      
      <div className="sessions-grid">
        {sessions.map((session) => (
          <div 
            key={session.session_code}
            className={`session-card ${session.role}`}
            onClick={() => handleSessionClick(session)}
          >
            <div className="session-info">
              <h3 className="session-name">{session.session_name}</h3>
              <p className="session-code">Code: {session.session_code}</p>
              <p className="session-date">
                Created: {new Date(session.created_at).toLocaleDateString()}
              </p>
            </div>
            
            <div className="session-role">
              <span className={`role-badge ${session.role}`}>
                {session.role.toUpperCase()}
              </span>
            </div>
            
            <div className="session-action">
              <button className="join-btn">
                Join Game
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
