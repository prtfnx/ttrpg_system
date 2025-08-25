
import { useState } from 'react';
import { CharacterManager } from './CharacterManager';
import { PlayerManager } from './PlayerManager';
import ChatPanel from './ChatPanel';
import { EntitiesPanel } from './EntitiesPanel';
import { FogPanel } from './FogPanel';
import { LightingPanel } from './LightingPanel';
import { PaintPanel } from './PaintPanel';
import { TableManagementPanel } from './TableManagementPanel';
import TableSyncPanel from './TableSyncPanel';


export function RightPanel(props: { sessionCode?: string; userInfo?: any }) {
  const [activeTab, setActiveTab] = useState<'tables' | 'characters' | 'entities' | 'chat' | 'lighting' | 'fog' | 'paint' | 'sync' | 'players'>('tables');

  return (
    <div className="game-panel right-panel" style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#111827', borderLeft: '1px solid #374151' }}>
      <div className="tabs" style={{ display: 'flex', borderBottom: '1px solid #374151' }}>
        <button className={activeTab === 'tables' ? 'active' : ''} style={{ flex: 1, padding: '8px', background: activeTab === 'tables' ? '#1f2937' : 'transparent', border: 'none', borderBottom: activeTab === 'tables' ? '2px solid #3b82f6' : 'none', cursor: 'pointer', fontSize: '11px', color: '#ffffff' }} onClick={() => setActiveTab('tables')}>Tables</button>
        <button className={activeTab === 'sync' ? 'active' : ''} style={{ flex: 1, padding: '8px', background: activeTab === 'sync' ? '#1f2937' : 'transparent', border: 'none', borderBottom: activeTab === 'sync' ? '2px solid #3b82f6' : 'none', cursor: 'pointer', fontSize: '11px', color: '#ffffff' }} onClick={() => setActiveTab('sync')}>Sync</button>
        <button className={activeTab === 'characters' ? 'active' : ''} style={{ flex: 1, padding: '8px', background: activeTab === 'characters' ? '#1f2937' : 'transparent', border: 'none', borderBottom: activeTab === 'characters' ? '2px solid #3b82f6' : 'none', cursor: 'pointer', fontSize: '11px', color: '#ffffff' }} onClick={() => setActiveTab('characters')}>Characters</button>
        <button className={activeTab === 'players' ? 'active' : ''} style={{ flex: 1, padding: '8px', background: activeTab === 'players' ? '#1f2937' : 'transparent', border: 'none', borderBottom: activeTab === 'players' ? '2px solid #3b82f6' : 'none', cursor: 'pointer', fontSize: '11px', color: '#ffffff' }} onClick={() => setActiveTab('players')}>Players</button>
        <button className={activeTab === 'entities' ? 'active' : ''} style={{ flex: 1, padding: '8px', background: activeTab === 'entities' ? '#1f2937' : 'transparent', border: 'none', borderBottom: activeTab === 'entities' ? '2px solid #3b82f6' : 'none', cursor: 'pointer', fontSize: '11px', color: '#ffffff' }} onClick={() => setActiveTab('entities')}>Entities</button>
        <button className={activeTab === 'chat' ? 'active' : ''} style={{ flex: 1, padding: '8px', background: activeTab === 'chat' ? '#1f2937' : 'transparent', border: 'none', borderBottom: activeTab === 'chat' ? '2px solid #3b82f6' : 'none', cursor: 'pointer', fontSize: '11px', color: '#ffffff' }} onClick={() => setActiveTab('chat')}>Chat</button>
        <button className={activeTab === 'lighting' ? 'active' : ''} style={{ flex: 1, padding: '8px', background: activeTab === 'lighting' ? '#1f2937' : 'transparent', border: 'none', borderBottom: activeTab === 'lighting' ? '2px solid #3b82f6' : 'none', cursor: 'pointer', fontSize: '11px', color: '#ffffff' }} onClick={() => setActiveTab('lighting')}>Lighting</button>
        <button className={activeTab === 'fog' ? 'active' : ''} style={{ flex: 1, padding: '8px', background: activeTab === 'fog' ? '#1f2937' : 'transparent', border: 'none', borderBottom: activeTab === 'fog' ? '2px solid #3b82f6' : 'none', cursor: 'pointer', fontSize: '11px', color: '#ffffff' }} onClick={() => setActiveTab('fog')}>Fog</button>
        <button className={activeTab === 'paint' ? 'active' : ''} style={{ flex: 1, padding: '8px', background: activeTab === 'paint' ? '#1f2937' : 'transparent', border: 'none', borderBottom: activeTab === 'paint' ? '2px solid #3b82f6' : 'none', cursor: 'pointer', fontSize: '11px', color: '#ffffff' }} onClick={() => setActiveTab('paint')}>Paint</button>
      </div>
      <div className="tab-content" style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
        {activeTab === 'tables' && <TableManagementPanel />}
        {activeTab === 'sync' && <TableSyncPanel />}
        {activeTab === 'characters' && <CharacterManager sessionCode={props.sessionCode!} userInfo={props.userInfo!} />}
        {activeTab === 'players' && <PlayerManager sessionCode={props.sessionCode!} userInfo={props.userInfo!} />}
        {activeTab === 'entities' && <EntitiesPanel />}
        {activeTab === 'chat' && <ChatPanel />}
        {activeTab === 'lighting' && <LightingPanel />}
        {activeTab === 'fog' && <FogPanel />}
        {activeTab === 'paint' && <PaintPanel renderEngine={window.rustRenderManager as any || null} />}
      </div>
    </div>
  );
}
