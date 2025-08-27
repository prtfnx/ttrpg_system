import React, { useEffect, useState } from 'react';

interface CompendiumEntry {
  id: string;
  type: 'monster' | 'spell' | 'equipment';
  name: string;
  description: string;
  stats?: Record<string, any>;
}

// Example: Replace with real backend or static JSON fetch
const fetchCompendium = async (): Promise<CompendiumEntry[]> => {
  // TODO: Replace with protocol/backend call
  return [
    { id: 'm1', type: 'monster', name: 'Goblin', description: 'Small humanoid, chaotic evil', stats: { hp: 7, ac: 15 } },
    { id: 's1', type: 'spell', name: 'Fireball', description: 'A bright streak flashes...', stats: { level: 3, damage: '8d6' } },
    { id: 'e1', type: 'equipment', name: 'Longsword', description: 'Martial melee weapon', stats: { damage: '1d8', weight: 3 } },
  ];
};

export const CompendiumPanel: React.FC = () => {
  const [entries, setEntries] = useState<CompendiumEntry[]>([]);
  const [search, setSearch] = useState('');
  const [dragged, setDragged] = useState<CompendiumEntry | null>(null);

  useEffect(() => {
    fetchCompendium().then(setEntries);
  }, []);

  const filtered = entries.filter(e => e.name.toLowerCase().includes(search.toLowerCase()));

  // Drag start handler
  const onDragStart = (entry: CompendiumEntry) => {
    setDragged(entry);
  };

  // Drag end handler
  const onDragEnd = () => {
    setDragged(null);
  };

  // Drop handler (simulate drag-to-table)
  const onDropToTable = () => {
    if (dragged) {
      // TODO: Integrate with table/sprite creation protocol
      window.dispatchEvent(new CustomEvent('compendium-drop', { detail: dragged }));
      setDragged(null);
    }
  };

  return (
    <div className="compendium-panel" style={{background:'#18181b',color:'#fff',padding:16}}>
      <h3>D&D 5e Compendium</h3>
      <input
        type="text"
        placeholder="Search..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{width:'100%',marginBottom:12,padding:6,fontSize:14}}
      />
      <div style={{display:'flex',gap:8}}>
        <div style={{flex:1}}>
          <h4>Entries</h4>
          <div style={{maxHeight:320,overflowY:'auto'}}>
            {filtered.map(entry => (
              <div
                key={entry.id}
                draggable
                onDragStart={() => onDragStart(entry)}
                onDragEnd={onDragEnd}
                style={{border:'1px solid #374151',borderRadius:4,padding:8,marginBottom:8,background:'#222',cursor:'grab'}}
              >
                <strong>{entry.name}</strong> <span style={{fontSize:12,color:'#a3a3a3'}}>[{entry.type}]</span>
                <div style={{fontSize:13}}>{entry.description}</div>
                {entry.stats && <pre style={{fontSize:12,background:'#18181b',padding:4}}>{JSON.stringify(entry.stats,null,2)}</pre>}
              </div>
            ))}
            {filtered.length === 0 && <div style={{color:'#f87171'}}>No entries found</div>}
          </div>
        </div>
        <div
          style={{width:180,minHeight:180,border:'2px dashed #3b82f6',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',background:'#222'}}
          onDragOver={e => e.preventDefault()}
          onDrop={onDropToTable}
        >
          <span style={{color:'#3b82f6'}}>Drop here to add to table</span>
        </div>
      </div>
    </div>
  );
};
