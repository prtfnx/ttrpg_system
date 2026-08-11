import { useGameStore } from '@/store';
import { AssetPanel, BackgroundManagementPanel } from '@features/assets';
import { CharacterPanel } from '@features/character';
import { ChatPanel } from '@features/chat';
import { CompendiumPanel } from '@features/compendium';
import { FogPanel } from '@features/fog';
import { LightingPanel } from '@features/lighting';
import { type SessionRole, canInteract, isDM, isElevated } from '@features/session/types/roles';
import { MapPanel, TableManagementPanel, TablePanel } from '@features/table';
import { useActionsEngine, useRenderEngine } from '@lib/wasm/runtime';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { ActionQueuePanel } from '../features/actions/components/ActionQueuePanel';
import { ActionsPanel } from '../features/actions/components/ActionsPanel';
import { ActionsQuickPanel } from '../features/actions/components/ActionsQuickPanel';
import { EntitiesPanel } from '../features/canvas/components/EntitiesPanel';
import PerformanceSettingsPanel from '../features/canvas/components/PerformanceSettingsPanel';
import { CustomizePanel } from '../features/character/components/CustomizePanel';
import { PlayerManagerPanel } from '../features/network/components/PlayerManagerPanel';
import styles from './RightPanel.module.css';

const isDevelopment = import.meta.env.DEV;

type TabId = 'tables' | 'table-tools' | 'characters' | 'entities' | 'chat' | 'lighting' | 'fog' |
             'players' | 'actions' | 'quick-actions' | 'queue' | 'compendium' | 'assets' |
             'performance' | 'backgrounds' | 'customize' | 'map';

const TAB_VISIBLE: Record<TabId, (role: SessionRole) => boolean> = {
  // DM tabs
  'tables':        isDM,
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
  'entities':      () => true,
  'customize':     () => true,
  // Map panel
  'map':           isDM,
  // Dev-only (always gated by isDevelopment at render time)
  'table-tools':   isDM,
  'actions':       isDM,
  'queue':         isDM,
  'assets':        isDM,
};

const DEFAULT_TAB_ORDER: TabId[] = [
  'tables', 'compendium', 'quick-actions', 'characters', 'entities',
  'players', 'chat', 'lighting', 'fog',
  'backgrounds', 'map', 'performance', 'customize',
];

export function RightPanel(props: { sessionCode?: string; userInfo?: import('@features/auth').UserInfo; userRole?: SessionRole }) {
  const [activeTab, setActiveTab] = useState<TabId>('entities');
  const sessionRole = (useGameStore(s => s.sessionRole) ?? props.userRole ?? 'player') as SessionRole;
  const actionsEngine = useActionsEngine();
  const renderEngine = useRenderEngine();
  const isVisible = (tab: TabId) => TAB_VISIBLE[tab]?.(sessionRole) ?? false;

  // If current tab becomes hidden, switch to first visible tab
  useEffect(() => {
    if (!isVisible(activeTab)) {
      const first = DEFAULT_TAB_ORDER.find(t => isVisible(t));
      if (first) setActiveTab(first);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: activeTab/isVisible not tracked to avoid re-runs
  }, [sessionRole]);

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const tabs = Array.from(
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [],
    );
    const currentIndex = tabs.indexOf(event.currentTarget);
    let nextIndex: number | undefined;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = (currentIndex + 1) % tabs.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    tabs[nextIndex]?.focus();
    tabs[nextIndex]?.click();
  };

  const tab = (id: TabId, label: string) => {
    if (!isVisible(id)) return null;
    return (
      <button
        key={id}
        id={`right-panel-tab-${id}`}
        role="tab"
        aria-controls="right-panel-content"
        aria-selected={activeTab === id}
        tabIndex={activeTab === id ? 0 : -1}
        className={clsx(styles.tabButton, activeTab === id && 'active')}
        onClick={() => setActiveTab(id)}
        onKeyDown={handleTabKeyDown}
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
        {tab('quick-actions', 'Quick Actions')}
        {tab('characters', 'Characters')}
        {tab('players', 'Players')}
        {tab('entities', 'Entities')}
        {tab('chat', 'Chat')}
        {tab('lighting', 'Lighting')}
        {tab('fog', 'Fog')}
        {tab('backgrounds', 'Backgrounds')}
        {tab('performance', 'Performance')}
        {tab('customize', 'Customize')}
        {tab('map', 'Map')}
        {isDevelopment && tab('table-tools', 'Table Tools')}
        {isDevelopment && tab('actions', 'Actions')}
        {isDevelopment && tab('queue', 'Queue')}
        {isDevelopment && tab('assets', 'Assets')}
      </div>
      <div
        id="right-panel-content"
        className={styles.tabContent}
        role="tabpanel"
        aria-label={`${activeTab} panel`}
        aria-labelledby={`right-panel-tab-${activeTab}`}
      >
        {activeTab === 'tables' && <TableManagementPanel />}
        {activeTab === 'quick-actions' && <ActionsQuickPanel actionsEngine={actionsEngine} />}
        {isDevelopment && activeTab === 'table-tools' && <TablePanel />}
        {activeTab === 'characters' && <CharacterPanel />}
        {activeTab === 'players' && props.sessionCode && props.userInfo && (
          <PlayerManagerPanel
            sessionCode={props.sessionCode}
            userInfo={props.userInfo}
            sessionRole={sessionRole}
          />
        )}
        {isDevelopment && activeTab === 'actions' && <ActionsPanel actionsEngine={actionsEngine} />}
        {isDevelopment && activeTab === 'queue' && <ActionQueuePanel sessionCode={props.sessionCode!} userInfo={props.userInfo!} />}
        {activeTab === 'entities' && <EntitiesPanel />}
        {activeTab === 'chat' && <ChatPanel />}
        {activeTab === 'lighting' && <LightingPanel />}
        {activeTab === 'fog' && <FogPanel />}
        {activeTab === 'backgrounds' && <BackgroundManagementPanel isOpen={true} onClose={() => setActiveTab('entities')} renderEngine={renderEngine} />}
        {activeTab === 'performance' && <PerformanceSettingsPanel isVisible={true} onClose={() => setActiveTab('entities')} />}
        {activeTab === 'customize' && <CustomizePanel />}
        {activeTab === 'compendium' && <CompendiumPanel />}
        {isDevelopment && activeTab === 'assets' && <AssetPanel />}
        {activeTab === 'map' && <MapPanel />}
      </div>
    </div>
  );
}
