import React from 'react';
import { GameCanvas } from './GameCanvas';
import { RightPanel } from './RightPanel';
import { ToolsPanel } from './ToolsPanel';
// Simple error boundary for debugging
class DebugErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: any}> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(_error: any, _info: any) {
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
