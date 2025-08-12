
import { useState } from 'react';
import CharacterPanel from './CharacterPanel';
import ChatPanel from './ChatPanel';
import { EntitiesPanel } from './EntitiesPanel';
import { FogPanel } from './FogPanel';
import { LightingPanel } from './LightingPanel';
import { PaintPanel } from './PaintPanel';

export function RightPanel() {
  const [activeTab, setActiveTab] = useState<'characters' | 'entities' | 'chat' | 'lighting' | 'fog' | 'paint'>('characters');

  return (
    <div className="game-panel right-panel" style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc', borderLeft: '1px solid #e5e7eb' }}>
      <div className="tabs" style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
        <button className={activeTab === 'characters' ? 'active' : ''} style={{ flex: 1, padding: '8px', background: activeTab === 'characters' ? '#fff' : 'transparent', border: 'none', borderBottom: activeTab === 'characters' ? '2px solid #6366f1' : 'none', cursor: 'pointer', fontSize: '11px' }} onClick={() => setActiveTab('characters')}>Characters</button>
        <button className={activeTab === 'entities' ? 'active' : ''} style={{ flex: 1, padding: '8px', background: activeTab === 'entities' ? '#fff' : 'transparent', border: 'none', borderBottom: activeTab === 'entities' ? '2px solid #6366f1' : 'none', cursor: 'pointer', fontSize: '11px' }} onClick={() => setActiveTab('entities')}>Entities</button>
        <button className={activeTab === 'chat' ? 'active' : ''} style={{ flex: 1, padding: '8px', background: activeTab === 'chat' ? '#fff' : 'transparent', border: 'none', borderBottom: activeTab === 'chat' ? '2px solid #6366f1' : 'none', cursor: 'pointer', fontSize: '11px' }} onClick={() => setActiveTab('chat')}>Chat</button>
        <button className={activeTab === 'lighting' ? 'active' : ''} style={{ flex: 1, padding: '8px', background: activeTab === 'lighting' ? '#fff' : 'transparent', border: 'none', borderBottom: activeTab === 'lighting' ? '2px solid #6366f1' : 'none', cursor: 'pointer', fontSize: '11px' }} onClick={() => setActiveTab('lighting')}>Lighting</button>
        <button className={activeTab === 'fog' ? 'active' : ''} style={{ flex: 1, padding: '8px', background: activeTab === 'fog' ? '#fff' : 'transparent', border: 'none', borderBottom: activeTab === 'fog' ? '2px solid #6366f1' : 'none', cursor: 'pointer', fontSize: '11px' }} onClick={() => setActiveTab('fog')}>Fog</button>
        <button className={activeTab === 'paint' ? 'active' : ''} style={{ flex: 1, padding: '8px', background: activeTab === 'paint' ? '#fff' : 'transparent', border: 'none', borderBottom: activeTab === 'paint' ? '2px solid #6366f1' : 'none', cursor: 'pointer', fontSize: '11px' }} onClick={() => setActiveTab('paint')}>Paint</button>
      </div>
      <div className="tab-content" style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
        {activeTab === 'characters' && <CharacterPanel />}
        {activeTab === 'entities' && <EntitiesPanel />}
        {activeTab === 'chat' && <ChatPanel />}
        {activeTab === 'lighting' && <LightingPanel />}
        {activeTab === 'fog' && <FogPanel />}
        {activeTab === 'paint' && <PaintPanel renderEngine={window.rustRenderManager as any || null} />}
      </div>
    </div>
  );
}
