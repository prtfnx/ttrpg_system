import React, { useEffect } from 'react';
import { useAuthenticatedWebSocket } from '../hooks/useAuthenticatedWebSocket';
import type { UserInfo } from '../services/auth.service';
import { GameCanvas } from './GameCanvas';
import './GameClient.css';
import { RightPanel } from './RightPanel';
import { ToolsPanel } from './ToolsPanel';

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
  const { connectionState, error, protocol } = useAuthenticatedWebSocket({
    sessionCode,
    userInfo
  });

  // Expose protocol and active table id globally for integration points (read-only usage by components)
  useEffect(() => {
    if (protocol) (window as any).protocol = protocol;
    return () => { if ((window as any).protocol === protocol) delete (window as any).protocol; };
  }, [protocol]);

  // Expose activeTableId for components that need the current table context (e.g. Compendium drag)
  useEffect(() => {
    const handler = (e: Event) => {
      // update when table is switched by store events
      const custom = e as CustomEvent;
      (window as any).activeTableId = custom.detail?.table_id || null;
    };
    window.addEventListener('table-data-received', handler);
    return () => window.removeEventListener('table-data-received', handler);
  }, []);

  // Handle asset download requests from WASM integration service
  useEffect(() => {
    const handleAssetDownloadRequest = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { asset_id } = customEvent.detail;
      
      if (protocol && protocol.downloadAsset) {
        console.log('Handling asset download request for:', asset_id);
        protocol.downloadAsset(asset_id);
      } else {
        console.warn('Protocol not available for asset download:', asset_id);
      }
    };

    window.addEventListener('request-asset-download', handleAssetDownloadRequest);
    return () => {
      window.removeEventListener('request-asset-download', handleAssetDownloadRequest);
    };
  }, [protocol]);

  // Handle authentication errors
  if (error?.includes('Authentication failed')) {
    onAuthError();
    return null;
  }

  // Panel size state with localStorage persistence
  const [leftWidth, setLeftWidth] = React.useState(() => {
    const v = localStorage.getItem('panel_left_width');
    return v ? parseInt(v) : 320;
  });
  const [rightWidth, setRightWidth] = React.useState(() => {
    const v = localStorage.getItem('panel_right_width');
    return v ? parseInt(v) : 400;
  });
  const [leftVisible, setLeftVisible] = React.useState(() => {
    const v = localStorage.getItem('panel_left_visible');
    return v !== 'false';
  });
  const [rightVisible, setRightVisible] = React.useState(() => {
    const v = localStorage.getItem('panel_right_visible');
    return v !== 'false';
  });

  // Handle drag to resize panels
  const dragRef = React.useRef<{ side: 'left'|'right', startX: number, startWidth: number }|null>(null);
  
  const onDragStart = (side: 'left'|'right', e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { side, startX: e.clientX, startWidth: side === 'left' ? leftWidth : rightWidth };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    console.log(`🔄 GameClient: Starting ${side} panel resize`);
  };
  
  React.useEffect(() => {
    const onDrag = (e: MouseEvent) => {
      if (!dragRef.current) return;
      e.preventDefault();
      
      const dx = e.clientX - dragRef.current.startX;
      if (dragRef.current.side === 'left') {
        let w = Math.max(200, Math.min(600, dragRef.current.startWidth + dx));
        setLeftWidth(w);
        localStorage.setItem('panel_left_width', w.toString());
        console.log(`📏 GameClient: Left panel width: ${w}px`);
      } else {
        let w = Math.max(250, Math.min(600, dragRef.current.startWidth - dx));
        setRightWidth(w);
        localStorage.setItem('panel_right_width', w.toString());
        console.log(`📏 GameClient: Right panel width: ${w}px`);
      }
    };
    
    const onDragEnd = () => {
      if (dragRef.current) {
        console.log(`✅ GameClient: Finished resizing ${dragRef.current.side} panel`);
      }
      dragRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', onDragEnd);
    return () => {
      document.removeEventListener('mousemove', onDrag);
      document.removeEventListener('mouseup', onDragEnd);
    };
  }, []); // Remove dependency on leftWidth, rightWidth to prevent recreating listeners

  // Persist panel visibility
  const toggleLeft = () => {
    localStorage.setItem('panel_left_visible', (!leftVisible).toString());
    setLeftVisible(v => !v);
  };
  const toggleRight = () => {
    localStorage.setItem('panel_right_visible', (!rightVisible).toString());
    setRightVisible(v => !v);
  };

  return (
    <DebugErrorBoundary>
      <div className="game-layout">
        {leftVisible && (
          <div className="left-panel" style={{ width: leftWidth }}>
            <div className={`connection-status ${connectionState}`}>
              <span className="status-indicator"></span>
              <span className="status-text">
                {connectionState === 'connecting' && 'Connecting...'}
                {connectionState === 'connected' && `Connected as ${userInfo.username} (${userRole})`}
                {connectionState === 'disconnected' && 'Disconnected'}
                {connectionState === 'error' && `Error: ${error}`}
              </span>
            </div>
            <ToolsPanel userInfo={userInfo} />
            <button className="collapse-btn" onClick={toggleLeft}>◀</button>
          </div>
        )}
        
        {leftVisible && (
          <div 
            className="panel-resizer left-resizer" 
            onMouseDown={e => onDragStart('left', e)}
          />
        )}
        
        <div className="canvas-container">
          <GameCanvas />
          <div className="canvas-controls">
            {!leftVisible && (
              <button className="expand-btn left" onClick={toggleLeft}>▶</button>
            )}
            {!rightVisible && (
              <button className="expand-btn right" onClick={toggleRight}>◀</button>
            )}
          </div>
        </div>
        
        {rightVisible && (
          <div 
            className="panel-resizer right-resizer" 
            onMouseDown={e => onDragStart('right', e)}
          />
        )}
        
        {rightVisible && (
          <div className="right-panel" style={{ width: rightWidth }}>
            <RightPanel sessionCode={sessionCode} userInfo={userInfo} />
            <button className="collapse-btn" onClick={toggleRight}>▶</button>
          </div>
        )}
      </div>
    </DebugErrorBoundary>
  );
}
