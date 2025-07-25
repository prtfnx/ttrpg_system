import { useState } from 'react';

export function RightPanel() {
  const [activeTab, setActiveTab] = useState('characters');
  const [showCharacterModal, setShowCharacterModal] = useState(false);
  const [characterStep, setCharacterStep] = useState(0);
  const [newChar, setNewChar] = useState({
    name: '',
    class: '',
    stats: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    equipment: '',
  });

  return (
    <div className="game-panel right-panel" style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc', borderLeft: '1px solid #e5e7eb' }}>
      <div className="tabs" style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
        <button className={activeTab === 'characters' ? 'active' : ''} style={{ flex: 1, padding: '12px', background: activeTab === 'characters' ? '#fff' : 'transparent', border: 'none', borderBottom: activeTab === 'characters' ? '2px solid #6366f1' : 'none', cursor: 'pointer' }} onClick={() => setActiveTab('characters')}>Characters</button>
        <button className={activeTab === 'chat' ? 'active' : ''} style={{ flex: 1, padding: '12px', background: activeTab === 'chat' ? '#fff' : 'transparent', border: 'none', borderBottom: activeTab === 'chat' ? '2px solid #6366f1' : 'none', cursor: 'pointer' }} onClick={() => setActiveTab('chat')}>Chat</button>
        <button className={activeTab === 'entities' ? 'active' : ''} style={{ flex: 1, padding: '12px', background: activeTab === 'entities' ? '#fff' : 'transparent', border: 'none', borderBottom: activeTab === 'entities' ? '2px solid #6366f1' : 'none', cursor: 'pointer' }} onClick={() => setActiveTab('entities')}>Entities</button>
      </div>
      <div className="tab-content" style={{ flex: 1, padding: '16px' }}>
        {activeTab === 'characters' && (
          <div>
            <h3>Characters</h3>
            <button style={{ padding: '8px 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '4px', marginBottom: '16px', cursor: 'pointer' }} onClick={() => { setShowCharacterModal(true); setCharacterStep(0); }}>Add Character</button>
            {/* Character list placeholder */}
            <div style={{ color: '#666', fontStyle: 'italic' }}>Character list will appear here.</div>
          </div>
        )}
        {activeTab === 'chat' && (
          <div>
            <h3>Chat</h3>
            <div style={{ color: '#666', fontStyle: 'italic' }}>Chat UI will appear here.</div>
          </div>
        )}
        {activeTab === 'entities' && (
          <div>
            <h3>Entities</h3>
            <div style={{ color: '#666', fontStyle: 'italic' }}>Entities list will appear here.</div>
          </div>
        )}
      </div>
      {/* Modal for character manager (placeholder) */}
      {showCharacterModal && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="modal-content" style={{ background: '#fff', padding: '32px', borderRadius: '8px', minWidth: '400px', boxShadow: '0 2px 16px rgba(0,0,0,0.15)' }}>
            <h2>Add Character</h2>
            {/* Multi-step wizard scaffold */}
            {characterStep === 0 && (
              <div>
                <label>Name:</label>
                <input type="text" value={newChar.name} onChange={e => setNewChar({ ...newChar, name: e.target.value })} style={{ width: '100%', marginBottom: '8px' }} />
                <label>Class:</label>
                <input type="text" value={newChar.class} onChange={e => setNewChar({ ...newChar, class: e.target.value })} style={{ width: '100%', marginBottom: '8px' }} />
                <button style={{ marginTop: '16px', padding: '8px 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }} onClick={() => setCharacterStep(1)}>Next</button>
              </div>
            )}
            {characterStep === 1 && (
              <div>
                <label>Stats:</label>
                {Object.entries(newChar.stats).map(([stat, value]) => (
                  <div key={stat} style={{ marginBottom: '4px' }}>
                    <span style={{ width: '80px', display: 'inline-block' }}>{stat.charAt(0).toUpperCase() + stat.slice(1)}:</span>
                    <input type="number" min={1} max={20} value={value} onChange={e => setNewChar({ ...newChar, stats: { ...newChar.stats, [stat]: Number(e.target.value) } })} style={{ width: '60px' }} />
                  </div>
                ))}
                <button style={{ marginTop: '16px', marginRight: '8px', padding: '8px 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }} onClick={() => setCharacterStep(2)}>Next</button>
                <button style={{ marginTop: '16px', padding: '8px 16px', background: '#e5e7eb', color: '#333', border: 'none', borderRadius: '4px', cursor: 'pointer' }} onClick={() => setCharacterStep(0)}>Back</button>
              </div>
            )}
            {characterStep === 2 && (
              <div>
                <label>Equipment:</label>
                <input type="text" value={newChar.equipment} onChange={e => setNewChar({ ...newChar, equipment: e.target.value })} style={{ width: '100%', marginBottom: '8px' }} />
                <button style={{ marginTop: '16px', marginRight: '8px', padding: '8px 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }} onClick={() => setCharacterStep(3)}>Next</button>
                <button style={{ marginTop: '16px', padding: '8px 16px', background: '#e5e7eb', color: '#333', border: 'none', borderRadius: '4px', cursor: 'pointer' }} onClick={() => setCharacterStep(1)}>Back</button>
              </div>
            )}
            {characterStep === 3 && (
              <div>
                <h3>Overview</h3>
                <div>Name: {newChar.name}</div>
                <div>Class: {newChar.class}</div>
                <div>Stats: {Object.entries(newChar.stats).map(([stat, value]) => `${stat.toUpperCase()}: ${value}`).join(', ')}</div>
                <div>Equipment: {newChar.equipment}</div>
                <button style={{ marginTop: '16px', padding: '8px 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }} onClick={() => { setShowCharacterModal(false); setCharacterStep(0); }}>Finish</button>
                <button style={{ marginTop: '16px', marginLeft: '8px', padding: '8px 16px', background: '#e5e7eb', color: '#333', border: 'none', borderRadius: '4px', cursor: 'pointer' }} onClick={() => setCharacterStep(2)}>Back</button>
              </div>
            )}
            <button style={{ marginTop: '24px', padding: '8px 16px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }} onClick={() => setShowCharacterModal(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
