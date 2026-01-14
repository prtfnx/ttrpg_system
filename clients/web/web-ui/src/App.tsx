import { useEffect, useState } from 'react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import styles from './App.module.css';
import { useAuth } from './components/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GameClient } from './components/GameClient';
import { SessionSelector } from './components/SessionSelector';
import { authService } from './services/auth.service';
import { ProtocolProvider } from './services/ProtocolContext';
import { logger } from './utils/logger';

interface AppState {
  selectedSession: string | null;
  userRole: 'dm' | 'player' | null;
  loading: boolean;
  error: string | null;
}

function App() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [state, setState] = useState<AppState>({
    selectedSession: null,
    userRole: null,
    loading: true,
    error: null
  });

  useEffect(() => {
    initializeSession();
  }, [isAuthenticated]);

  const initializeSession = async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      if (!isAuthenticated) {
        setState(prev => ({ ...prev, loading: false }));
        return;
      }
      
      const initData = (window as any).__INITIAL_DATA__;
      if (initData && initData.sessionCode) {
        logger.debug('📦 App: Found server initial data, candidate:', initData.sessionCode);
        try {
          const sessions = await authService.getUserSessions();
          const byCode = sessions.find((s: any) => s.session_code === initData.sessionCode);
          const byName = sessions.find((s: any) => s.session_name === initData.sessionCode);
          const resolved = byCode ? byCode.session_code : (byName ? byName.session_code : null);
          const matchedSession = byCode || byName;
          if (resolved && matchedSession) {
            logger.debug('🔎 App: Resolved initial session to code:', resolved);
            const mappedRole = (matchedSession.role === 'owner' || matchedSession.role === 'co_dm') ? 'dm' : 'player';
            setState(prev => ({
              ...prev,
              selectedSession: resolved,
              userRole: mappedRole,
              loading: false
            }));
            return;
          }
          logger.warn('⚠️ App: Could not resolve injected session value to a known session code; using value as-is');
        } catch (err) {
          logger.warn('Failed to resolve initial session against user sessions:', err);
        }
        setState(prev => ({
          ...prev,
          selectedSession: initData.sessionCode,
          userRole: initData.userRole || prev.userRole,
          loading: false
        }));
        return;
      }

      setState(prev => ({ ...prev, loading: false }));
    } catch (error) {
      console.error('💥 App: Session initialization failed:', error);
      setState(prev => ({
        ...prev,
        error: 'Session initialization failed.',
        loading: false
      }));
    }
  };

  const handleSessionSelected = (sessionCode: string, role: 'dm' | 'player') => {
    setState(prev => ({
      ...prev,
      selectedSession: sessionCode,
      userRole: role
    }));
  };

  const handleAuthError = () => {
    setState(prev => ({
      ...prev,
      error: 'Authentication expired. Please login again.',
      isAuthenticated: false,
      userInfo: null
    }));
    
    setTimeout(() => {
      authService.logout();
    }, 2000);
  };

  if (authLoading || state.loading) {
    return (
      <div className={`${styles.app} ${styles.loadingScreen}`}>
        <div className={styles.loadingContent}>
          <div className={styles.spinner}></div>
          <h2>Loading TTRPG System</h2>
          <p>Initializing...</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className={`${styles.app} ${styles.errorScreen}`}>
        <div className={styles.errorContent}>
          <h2>Error</h2>
          <p>{state.error}</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    window.location.href = '/users/login';
    return null;
  }

  if (!state.selectedSession) {
    return (
      <ErrorBoundary>
        <div className={styles.app}>
          <SessionSelector onSessionSelected={handleSessionSelected} />
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className={styles.app}>
        <ProtocolProvider sessionCode={state.selectedSession}>
          <GameClient 
            sessionCode={state.selectedSession}
            userInfo={user}
            userRole={state.userRole!}
            onAuthError={handleAuthError}
          />
        </ProtocolProvider>
        <ToastContainer theme="dark" />
      </div>
    </ErrorBoundary>
  );
}

export default App
