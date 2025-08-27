import React, { useEffect, useState } from 'react';

interface CompendiumEntry {
  id: string;
  type: 'monster' | 'spell' | 'equipment';
  name: string;
  description: string;
  stats?: Record<string, any>;
}

// Fetch compendium data from a static JSON file served by the app
const fetchCompendium = async (): Promise<CompendiumEntry[]> => {
  const url = '/static/compendium/compendium.json';
  try {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`Failed to load compendium: ${res.status}`);
    const json = await res.json();
    return Array.isArray(json) ? json as CompendiumEntry[] : [];
  } catch (e) {
    console.error(e);
    return [];
  }
};

export const CompendiumPanel: React.FC = () => {
  const [entries, setEntries] = useState<CompendiumEntry[]>([]);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all'|'monster'|'spell'|'equipment'>('all');
  const [dragged, setDragged] = useState<CompendiumEntry | null>(null);

  useEffect(() => { fetchCompendium().then(setEntries); }, []);
  useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 250); return () => clearTimeout(t); }, [search]);

  const filtered = entries.filter(e => {
    if (typeFilter !== 'all' && e.type !== typeFilter) return false;
    if (!debounced) return true;
    return e.name.toLowerCase().includes(debounced.toLowerCase()) || (e.description||'').toLowerCase().includes(debounced.toLowerCase());
  });

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
      // If a protocol instance is available, use it to create a sprite from the compendium entry
      const protocol = (window as any).protocol as import('../protocol/clientProtocol').WebClientProtocol | undefined;
      if (protocol && typeof protocol.addCompendiumSprite === 'function') {
        const tableId = (window as any).activeTableId as string | undefined || null;
        protocol.addCompendiumSprite(tableId || '', {
          compendium_id: dragged.id,
          name: dragged.name,
          type: dragged.type,
          stats: dragged.stats || {},
          description: dragged.description || '',
        });
      } else {
        // Fallback event for other wiring in the app
        window.dispatchEvent(new CustomEvent('compendium-drop', { detail: dragged }));
      }
      setDragged(null);
    }
  };

  // Insert without dragging: ask protocol to add entry to active table
  const insertEntry = (entry: CompendiumEntry) => {
    const protocol = (window as any).protocol as import('../protocol/clientProtocol').WebClientProtocol | undefined;
    const tableId = (window as any).activeTableId as string | undefined || null;
    const payload = {
      compendium_id: entry.id,
      name: entry.name,
      type: entry.type,
      stats: entry.stats || {},
      description: entry.description || ''
    };
    if (protocol && typeof protocol.addCompendiumSprite === 'function') {
      protocol.addCompendiumSprite(tableId || '', payload);
    } else {
      window.dispatchEvent(new CustomEvent('compendium-insert', { detail: { table_id: tableId, entry: payload } }));
    }
  };

  return (
    <div className="compendium-panel" style={{background:'#18181b',color:'#fff',padding:16}}>
      <h3>D&D 5e Compendium</h3>
      <div style={{display:'flex',gap:8,marginBottom:12}}>
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{flex:1,padding:6,fontSize:14}}
        />
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          <button onClick={() => setTypeFilter('all')} style={{padding:'6px 8px',background:typeFilter==='all'?'#374151':'#222',border:'none',color:'#fff',borderRadius:4,cursor:'pointer'}}>All</button>
          <button onClick={() => setTypeFilter('monster')} style={{padding:'6px 8px',background:typeFilter==='monster'?'#374151':'#222',border:'none',color:'#fff',borderRadius:4,cursor:'pointer'}}>Monsters</button>
          <button onClick={() => setTypeFilter('spell')} style={{padding:'6px 8px',background:typeFilter==='spell'?'#374151':'#222',border:'none',color:'#fff',borderRadius:4,cursor:'pointer'}}>Spells</button>
          <button onClick={() => setTypeFilter('equipment')} style={{padding:'6px 8px',background:typeFilter==='equipment'?'#374151':'#222',border:'none',color:'#fff',borderRadius:4,cursor:'pointer'}}>Gear</button>
        </div>
      </div>
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
                style={{border:'1px solid #374151',borderRadius:4,padding:8,marginBottom:8,background:'#222',cursor:'grab',display:'flex',flexDirection:'column',gap:8}}
              >
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <strong>{entry.name}</strong>
                  <div style={{display:'flex',gap:8}}>
                    <button onClick={() => insertEntry(entry)} style={{background:'#2563eb',border:'none',color:'#fff',padding:'4px 8px',borderRadius:4,cursor:'pointer',fontSize:12}}>Insert</button>
                    <span style={{fontSize:12,color:'#a3a3a3'}}>[{entry.type}]</span>
                  </div>
                </div>
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
