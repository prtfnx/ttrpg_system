import { useGameStore } from '@/store';
import { AssetPanel, BackgroundManagementPanel } from '@features/assets';
import { CharacterPanel } from '@features/character';
import { ChatPanel } from '@features/chat';
import { InitiativeTracker } from '@features/combat';
import { CompendiumPanel } from '@features/compendium';
import { FogPanel } from '@features/fog';
import { LightingPanel } from '@features/lighting';
import { AdvancedMeasurementPanel } from '@features/measurement';
import { type SessionRole, canInteract, isDM, isElevated } from '@features/session/types/roles';
import { TableManagementPanel, TablePanel, TableSettingsPanel, TableSyncPanel } from '@features/table';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { ActionQueuePanel } from '../features/actions/components/ActionQueuePanel';
import { ActionsPanel } from '../features/actions/components/ActionsPanel';
import { ActionsQuickPanel } from '../features/actions/components/ActionsQuickPanel';
import { EntitiesPanel } from '../features/canvas/components/EntitiesPanel';
import PerformanceSettingsPanel from '../features/canvas/components/PerformanceSettingsPanel';
import { CustomizePanel } from '../features/character/components/CustomizePanel';
import { NetworkPanel } from '../features/network/components/NetworkPanel';
import { PlayerManagerPanel } from '../features/network/components/PlayerManagerPanel';
import styles from './RightPanel.module.css';

const isDevelopment = import.meta.env.DEV;

type TabId = 'tables' | 'grid' | 'table-tools' | 'characters' | 'entities' | 'chat' | 'lighting' | 'fog' |
             'sync' | 'players' | 'actions' | 'quick-actions' | 'queue' | 'compendium' | 'assets' |
             'network' | 'initiative' | 'performance' | 'backgrounds' | 'measurement' | 'customize';

const TAB_VISIBLE: Record<TabId, (role: SessionRole) => boolean> = {
  // DM tabs
  'tables':        isDM,
  'grid':          isDM,
  'quick-actions': isDM,
  'players':       isDM,
  'lighting':      isDM,
  'fog':           isDM,
  'backgrounds':   isDM,
  'performance':   isDM,
  // Elevated tabs
  'compendium':    isElevated,
  // Interactive tabs (everyone except spectator)
  'characters':    canInteract,
  'chat':          canInteract,
  // All interactive roles
  'entities':      isDM,
  'initiative':    () => true,
  'measurement':   () => true,
  'customize':     () => true,
  // Dev-only (always gated by isDevelopment at render time)
  'table-tools':   isDM,
  'sync':          isDM,
  'actions':       isDM,
  'queue':         isDM,
  'assets':        isDM,
  'network':       isDM,
};

const DEFAULT_TAB_ORDER: TabId[] = [
  'tables', 'grid', 'compendium', 'quick-actions', 'characters', 'entities',
  'players', 'initiative', 'chat', 'lighting', 'fog', 'measurement',
  'backgrounds', 'performance', 'customize',
];

export function RightPanel(props: { sessionCode?: string; userInfo?: any; userRole?: string }) {
  const [activeTab, setActiveTab] = useState<TabId>('entities');
  const canvasRef = useRef<HTMLCanvasElement>(null!);
  const sessionRole = (useGameStore(s => s.sessionRole) ?? props.userRole ?? 'player') as SessionRole;

  const isVisible = (tab: TabId) => TAB_VISIBLE[tab]?.(sessionRole) ?? false;

  // If current tab becomes hidden, switch to first visible tab
  useEffect(() => {
    if (!isVisible(activeTab)) {
      const first = DEFAULT_TAB_ORDER.find(t => isVisible(t));
      if (first) setActiveTab(first);
    }
  }, [sessionRole]);

  const tab = (id: TabId, label: string) => {
    if (!isVisible(id)) return null;
    return (
      <button
        key={id}
        role="tab"
        aria-selected={activeTab === id}
        className={clsx(styles.tabButton, activeTab === id && 'active')}
        onClick={() => setActiveTab(id)}
      >
        {label}
      </button>
    );
  };

  return (
    <div className={styles.rightPanelContainer}>
      <div className={styles.tabsContainer} role="tablist" aria-label="Panel navigation">
        {tab('compendium', 'Compendium')}
        {tab('tables', 'Tables')}
        {tab('grid', 'Grid')}
        {tab('quick-actions', 'Quick Actions')}
        {tab('characters', 'Characters')}
        {tab('players', 'Players')}
        {tab('initiative', 'Initiative')}
        {tab('entities', 'Entities')}
        {tab('chat', 'Chat')}
        {tab('lighting', 'Lighting')}
        {tab('fog', 'Fog')}
        {tab('measurement', 'Measurement')}
        {tab('backgrounds', 'Backgrounds')}
        {tab('performance', 'Performance')}
        {tab('customize', 'Customize')}
        {isDevelopment && tab('table-tools', 'Table Tools')}
        {isDevelopment && tab('sync', 'Sync')}
        {isDevelopment && tab('actions', 'Actions')}
        {isDevelopment && tab('queue', 'Queue')}
        {isDevelopment && tab('assets', 'Assets')}
        {isDevelopment && tab('network', 'Network')}
      </div>
      <div className={styles.tabContent} role="tabpanel" aria-label={`${activeTab} panel`}>
        {activeTab === 'tables' && <TableManagementPanel />}
        {activeTab === 'grid' && <TableSettingsPanel />}
        {activeTab === 'quick-actions' && <ActionsQuickPanel renderEngine={window.rustRenderManager as any || null} />}
        {isDevelopment && activeTab === 'table-tools' && <TablePanel />}
        {isDevelopment && activeTab === 'sync' && <TableSyncPanel />}
        {activeTab === 'characters' && <CharacterPanel />}
        {activeTab === 'players' && <PlayerManagerPanel sessionCode={props.sessionCode!} userInfo={{...props.userInfo, role: sessionRole}} />}
        {activeTab === 'initiative' && <InitiativeTracker sessionCode={props.sessionCode!} userInfo={{...props.userInfo, role: sessionRole}} />}
        {isDevelopment && activeTab === 'actions' && <ActionsPanel renderEngine={window.rustRenderManager as any || null} />}
        {isDevelopment && activeTab === 'queue' && <ActionQueuePanel sessionCode={props.sessionCode!} userInfo={props.userInfo!} />}
        {activeTab === 'entities' && <EntitiesPanel />}
        {activeTab === 'chat' && <ChatPanel />}
        {activeTab === 'lighting' && <LightingPanel />}
        {activeTab === 'fog' && <FogPanel />}
        {activeTab === 'measurement' && <AdvancedMeasurementPanel isOpen={true} onClose={() => setActiveTab('entities')} canvasRef={canvasRef} />}
        {activeTab === 'backgrounds' && <BackgroundManagementPanel isOpen={true} onClose={() => setActiveTab('entities')} renderEngine={window.rustRenderManager as any || null} />}
        {activeTab === 'performance' && <PerformanceSettingsPanel isVisible={true} onClose={() => setActiveTab('entities')} />}
        {activeTab === 'customize' && <CustomizePanel />}
        {activeTab === 'compendium' && <CompendiumPanel />}
        {isDevelopment && activeTab === 'assets' && <AssetPanel />}
        {isDevelopment && activeTab === 'network' && <NetworkPanel />}
      </div>
    </div>
  );
}
