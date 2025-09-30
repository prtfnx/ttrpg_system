import React, { useEffect, useState } from 'react';
import type { UserInfo } from '../services/auth.service';
import type { Equipment, Monster, Spell } from '../services/compendium.service';
import { compendiumService } from '../services/compendium.service';

interface CompendiumEntry {
  id: string;
  type: 'monster' | 'spell' | 'equipment';
  name: string;
  description: string;
  stats?: Record<string, any>;
  challenge_rating?: number;
  level?: number;
  school?: string;
  cost?: string;
}

interface CompendiumPanelProps extends React.HTMLProps<HTMLDivElement> {
  userInfo?: UserInfo;
  category?: string;
}

export const CompendiumPanel: React.FC<CompendiumPanelProps> = ({ userInfo, category, className, style, id, ...otherProps }) => {
  const [entries, setEntries] = useState<CompendiumEntry[]>([]);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all'|'monster'|'spell'|'equipment'>(
    category === 'spells' ? 'spell' : 
    category === 'monsters' ? 'monster' : 
    category === 'equipment' ? 'equipment' : 'all'
  );
  const [dragged, setDragged] = useState<CompendiumEntry | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<CompendiumEntry | null>(null);
  // const [loading, setLoading] = useState(false);

  // Debounce search input
  useEffect(() => { 
    const t = setTimeout(() => setDebounced(search.trim()), 250); 
    return () => clearTimeout(t); 
  }, [search]);

  // Load compendium data based on search and filter
  useEffect(() => {
    const loadData = async () => {
      // setLoading(true);
      try {
        const monsters = typeFilter === 'all' || typeFilter === 'monster' 
          ? await compendiumService.searchMonsters(debounced) 
          : [];
        const spells = typeFilter === 'all' || typeFilter === 'spell'
          ? await compendiumService.searchSpells(debounced)
          : [];
        const equipment = typeFilter === 'all' || typeFilter === 'equipment'
          ? await compendiumService.searchEquipment(debounced)
          : [];

        const allEntries: CompendiumEntry[] = [
          ...monsters.map((m: Monster) => ({
            id: m.id,
            type: 'monster' as const,
            name: m.name,
            description: `CR ${m.challenge_rating} ${m.type}`,
            stats: m.stats,
            challenge_rating: m.challenge_rating
          })),
          ...spells.map((s: Spell) => ({
            id: s.id,
            type: 'spell' as const, 
            name: s.name,
            description: `Level ${s.level} ${s.school}`,
            level: s.level,
            school: s.school
          })),
          ...equipment.map((e: Equipment) => ({
            id: e.id,
            type: 'equipment' as const,
            name: e.name, 
            description: `${e.type} - ${e.cost}`,
            cost: e.cost
          }))
        ];

        setEntries(allEntries);
      } catch (error) {
        console.error('Failed to load compendium data:', error);
      } finally {
        // setLoading(false);
      }
    };

    loadData();
  }, [debounced, typeFilter]);

  // Drag handlers
  const onDragStart = (entry: CompendiumEntry) => {
    setDragged(entry);
  };

  const onDragEnd = () => {
    setDragged(null);
  };

  const onDropToTable = () => {
    if (dragged) {
      console.log('Would add to table:', dragged.name);
      setDragged(null);
    }
  };

  const insertEntry = (entry: CompendiumEntry) => {
    console.log('Would insert entry:', entry.name);
  };

  // Handle entry selection for details
  // const handleEntryClick = (entry: CompendiumEntry) => {
  //   setSelectedEntry(entry);
  // };

  // Filter entries based on current search and type filter
  const filtered = entries;

  return (
    <div className={`compendium-panel ${className || ''}`} style={{background:'#18181b',color:'#fff',padding:16, ...style}} id={id} {...otherProps}>
      <h3>D&D 5e Compendium</h3>
      {selectedEntry && (
        <div style={{background:'#374151', padding:12, marginBottom:12, borderRadius:6}}>
          <h4>{selectedEntry.name}</h4>
          <p>{selectedEntry.description}</p>
          {selectedEntry.type === 'monster' && (
            <div>
              <p>CR {selectedEntry.challenge_rating}</p>
              {selectedEntry.stats && (
                <div>
                  <strong>Stats:</strong> STR {selectedEntry.stats.str}, DEX {selectedEntry.stats.dex}, CON {selectedEntry.stats.con}
                </div>
              )}
            </div>
          )}
          {selectedEntry.type === 'spell' && (
            <div>
              <p>Level {selectedEntry.level} {selectedEntry.school}</p>
            </div>
          )}
          <button onClick={() => setSelectedEntry(null)} style={{marginTop:8, padding:'4px 8px', background:'#666', border:'none', color:'white', borderRadius:4, cursor:'pointer'}}>Close</button>
        </div>
      )}
      <div style={{display:'flex',gap:8,marginBottom:12}}>
        <input
          type="text"
          placeholder="Search monsters, spells, equipment..."
          aria-label="Search spells"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{flex:1,padding:6,fontSize:14}}
        />
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          <button onClick={() => { /* trigger search */ }} style={{padding:'6px 8px',background:'#2563eb',border:'none',color:'#fff',borderRadius:4,cursor:'pointer'}}>Search</button>
          <button onClick={() => setTypeFilter('all')} style={{padding:'6px 8px',background:typeFilter==='all'?'#374151':'#222',border:'none',color:'#fff',borderRadius:4,cursor:'pointer'}}>All</button>
          <button onClick={() => setTypeFilter('monster')} style={{padding:'6px 8px',background:typeFilter==='monster'?'#374151':'#222',border:'none',color:'#fff',borderRadius:4,cursor:'pointer'}}>Monsters</button>
          <button onClick={() => setTypeFilter('spell')} style={{padding:'6px 8px',background:typeFilter==='spell'?'#374151':'#222',border:'none',color:'#fff',borderRadius:4,cursor:'pointer'}}>Spells</button>
          <button onClick={() => setTypeFilter('equipment')} style={{padding:'6px 8px',background:typeFilter==='equipment'?'#374151':'#222',border:'none',color:'#fff',borderRadius:4,cursor:'pointer'}}>Gear</button>
        </div>
      </div>
      
      {/* Challenge Rating Filter for Monsters */}
      {typeFilter === 'monster' && (
        <div style={{marginBottom:12}}>
          <label htmlFor="challenge-rating" style={{color:'#fff',marginRight:8}}>Challenge Rating:</label>
          <select 
            id="challenge-rating"
            aria-label="Challenge Rating"
            style={{padding:'4px 8px',background:'#222',color:'#fff',border:'1px solid #374151',borderRadius:4}}
          >
            <option value="">All CRs</option>
            <option value="0">0</option>
            <option value="1/4">1/4</option>
            <option value="1/2">1/2</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
            <option value="6">6</option>
            <option value="7">7</option>
            <option value="8">8</option>
            <option value="9">9</option>
            <option value="10">10</option>
          </select>
        </div>
      )}
      
      {/* Spell Level Filter for Spells */}
      {typeFilter === 'spell' && (
        <div style={{marginBottom:12}}>
          <label htmlFor="spell-level" style={{color:'#fff',marginRight:8}}>Spell Level:</label>
          <select 
            id="spell-level"
            aria-label="Spell Level"
            style={{padding:'4px 8px',background:'#222',color:'#fff',border:'1px solid #374151',borderRadius:4}}
          >
            <option value="">All Levels</option>
            <option value="0">Cantrip</option>
            <option value="1">Level 1</option>
            <option value="2">Level 2</option>
            <option value="3">Level 3</option>
            <option value="4">Level 4</option>
            <option value="5">Level 5</option>
            <option value="6">Level 6</option>
            <option value="7">Level 7</option>
            <option value="8">Level 8</option>
            <option value="9">Level 9</option>
          </select>
        </div>
      )}
      
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
                    {entry.type === 'monster' && (
                      <button 
                        onClick={() => setSelectedEntry(entry)} 
                        style={{background:'#16a34a',border:'none',color:'#fff',padding:'4px 8px',borderRadius:4,cursor:'pointer',fontSize:12}}
                        aria-label={`${entry.name} details`}
                      >
                        Details
                      </button>
                    )}
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
