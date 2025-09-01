
import { useState } from 'react';
import { ActionQueuePanel } from './ActionQueuePanel';
import { CharacterManager } from './CharacterManager';
import ChatPanel from './ChatPanel';
import { CompendiumPanel } from './CompendiumPanel';
import { EntitiesPanel } from './EntitiesPanel';
import { FogPanel } from './FogPanel';
import { LightingPanel } from './LightingPanel';
import { PaintPanel } from './PaintPanel';
import { PlayerManagerPanel } from './PlayerManagerPanel';
import { TableManagementPanel } from './TableManagementPanel';
import TableSyncPanel from './TableSyncPanel';

// Development-only imports
const isDevelopment = import.meta.env.DEV;
const NetworkPanel = isDevelopment ? await import('./NetworkPanel').then(m => m.default).catch(() => null) : null;
const ActionsPanel = isDevelopment ? await import('./ActionsPanel').then(m => m.default).catch(() => null) : null;


export function RightPanel(props: { sessionCode?: string; userInfo?: any }) {
  const [activeTab, setActiveTab] = useState<'tables' | 'characters' | 'entities' | 'chat' | 'lighting' | 'fog' | 'paint' | 'sync' | 'players' | 'actions' | 'compendium'>('tables');

  return (
    <div className="game-panel right-panel" style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#111827', borderLeft: '1px solid #374151' }}>
      <div className="tabs-container">
        <button className={`tab-button ${activeTab === 'compendium' ? 'active' : ''}`} onClick={() => setActiveTab('compendium')}>Compendium</button>
        <button className={`tab-button ${activeTab === 'tables' ? 'active' : ''}`} onClick={() => setActiveTab('tables')}>Tables</button>
        <button className={`tab-button ${activeTab === 'sync' ? 'active' : ''}`} onClick={() => setActiveTab('sync')}>Sync</button>
        <button className={`tab-button ${activeTab === 'characters' ? 'active' : ''}`} onClick={() => setActiveTab('characters')}>Characters</button>
        <button className={`tab-button ${activeTab === 'players' ? 'active' : ''}`} onClick={() => setActiveTab('players')}>Players</button>
        <button className={`tab-button ${activeTab === 'entities' ? 'active' : ''}`} onClick={() => setActiveTab('entities')}>Entities</button>
        <button className={`tab-button ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>Chat</button>
        <button className={`tab-button ${activeTab === 'lighting' ? 'active' : ''}`} onClick={() => setActiveTab('lighting')}>Lighting</button>
        <button className={`tab-button ${activeTab === 'fog' ? 'active' : ''}`} onClick={() => setActiveTab('fog')}>Fog</button>
        <button className={`tab-button ${activeTab === 'paint' ? 'active' : ''}`} onClick={() => setActiveTab('paint')}>Paint</button>
      </div>
      <div className="tab-content">
        {activeTab === 'tables' && <TableManagementPanel />}
        {activeTab === 'sync' && <TableSyncPanel />}
        {activeTab === 'characters' && <CharacterManager sessionCode={props.sessionCode!} userInfo={props.userInfo!} />}
        {activeTab === 'players' && <PlayerManagerPanel sessionCode={props.sessionCode!} userInfo={props.userInfo!} />}
        {activeTab === 'actions' && <ActionQueuePanel sessionCode={props.sessionCode!} userInfo={props.userInfo!} />}
        {activeTab === 'entities' && <EntitiesPanel />}
        {activeTab === 'chat' && <ChatPanel />}
        {activeTab === 'lighting' && <LightingPanel />}
        {activeTab === 'fog' && <FogPanel />}
        {activeTab === 'paint' && <PaintPanel renderEngine={window.rustRenderManager as any || null} />}
        {activeTab === 'compendium' && <CompendiumPanel />}
      </div>
    </div>
  );
}
