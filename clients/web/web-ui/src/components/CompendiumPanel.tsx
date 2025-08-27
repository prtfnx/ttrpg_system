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
      // Use protocol and show optimistic UI in WASM immediately
      const protocol = (window as any).protocol as import('../protocol/clientProtocol').WebClientProtocol | undefined;
      if (!protocol || typeof protocol.addCompendiumSprite !== 'function') {
        console.error('Compendium insert failed: protocol not available. Connect to server.');
      } else {
        const tableId = (window as any).activeTableId as string | undefined || '';

        // Create optimistic id and payload to show immediately
        const optimisticId = `opt_${Date.now()}`;
        const optimisticPayload = {
          id: optimisticId,
          compendium_id: dragged.id,
          name: dragged.name,
          type: dragged.type,
          stats: dragged.stats || {},
          description: dragged.description || '',
        };

        // Dispatch optimistic event for WASM integration
        window.dispatchEvent(new CustomEvent('compendium-insert', { detail: optimisticPayload }));

        // Send to server and attach client_temp_id so server may correlate
        try {
          const maybePromise: any = protocol.addCompendiumSprite(tableId, { ...optimisticPayload, client_temp_id: optimisticId });
          Promise.resolve(maybePromise).catch((err: any) => {
            console.error('Protocol addCompendiumSprite failed:', err);
            // If server call failed, removal of optimistic sprite is handled by WASM integration listeners if configured
          });
        } catch (err) {
          console.error('Protocol addCompendiumSprite threw:', err);
          // If add threw synchronously, rely on WASM integration to reconcile or keep log for debugging
        }
      }
      setDragged(null);
    }
  };

  // Insert without dragging: ask protocol to add entry to active table
  const insertEntry = (entry: CompendiumEntry) => {
    const protocol = (window as any).protocol as import('../protocol/clientProtocol').WebClientProtocol | undefined;
    const tableId = (window as any).activeTableId as string | undefined || null;

    if (!protocol || typeof protocol.addCompendiumSprite !== 'function') {
      console.error('Insert failed: protocol not available. Connect to server to insert compendium entries.');
      return;
    }

    // Optimistic add
    const optimisticId = `opt_${Date.now()}`;
    const optimisticPayload = {
      id: optimisticId,
      compendium_id: entry.id,
      name: entry.name,
      type: entry.type,
      stats: entry.stats || {},
      description: entry.description || ''
    };
    window.dispatchEvent(new CustomEvent('compendium-insert', { detail: optimisticPayload }));

    // Send via protocol, include temp id for server correlation
    try {
      const maybePromise: any = protocol.addCompendiumSprite(tableId || '', { ...optimisticPayload, client_temp_id: optimisticId });
      Promise.resolve(maybePromise).catch((err: any) => {
        console.error('Protocol addCompendiumSprite failed:', err);
      });
    } catch (err) {
      console.error('Protocol addCompendiumSprite threw:', err);
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
          style={{width:180,minHeight:180,border:`2px dashed ${((window as any).protocol && typeof (window as any).protocol.addCompendiumSprite === 'function') ? '#3b82f6' : '#6b7280'}`,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',background:'#222'}}
          onDragOver={e => e.preventDefault()}
          onDrop={onDropToTable}
        >
          <span style={{color:((window as any).protocol && typeof (window as any).protocol.addCompendiumSprite === 'function') ? '#3b82f6' : '#9ca3af'}}>
            {((window as any).protocol && typeof (window as any).protocol.addCompendiumSprite === 'function') ? 'Drop here to add to table' : 'Connect to server to enable insert'}
          </span>
        </div>
      </div>
    </div>
  );
};
