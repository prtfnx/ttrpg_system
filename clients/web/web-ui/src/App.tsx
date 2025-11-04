import { useEffect, useState } from 'react';
import './App.css';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GameClient } from './components/GameClient';
import { SessionSelector } from './components/SessionSelector';
import { authService, type UserInfo } from './services/auth.service';
import { ProtocolProvider } from './services/ProtocolContext';
import { logger } from './utils/logger';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

interface AppState {
  isAuthenticated: boolean;
  userInfo: UserInfo | null;
  selectedSession: string | null;
  userRole: 'dm' | 'player' | null;
  loading: boolean;
  error: string | null;
}

function App() {
  const [state, setState] = useState<AppState>({
    isAuthenticated: false,
    userInfo: null,
    selectedSession: null,
    userRole: null,
    loading: true,
    error: null
  });

  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    try {
      console.log('🚀 App: Starting authentication initialization...');
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      const isInitialized = await authService.initialize();
      console.log(`🔐 App: Authentication result: ${isInitialized}`);
      
      if (isInitialized) {
        const userInfo = authService.getUserInfo();
        console.log('✅ App: User authenticated successfully:', userInfo);
        // If server injected initial data (page was rendered for a specific
        // game session), prefer that sessionCode so the client connects by code.
        // If the injected value is actually a session name (older behavior),
        // attempt to resolve it to the user's session_code by querying the server.
        const initData = (window as any).__INITIAL_DATA__;
        if (initData && initData.sessionCode) {
          logger.debug('📦 App: Found server initial data, candidate:', initData.sessionCode);
          try {
            // Fetch user's sessions and try to match either by code or by name
            const sessions = await authService.getUserSessions();
            const byCode = sessions.find((s: any) => s.session_code === initData.sessionCode);
            const byName = sessions.find((s: any) => s.session_name === initData.sessionCode);
            const resolved = byCode ? byCode.session_code : (byName ? byName.session_code : null);
            if (resolved) {
              logger.debug('🔎 App: Resolved initial session to code:', resolved);
              setState(prev => ({
                ...prev,
                isAuthenticated: true,
                userInfo: userInfo || prev.userInfo,
                selectedSession: resolved,
                userRole: initData.userRole || prev.userRole,
                loading: false
              }));
              return;
            }
            // If resolution failed, fall back to using the injected value directly
            logger.warn('⚠️ App: Could not resolve injected session value to a known session code; using value as-is');
          } catch (err) {
            logger.warn('Failed to resolve initial session against user sessions:', err);
          }
          setState(prev => ({
            ...prev,
            isAuthenticated: true,
            userInfo: userInfo || prev.userInfo,
            selectedSession: initData.sessionCode,
            userRole: initData.userRole || prev.userRole,
            loading: false
          }));
          return;
        }

        setState(prev => ({
          ...prev,
          isAuthenticated: true,
          userInfo,
          loading: false
        }));
      } else {
        // No authentication token found - redirect to server login using relative URL
        console.log('❌ App: Authentication failed, redirecting to login...');
        window.location.href = '/users/login';
      }
    } catch (error) {
      console.error('💥 App: Authentication initialization failed:', error);
      setState(prev => ({
        ...prev,
        error: 'Authentication failed. Please try again.',
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

  if (state.loading) {
    return (
      <div className="app loading-screen">
        <div className="loading-content">
          <div className="spinner"></div>
          <h2>Loading TTRPG System</h2>
          <p>Initializing authentication...</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="app error-screen">
        <div className="error-content">
          <h2>Authentication Error</h2>
          <p>{state.error}</p>
        </div>
      </div>
    );
  }

  if (!state.isAuthenticated || !state.userInfo) {
    return (
      <div className="app error-screen">
        <div className="error-content">
          <h2>Not Authenticated</h2>
          <p>Redirecting to login...</p>
        </div>
      </div>
    );
  }

  if (!state.selectedSession) {
    return (
      <ErrorBoundary>
        <div className="app">
          <SessionSelector onSessionSelected={handleSessionSelected} />
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="app">
        <ProtocolProvider sessionCode={state.selectedSession}>
          <GameClient 
            sessionCode={state.selectedSession}
            userInfo={state.userInfo}
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
