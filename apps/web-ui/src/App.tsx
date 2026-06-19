import { GameClient } from '@features/canvas/components/GameClient';
import { WindowManagerProvider } from '@shared/components/FloatingWindow';
import { ToastContainer } from 'react-toastify';
// CSS is loaded via CDN or not needed in test environment
// import 'react-toastify/dist/ReactToastify.css';
import { ProtocolProvider } from '@app/providers';
import { SessionSelector } from '@features/session/components/SessionSelector';
import { ErrorBoundary } from '@shared/components/ErrorBoundary';
import { useAppBootstrap } from '@app/hooks/useAppBootstrap';
import styles from './App.module.css';
import { WasmRuntimeProvider } from './lib/wasm/runtime';

function App() {
  const { state, handleSessionSelected, handleAuthError } = useAppBootstrap();

  if (state.loading) {
    return (
      <div className={`${styles.app} ${styles.loadingScreen}`}>
        <div className={styles.loadingContent}>
          <div className={styles.spinner}></div>
          <h2>Loading TTRPG System</h2>
          <p>Initializing authentication...</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className={`${styles.app} ${styles.errorScreen}`}>
        <div className={styles.errorContent}>
          <h2>Authentication Error</h2>
          <p>{state.error}</p>
        </div>
      </div>
    );
  }

  if (!state.isAuthenticated || !state.userInfo) {
    return (
      <div className={`${styles.app} ${styles.errorScreen}`}>
        <div className={styles.errorContent}>
          <h2>Not Authenticated</h2>
          <p>Redirecting to login...</p>
        </div>
      </div>
    );
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
          <WasmRuntimeProvider>
            <WindowManagerProvider>
              <GameClient 
                sessionCode={state.selectedSession}
                userInfo={state.userInfo}
                userRole={state.userRole!}
                onAuthError={handleAuthError}
              />
            </WindowManagerProvider>
          </WasmRuntimeProvider>
        </ProtocolProvider>
        <ToastContainer theme="dark" />
      </div>
    </ErrorBoundary>
  );
}

export default App
