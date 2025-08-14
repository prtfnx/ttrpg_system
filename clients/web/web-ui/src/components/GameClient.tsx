import React from 'react';
import { GameCanvas } from './GameCanvas';
import { RightPanel } from './RightPanel';
import { ToolsPanel } from './ToolsPanel';
import { useAuthenticatedWebSocket } from '../hooks/useAuthenticatedWebSocket';
import type { UserInfo } from '../services/auth.service';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface GameClientProps {
  sessionCode: string;
  userInfo: UserInfo;
  userRole: 'dm' | 'player';
  onAuthError: () => void;
}

// Simple error boundary for debugging
class DebugErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log error for debugging
    console.error('ErrorBoundary caught:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return <div style={{background:'#f00',color:'#fff',padding:32,fontWeight:700,fontSize:24}}>[ERROR] {this.state.error?.toString()}</div>;
    }
    return this.props.children;
  }
}

export function GameClient({ sessionCode, userInfo, userRole, onAuthError }: GameClientProps) {
  const { connectionState, error } = useAuthenticatedWebSocket({
    sessionCode,
    userInfo
  });

  // Handle authentication errors
  if (error?.includes('Authentication failed')) {
    onAuthError();
    return null;
  }

  return (
    <DebugErrorBoundary>
      <div className="game-layout">
        {/* Connection status indicator */}
        <div className={`connection-status ${connectionState}`}>
          <span className="status-indicator"></span>
          <span className="status-text">
            {connectionState === 'connecting' && 'Connecting...'}
            {connectionState === 'connected' && `Connected as ${userInfo.username} (${userRole})`}
            {connectionState === 'disconnected' && 'Disconnected'}
            {connectionState === 'error' && `Error: ${error}`}
          </span>
        </div>

        <div className="left-panel">
          <ToolsPanel />
        </div>
        <div className="canvas-container">
          <GameCanvas />
        </div>
        <div className="right-panel">
          <RightPanel />
        </div>
      </div>
    </DebugErrorBoundary>
  );
}
