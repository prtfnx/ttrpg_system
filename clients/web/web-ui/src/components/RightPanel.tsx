
import { useState } from 'react';
import { ActionQueuePanel } from './ActionQueuePanel';
import { ActionsPanel } from './ActionsPanel';
import { AssetPanel } from './AssetPanel';
import { CharacterManager } from './CharacterManager';
import ChatPanel from './ChatPanel';
import { CompendiumPanel } from './CompendiumPanel';
import { EntitiesPanel } from './EntitiesPanel';
import { FogPanel } from './FogPanel';
import { LightingPanel } from './LightingPanel';
import { NetworkPanel } from './NetworkPanel';
import { PaintPanel } from './PaintPanel';
import { PlayerManagerPanel } from './PlayerManagerPanel';
import { TableManagementPanel } from './TableManagementPanel';
import TablePanel from './TablePanel';
import TableSyncPanel from './TableSyncPanel';

// Development-only imports
const isDevelopment = import.meta.env.DEV;


export function RightPanel(props: { sessionCode?: string; userInfo?: any }) {
  const [activeTab, setActiveTab] = useState<'tables' | 'table-tools' | 'characters' | 'entities' | 'chat' | 'lighting' | 'fog' | 'paint' | 'sync' | 'players' | 'actions' | 'queue' | 'compendium' | 'assets' | 'network'>('tables');

  return (
    <div className="game-panel right-panel" style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#111827', borderLeft: '1px solid #374151' }}>
      <div className="tabs-container">
        <button className={`tab-button ${activeTab === 'compendium' ? 'active' : ''}`} onClick={() => setActiveTab('compendium')}>Compendium</button>
        <button className={`tab-button ${activeTab === 'tables' ? 'active' : ''}`} onClick={() => setActiveTab('tables')}>Tables</button>
        {isDevelopment && <button className={`tab-button ${activeTab === 'table-tools' ? 'active' : ''}`} onClick={() => setActiveTab('table-tools')}>Table Tools</button>}
        {isDevelopment && <button className={`tab-button ${activeTab === 'sync' ? 'active' : ''}`} onClick={() => setActiveTab('sync')}>Sync</button>}
        <button className={`tab-button ${activeTab === 'characters' ? 'active' : ''}`} onClick={() => setActiveTab('characters')}>Characters</button>
        <button className={`tab-button ${activeTab === 'players' ? 'active' : ''}`} onClick={() => setActiveTab('players')}>Players</button>
        <button className={`tab-button ${activeTab === 'entities' ? 'active' : ''}`} onClick={() => setActiveTab('entities')}>Entities</button>
        <button className={`tab-button ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>Chat</button>
        <button className={`tab-button ${activeTab === 'lighting' ? 'active' : ''}`} onClick={() => setActiveTab('lighting')}>Lighting</button>
        <button className={`tab-button ${activeTab === 'fog' ? 'active' : ''}`} onClick={() => setActiveTab('fog')}>Fog</button>
        <button className={`tab-button ${activeTab === 'paint' ? 'active' : ''}`} onClick={() => setActiveTab('paint')}>Paint</button>
        {isDevelopment && <button className={`tab-button ${activeTab === 'actions' ? 'active' : ''}`} onClick={() => setActiveTab('actions')}>Actions</button>}
        {isDevelopment && <button className={`tab-button ${activeTab === 'queue' ? 'active' : ''}`} onClick={() => setActiveTab('queue')}>Queue</button>}
        {isDevelopment && <button className={`tab-button ${activeTab === 'assets' ? 'active' : ''}`} onClick={() => setActiveTab('assets')}>Assets</button>}
        {isDevelopment && <button className={`tab-button ${activeTab === 'network' ? 'active' : ''}`} onClick={() => setActiveTab('network')}>Network</button>}
      </div>
      <div className="tab-content">
        {activeTab === 'tables' && <TableManagementPanel />}
        {isDevelopment && activeTab === 'table-tools' && <TablePanel />}
        {isDevelopment && activeTab === 'sync' && <TableSyncPanel />}
        {activeTab === 'characters' && <CharacterManager sessionCode={props.sessionCode!} userInfo={props.userInfo!} />}
        {activeTab === 'players' && <PlayerManagerPanel sessionCode={props.sessionCode!} userInfo={props.userInfo!} />}
        {isDevelopment && activeTab === 'actions' && <ActionsPanel renderEngine={window.rustRenderManager as any || null} />}
        {isDevelopment && activeTab === 'queue' && <ActionQueuePanel sessionCode={props.sessionCode!} userInfo={props.userInfo!} />}
        {activeTab === 'entities' && <EntitiesPanel />}
        {activeTab === 'chat' && <ChatPanel />}
        {activeTab === 'lighting' && <LightingPanel />}
        {activeTab === 'fog' && <FogPanel />}
        {activeTab === 'paint' && <PaintPanel renderEngine={window.rustRenderManager as any || null} />}
        {activeTab === 'compendium' && <CompendiumPanel />}
        {isDevelopment && activeTab === 'assets' && <AssetPanel />}
        {isDevelopment && activeTab === 'network' && <NetworkPanel />}
      </div>
    </div>
  );
}
