import { useEffect, useState } from 'react';
import './App.css';
import { GameClient } from './components/GameClient';
import { SessionSelector } from './components/SessionSelector';
import { authService, type UserInfo } from './services/auth.service';

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
      <div className="app">
        <SessionSelector onSessionSelected={handleSessionSelected} />
      </div>
    );
  }

  return (
    <div className="app">
      <GameClient 
        sessionCode={state.selectedSession}
        userInfo={state.userInfo}
        userRole={state.userRole!}
        onAuthError={handleAuthError}
      />
    </div>
  );
}

export default App
