
import { useState } from 'react';
import CharacterPanel from './CharacterPanel';
import ChatPanel from './ChatPanel';
import { EntitiesPanel } from './EntitiesPanel';
import { LightingPanel } from './LightingPanel';

export function RightPanel() {
  const [activeTab, setActiveTab] = useState<'characters' | 'entities' | 'chat' | 'lighting'>('characters');

  return (
    <div className="game-panel right-panel" style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc', borderLeft: '1px solid #e5e7eb' }}>
      <div className="tabs" style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
        <button className={activeTab === 'characters' ? 'active' : ''} style={{ flex: 1, padding: '12px', background: activeTab === 'characters' ? '#fff' : 'transparent', border: 'none', borderBottom: activeTab === 'characters' ? '2px solid #6366f1' : 'none', cursor: 'pointer' }} onClick={() => setActiveTab('characters')}>Characters</button>
        <button className={activeTab === 'entities' ? 'active' : ''} style={{ flex: 1, padding: '12px', background: activeTab === 'entities' ? '#fff' : 'transparent', border: 'none', borderBottom: activeTab === 'entities' ? '2px solid #6366f1' : 'none', cursor: 'pointer' }} onClick={() => setActiveTab('entities')}>Entities</button>
        <button className={activeTab === 'chat' ? 'active' : ''} style={{ flex: 1, padding: '12px', background: activeTab === 'chat' ? '#fff' : 'transparent', border: 'none', borderBottom: activeTab === 'chat' ? '2px solid #6366f1' : 'none', cursor: 'pointer' }} onClick={() => setActiveTab('chat')}>Chat</button>
        <button className={activeTab === 'lighting' ? 'active' : ''} style={{ flex: 1, padding: '12px', background: activeTab === 'lighting' ? '#fff' : 'transparent', border: 'none', borderBottom: activeTab === 'lighting' ? '2px solid #6366f1' : 'none', cursor: 'pointer' }} onClick={() => setActiveTab('lighting')}>Lighting</button>
      </div>
      <div className="tab-content" style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
        {activeTab === 'characters' && <CharacterPanel />}
        {activeTab === 'entities' && <EntitiesPanel />}
        {activeTab === 'chat' && <ChatPanel />}
        {activeTab === 'lighting' && <LightingPanel />}
      </div>
    </div>
  );
}
