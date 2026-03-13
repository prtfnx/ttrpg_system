import { useGameStore } from '@/store';
import { RightPanel } from '@app/RightPanel';
import type { UserInfo } from '@features/auth';
import { useAuthenticatedWebSocket } from '@features/auth';
import { visionService } from '@features/lighting/services/vision.service';
import { SessionManagementPanel } from '@features/session';
import { isDM, type SessionRole } from '@features/session/types/roles';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import React, { useEffect } from 'react';
import { GameCanvas } from './GameCanvas';
import styles from './GameClient.module.css';
import { TokenConfigModal } from './TokenConfigModal';
import { ToolsPanel } from './ToolsPanel';

const ALL_LAYERS = ['map', 'tokens', 'dungeon_master', 'light', 'height', 'obstacles', 'fog_of_war'] as const;

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
  userRole: SessionRole;
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
  // sessionRole is authoritative after WELCOME is received; fall back to prop until then
  const sessionRole = useGameStore(s => s.sessionRole) ?? userRole;
  const visibleLayers = useGameStore(s => s.visibleLayers);
  const layerVisibility = useGameStore(s => s.layerVisibility);
  const userId = useGameStore(s => s.userId);

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

  // Set WASM GM mode based on role — call immediately when effect runs (handles re-mounts too)
  useEffect(() => {
    const apply = () => {
      const engine = window.rustRenderManager;
      if (engine?.set_gm_mode) {
        engine.set_gm_mode(isDM(sessionRole));
        (engine as any).fog_set_gm_mode?.(isDM(sessionRole));
      }
    };
    apply();
    // Also apply when WASM render manager becomes available (may init after this effect)
    window.addEventListener('render-manager-ready', apply);
    return () => window.removeEventListener('render-manager-ready', apply);
  }, [sessionRole]);

  // Pass current user ID to WASM for sprite ownership enforcement
  useEffect(() => {
    if (userId != null) {
      window.rustRenderManager?.set_current_user_id?.(userId);
    }
  }, [userId]);

  // Sync WASM layer visibility — role gates + user toggles both apply
  useEffect(() => {
    const engine = window.rustRenderManager;
    if (!engine?.set_layer_visibility) return;
    const allowed = new Set(isDM(sessionRole) ? ALL_LAYERS : visibleLayers);
    for (const layer of ALL_LAYERS) {
      const roleAllows = allowed.has(layer);
      const userToggle = layerVisibility[layer] ?? true;
      engine.set_layer_visibility(layer, roleAllows && userToggle);
    }
  }, [sessionRole, visibleLayers, layerVisibility]);

  // Vision service: run for non-DMs to compute LOS; stop for DMs (they see all)
  useEffect(() => {
    if (isDM(sessionRole)) {
      visionService.stop();
    } else {
      visionService.start();
    }
    return () => visionService.stop();
  }, [sessionRole]);

  // Handle DM force-switching all players to a table
  useEffect(() => {
    const handler = (e: Event) => {
      const { tableId } = (e as CustomEvent).detail;
      if (tableId) useGameStore.getState().switchToTable(tableId);
    };
    window.addEventListener('table-force-switch', handler);
    return () => window.removeEventListener('table-force-switch', handler);
  }, []);

  // Apply fog updates received from other clients in real-time
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Record<string, any>;
      if (!detail || detail.type !== 'fog_update') return;
      const engine = window.rustRenderManager;
      if (!engine) return;
      const data = detail.data as Record<string, any>;
      if (!data) return;
      engine.clear_fog?.();
      const hideRects: Array<[[number, number], [number, number]]> = data.hide_rectangles ?? [];
      const revealRects: Array<[[number, number], [number, number]]> = data.reveal_rectangles ?? [];
      hideRects.forEach(([start, end], i) =>
        engine.add_fog_rectangle?.(`hide_${i}`, start[0], start[1], end[0], end[1], 'hide')
      );
      revealRects.forEach(([start, end], i) =>
        engine.add_fog_rectangle?.(`reveal_${i}`, start[0], start[1], end[0], end[1], 'reveal')
      );
    };
    window.addEventListener('table-updated', handler);
    return () => window.removeEventListener('table-updated', handler);
  }, []);

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
                {connectionState === 'connected' && `Connected as ${userInfo.username} (${sessionRole})`}
                {connectionState === 'disconnected' && 'Disconnected'}
                {connectionState === 'error' && `Error: ${error}`}
              </span>
            </div>
            <ToolsPanel userInfo={userInfo} />
            <button className={styles.collapseBtn} onClick={toggleLeft} title="Collapse panel"><ChevronLeft size={16} aria-hidden /></button>
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
          
          {/* Panel expand buttons positioned directly in canvas */}
          {!leftVisible && (
            <button className={clsx(styles.expandBtn, styles.left)} onClick={toggleLeft} title="Expand panel"><ChevronRight size={16} aria-hidden /></button>
          )}
          {!rightVisible && (
            <button className={clsx(styles.expandBtn, styles.right)} onClick={toggleRight} title="Expand panel"><ChevronLeft size={16} aria-hidden /></button>
          )}
          
          {/* Other canvas controls */}
          <div className={styles.canvasControls}>
            {/* Additional controls can go here */}
          </div>
        </div>
        
        {rightVisible && (
          <div 
            className={clsx(styles.panelResizer, styles.rightResizer)} 
            onMouseDown={e => onDragStart('right', e)}
          />
        )}
        
        {rightVisible && (
          <div className={styles.rightPanel} style={{ width: rightWidth }}>
            <RightPanel sessionCode={sessionCode} userInfo={userInfo} userRole={userRole} />
            <button className={styles.collapseBtn} onClick={toggleRight} title="Collapse panel"><ChevronRight size={16} aria-hidden /></button>
          </div>
        )}

        {/* Token Configuration Modal */}
        {tokenConfigSpriteId && (
          <TokenConfigModal
            spriteId={tokenConfigSpriteId}
            onClose={() => setTokenConfigSpriteId(null)}
          />
        )}

        {/* Session Management Panel - floating for DM users */}
        {sessionCode && isDM(sessionRole) && (
          <SessionManagementPanel sessionCode={sessionCode} />
        )}
      </div>
    </DebugErrorBoundary>
  );
}
