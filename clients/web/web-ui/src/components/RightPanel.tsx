import clsx from 'clsx';
import { useRef, useState } from 'react';
import { ActionQueuePanel } from './ActionQueuePanel';
import { ActionsPanel } from './ActionsPanel';
import { ActionsQuickPanel } from './ActionsQuickPanel';
import AdvancedMeasurementPanel from './AdvancedMeasurementPanel';
import { AssetPanel } from './AssetPanel';
import BackgroundManagementPanel from './BackgroundManagementPanel';
import CharacterPanelRedesigned from './CharacterPanelRedesigned';
import ChatPanel from './ChatPanel';
import { CompendiumPanel } from './CompendiumPanel';
import { EntitiesPanel } from './EntitiesPanel';
import { FogPanel } from './FogPanel';
import InitiativeTracker from './InitiativeTracker';
import { LayerPanel } from './LayerPanel';
import { LightingPanel } from './LightingPanel';
import { NetworkPanel } from './NetworkPanel';
import { PaintPanel } from './PaintPanel';
import PerformanceSettingsPanel from './PerformanceSettingsPanel';
import { PlayerManagerPanel } from './PlayerManagerPanel';
import styles from './RightPanel.module.css';
import { TableManagementPanel } from './TableManagementPanel';
import TablePanel from './TablePanel';
import TableSyncPanel from './TableSyncPanel';

// Development-only imports
const isDevelopment = import.meta.env.DEV;

export function RightPanel(props: { sessionCode?: string; userInfo?: any }) {
  const [activeTab, setActiveTab] = useState<'tables' | 'table-tools' | 'characters' | 'entities' | 'chat' | 'lighting' | 'fog' | 'paint' | 'sync' | 'players' | 'actions' | 'quick-actions' | 'queue' | 'compendium' | 'assets' | 'network' | 'initiative' | 'layers' | 'performance' | 'backgrounds' | 'measurement'>('tables');
  const canvasRef = useRef<HTMLCanvasElement>(null!);

  return (
    <div className={styles.rightPanelContainer}>
      <div className={styles.tabsContainer}>
        <button className={clsx(styles.tabButton, activeTab === 'compendium' && 'active')} onClick={() => setActiveTab('compendium')}>Compendium</button>
        <button className={clsx(styles.tabButton, activeTab === 'tables' && 'active')} onClick={() => setActiveTab('tables')}>Tables</button>
        <button className={clsx(styles.tabButton, activeTab === 'quick-actions' && 'active')} onClick={() => setActiveTab('quick-actions')}>Quick Actions</button>
        {isDevelopment && <button className={clsx(styles.tabButton, activeTab === 'table-tools' && 'active')} onClick={() => setActiveTab('table-tools')}>Table Tools</button>}
        {isDevelopment && <button className={clsx(styles.tabButton, activeTab === 'sync' && 'active')} onClick={() => setActiveTab('sync')}>Sync</button>}
        <button className={clsx(styles.tabButton, activeTab === 'characters' && 'active')} onClick={() => setActiveTab('characters')}>Characters</button>
        <button className={clsx(styles.tabButton, activeTab === 'players' && 'active')} onClick={() => setActiveTab('players')}>Players</button>
        <button className={clsx(styles.tabButton, activeTab === 'initiative' && 'active')} onClick={() => setActiveTab('initiative')}>Initiative</button>
        <button className={clsx(styles.tabButton, activeTab === 'entities' && 'active')} onClick={() => setActiveTab('entities')}>Entities</button>
        <button className={clsx(styles.tabButton, activeTab === 'chat' && 'active')} onClick={() => setActiveTab('chat')}>Chat</button>
        <button className={clsx(styles.tabButton, activeTab === 'lighting' && 'active')} onClick={() => setActiveTab('lighting')}>Lighting</button>
        <button className={clsx(styles.tabButton, activeTab === 'fog' && 'active')} onClick={() => setActiveTab('fog')}>Fog</button>
        <button className={clsx(styles.tabButton, activeTab === 'paint' && 'active')} onClick={() => setActiveTab('paint')}>Paint</button>
        <button className={clsx(styles.tabButton, activeTab === 'layers' && 'active')} onClick={() => setActiveTab('layers')}>Layers</button>
        {isDevelopment && <button className={clsx(styles.tabButton, activeTab === 'measurement' && 'active')} onClick={() => setActiveTab('measurement')}>Measurement</button>}
        {isDevelopment && <button className={clsx(styles.tabButton, activeTab === 'backgrounds' && 'active')} onClick={() => setActiveTab('backgrounds')}>Backgrounds</button>}
        {isDevelopment && <button className={clsx(styles.tabButton, activeTab === 'performance' && 'active')} onClick={() => setActiveTab('performance')}>Performance</button>}
        {isDevelopment && <button className={clsx(styles.tabButton, activeTab === 'actions' && 'active')} onClick={() => setActiveTab('actions')}>Actions</button>}
        {isDevelopment && <button className={clsx(styles.tabButton, activeTab === 'queue' && 'active')} onClick={() => setActiveTab('queue')}>Queue</button>}
        {isDevelopment && <button className={clsx(styles.tabButton, activeTab === 'assets' && 'active')} onClick={() => setActiveTab('assets')}>Assets</button>}
        {isDevelopment && <button className={clsx(styles.tabButton, activeTab === 'network' && 'active')} onClick={() => setActiveTab('network')}>Network</button>}
      </div>
      <div className={styles.tabContent}>
        {activeTab === 'tables' && <TableManagementPanel />}
        {activeTab === 'quick-actions' && <ActionsQuickPanel renderEngine={window.rustRenderManager as any || null} />}
        {isDevelopment && activeTab === 'table-tools' && <TablePanel />}
        {isDevelopment && activeTab === 'sync' && <TableSyncPanel />}
        {activeTab === 'characters' && <CharacterPanelRedesigned />}
        {activeTab === 'players' && <PlayerManagerPanel sessionCode={props.sessionCode!} userInfo={props.userInfo!} />}
        {activeTab === 'initiative' && <InitiativeTracker sessionCode={props.sessionCode!} userInfo={props.userInfo!} />}
        {isDevelopment && activeTab === 'actions' && <ActionsPanel renderEngine={window.rustRenderManager as any || null} />}
        {isDevelopment && activeTab === 'queue' && <ActionQueuePanel sessionCode={props.sessionCode!} userInfo={props.userInfo!} />}
        {activeTab === 'entities' && <EntitiesPanel />}
        {activeTab === 'chat' && <ChatPanel />}
        {activeTab === 'lighting' && <LightingPanel />}
        {activeTab === 'fog' && <FogPanel />}
        {activeTab === 'paint' && <PaintPanel />}
        {activeTab === 'layers' && <LayerPanel />}
        {isDevelopment && activeTab === 'measurement' && <AdvancedMeasurementPanel isOpen={true} onClose={() => setActiveTab('tables')} canvasRef={canvasRef} />}
        {isDevelopment && activeTab === 'backgrounds' && <BackgroundManagementPanel isOpen={true} onClose={() => setActiveTab('tables')} renderEngine={window.rustRenderManager as any || null} />}
        {isDevelopment && activeTab === 'performance' && <PerformanceSettingsPanel isVisible={true} onClose={() => setActiveTab('tables')} />}
        {activeTab === 'compendium' && <CompendiumPanel />}
        {isDevelopment && activeTab === 'assets' && <AssetPanel />}
        {isDevelopment && activeTab === 'network' && <NetworkPanel />}
      </div>
    </div>
  );
}
