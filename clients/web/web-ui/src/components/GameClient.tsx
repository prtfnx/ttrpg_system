import React from 'react';
import { GameCanvas } from './GameCanvas';
import { RightPanel } from './RightPanel';
import { ToolsPanel } from './ToolsPanel';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
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
  componentDidCatch(_error: Error, _info: React.ErrorInfo) {
    // You can log error info here if needed
    // console.error('ErrorBoundary caught:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return <div style={{background:'#f00',color:'#fff',padding:32,fontWeight:700,fontSize:24}}>[ERROR] {this.state.error?.toString()}</div>;
    }
    return this.props.children;
  }
}

export function GameClient() {
  return (
    <DebugErrorBoundary>
      <div className="game-layout">
        <div className="left-panel">
          <ToolsPanel />
        </div>
        <div className="canvas-container">
          <GameCanvas />
        </div>
        <div className="right-panel">
          {<RightPanel />}
        </div>
      </div>
    </DebugErrorBoundary>
  );
}
