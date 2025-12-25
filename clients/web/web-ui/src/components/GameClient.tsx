import clsx from 'clsx';
import React, { useEffect } from 'react';
import { useAuthenticatedWebSocket } from '../hooks/useAuthenticatedWebSocket';
import type { UserInfo } from '../services/auth.service';
import { GameCanvas } from './GameCanvas';
import styles from './GameClient.module.css';
import { RightPanel } from './RightPanel';
import { TokenConfigModal } from './TokenConfigModal';
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

  // Expose protocol globally for integration points (read-only usage by components)
  useEffect(() => {
    if (protocol) (window as any).protocol = protocol;
    return () => { if ((window as any).protocol === protocol) delete (window as any).protocol; };
  }, [protocol]);

  // SSoT Pattern: activeTableId lives ONLY in Zustand store
  // Components should use: const { activeTableId } = useGameStore();
  // Services should use: useGameStore.getState().activeTableId

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

  // Token config modal state
  const [tokenConfigSpriteId, setTokenConfigSpriteId] = React.useState<string | null>(null);

  // Listen for double-click events from Rust WASM
  useEffect(() => {
    const handleTokenDoubleClick = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { spriteId } = customEvent.detail;
      console.log('[GameClient] Token double-click on sprite:', spriteId);
      setTokenConfigSpriteId(spriteId);
    };

    window.addEventListener('tokenDoubleClick', handleTokenDoubleClick);
    return () => {
      window.removeEventListener('tokenDoubleClick', handleTokenDoubleClick);
    };
  }, []);

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
      
      // Trigger multiple resize notifications for better canvas detection
      window.dispatchEvent(new Event('resize'));
      // Also trigger a direct request animation frame callback for immediate effect
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
      });
    };
    
    const onDragEnd = () => {
      dragRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      
      // Final resize trigger after drag ends to ensure canvas updates
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 100);
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
      <div className={styles.gameLayout}>
        {leftVisible && (
          <div className={styles.leftPanel} style={{ width: leftWidth }}>
            <div className={clsx(styles.connectionStatus, styles[connectionState])}>
              <span className={styles.statusIndicator}></span>
              <span>
                {connectionState === 'connecting' && 'Connecting...'}
                {connectionState === 'connected' && `Connected as ${userInfo.username} (${userRole})`}
                {connectionState === 'disconnected' && 'Disconnected'}
                {connectionState === 'error' && `Error: ${error}`}
              </span>
            </div>
            <ToolsPanel userInfo={userInfo} />
          </div>
        )}
        
        {leftVisible && (
          <div 
            className={clsx(styles.panelResizer, styles.leftResizer)} 
            onMouseDown={e => onDragStart('left', e)}
          />
        )}
        
        <div className={styles.canvasContainer}>
          <GameCanvas />
          {!leftVisible && (
            <button className={clsx(styles.expandBtn, styles.left)} onClick={toggleLeft}>▶</button>
          )}
          {!rightVisible && (
            <button className={clsx(styles.expandBtn, styles.right)} onClick={toggleRight}>◀</button>
          )}
          {leftVisible && (
            <button className={styles.collapseBtn} onClick={toggleLeft}>◀</button>
          )}
          {rightVisible && (
            <button className={styles.collapseBtnRight} onClick={toggleRight}>▶</button>
          )}
        </div>
        
        {rightVisible && (
          <div 
            className={clsx(styles.panelResizer, styles.rightResizer)} 
            onMouseDown={e => onDragStart('right', e)}
          />
        )}
        
        {rightVisible && (
          <div className={styles.rightPanel} style={{ width: rightWidth }}>
            <RightPanel sessionCode={sessionCode} userInfo={userInfo} />
          </div>
        )}

        {/* Token Configuration Modal */}
        {tokenConfigSpriteId && (
          <TokenConfigModal
            spriteId={tokenConfigSpriteId}
            onClose={() => setTokenConfigSpriteId(null)}
          />
        )}
      </div>
    </DebugErrorBoundary>
  );
}
