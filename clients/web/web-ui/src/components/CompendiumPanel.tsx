import React, { useEffect, useState } from 'react';
import { useAuth } from '../components/AuthContext';
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
  // Monster-specific properties
  size?: string;
  alignment?: string;
  ac?: number;
  hp?: number;
}

interface SearchFilters {
  type: 'all' | 'monster' | 'spell' | 'equipment';
  spellLevel?: string;
  challengeRating?: string;
}

interface CompendiumPanelProps extends React.HTMLProps<HTMLDivElement> {
  category?: string;
}

export const CompendiumPanel: React.FC<CompendiumPanelProps> = ({ category, className, style, id, ...otherProps }) => {
  const { user, isAuthenticated, hasPermission } = useAuth();
  
  const [entries, setEntries] = useState<CompendiumEntry[]>([]);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all'|'monster'|'spell'|'equipment'>(
    category === 'spells' ? 'spell' : 
    category === 'monsters' ? 'monster' : 
    category === 'equipment' ? 'equipment' : 'all'
  );
  const [spellLevel, setSpellLevel] = useState('');
  const [dragged, setDragged] = useState<CompendiumEntry | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<CompendiumEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Authentication check for compendium access
  const checkCompendiumAccess = () => {
    if (!isAuthenticated) {
      return { hasAccess: false, error: 'Authentication required for compendium access' };
    }
    
    // Check if user has compendium permissions
    if (!hasPermission('compendium:read')) {
      return { hasAccess: false, error: 'Insufficient permissions for compendium access' };
    }
    
    return { hasAccess: true, error: null };
  };

  // Debounce search input
  useEffect(() => { 
    const t = setTimeout(() => setDebounced(search.trim()), 250); 
    return () => clearTimeout(t); 
  }, [search]);

  // Transform functions for different entry types
  const transformMonsterToEntry = (monster: Monster): CompendiumEntry => ({
    id: monster.id,
    type: 'monster' as const,
    name: monster.name,
    description: monster.description || `CR ${monster.challenge_rating} ${monster.type}`,
    stats: monster,
    challenge_rating: monster.challenge_rating,
    size: monster.size,
    alignment: monster.alignment,
    ac: monster.ac,
    hp: monster.hp
  });

  const transformSpellToEntry = (spell: Spell): CompendiumEntry => ({
    id: spell.id,
    type: 'spell' as const,
    name: spell.name,
    description: spell.description || `Level ${spell.level} ${spell.school} spell`,
    stats: spell,
    level: spell.level,
    school: spell.school
  });

  const transformEquipmentToEntry = (equipment: Equipment): CompendiumEntry => ({
    id: equipment.id,
    type: 'equipment' as const,
    name: equipment.name,
    description: equipment.description || `${equipment.type} - ${equipment.cost}`,
    stats: equipment,
    cost: equipment.cost
  });

  // Authenticated search function
  const performAuthenticatedSearch = async (query: string, filters: SearchFilters): Promise<CompendiumEntry[]> => {
    const results: CompendiumEntry[] = [];

    try {
      if (filters.type === 'all' || filters.type === 'monster') {
        const monsters = await compendiumService.searchMonsters(query);
        results.push(...monsters.map(transformMonsterToEntry));
      }

      if (filters.type === 'all' || filters.type === 'spell') {
        const spells = await compendiumService.searchSpells(query);
        const filteredSpells = filters.spellLevel 
          ? spells.filter(spell => spell.level === parseInt(filters.spellLevel!))
          : spells;
        results.push(...filteredSpells.map(transformSpellToEntry));
      }

      if (filters.type === 'all' || filters.type === 'equipment') {
        const equipment = await compendiumService.searchEquipment(query);
        results.push(...equipment.map(transformEquipmentToEntry));
      }

      return results;
    } catch (error) {
      console.error('Authentication or search failed:', error);
      throw new Error('Search failed - please check your connection and permissions');
    }
  };

  // Load compendium data based on search and filter with authentication
  useEffect(() => {
    const loadData = async () => {
      // Check authentication and permissions first
      const accessCheck = checkCompendiumAccess();
      if (!accessCheck.hasAccess) {
        setError(accessCheck.error);
        setEntries([]);
        return;
      }

      setLoading(true);
      setError(null);
      
      try {
        const searchFilters: SearchFilters = {
          type: typeFilter,
          spellLevel: spellLevel || undefined
        };

        // Perform authenticated search with user context
        const results = await performAuthenticatedSearch(debounced, searchFilters);
        setEntries(results);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load compendium data';
        setError(errorMessage);
        setEntries([]);
        console.error('Compendium search error:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [debounced, typeFilter, spellLevel, isAuthenticated]);

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
    console.log('Insert:', entry.name);
    setSelectedEntry(entry);
  };

  // Filter entries based on additional criteria
  const filtered = entries.filter(entry => {
    // Additional filtering can be added here
    if (typeFilter === 'spell' && spellLevel && entry.level !== undefined) {
      return entry.level === parseInt(spellLevel);
    }
    return true;
  });

  return (
    <div 
      className={`compendium-panel ${className || ''}`} 
      style={style} 
      id={id}
      onDrop={onDropToTable}
      onDragOver={(e) => e.preventDefault()}
      {...otherProps}
    >
      <div className="compendium-header">
        <h3>📚 Compendium</h3>
        {!isAuthenticated && (
          <div className="auth-warning">
            ⚠️ Login required for compendium access
          </div>
        )}
        {isAuthenticated && !hasPermission('compendium:read') && (
          <div className="permission-warning">
            ⚠️ Insufficient permissions for compendium access
          </div>
        )}
        {user && (
          <div className="user-info">
            Welcome, {user.username}
          </div>
        )}
      </div>

      {error && (
        <div className="error-message" style={{ color: 'red', padding: '8px', margin: '8px 0' }}>
          {error}
        </div>
      )}

      <div className="search-section">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search compendium..."
          disabled={!isAuthenticated || !hasPermission('compendium:read')}
          style={{ width: '100%', padding: '8px', margin: '8px 0' }}
        />

        <div className="filters">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            disabled={!isAuthenticated || !hasPermission('compendium:read')}
            style={{ margin: '4px' }}
          >
            <option value="all">All Types</option>
            <option value="monster">Monsters</option>
            <option value="spell">Spells</option>
            <option value="equipment">Equipment</option>
          </select>

          {typeFilter === 'spell' && (
            <select
              value={spellLevel}
              onChange={(e) => setSpellLevel(e.target.value)}
              disabled={!isAuthenticated || !hasPermission('compendium:read')}
              style={{ margin: '4px' }}
            >
              <option value="">All Levels</option>
              {[0,1,2,3,4,5,6,7,8,9].map(level => (
                <option key={level} value={level.toString()}>Level {level}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="entries-list">
        {loading && (
          <div className="loading-indicator" style={{ padding: '16px', textAlign: 'center' }}>
            Loading compendium data...
          </div>
        )}

        {!loading && filtered.length === 0 && !error && (
          <div className="no-results" style={{ padding: '16px', textAlign: 'center', color: '#666' }}>
            {debounced ? 'No entries found' : 'Enter search terms to find compendium entries'}
          </div>
        )}

        {!loading && filtered.map(entry => (
          <div
            key={entry.id}
            className={`entry-item ${selectedEntry?.id === entry.id ? 'selected' : ''}`}
            draggable={isAuthenticated && hasPermission('compendium:read')}
            onDragStart={() => onDragStart(entry)}
            onDragEnd={onDragEnd}
            onClick={() => insertEntry(entry)}
            style={{
              padding: '8px',
              margin: '4px 0',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 'pointer',
              backgroundColor: selectedEntry?.id === entry.id ? '#e3f2fd' : '#fff'
            }}
          >
            <div className="entry-header">
              <span className="entry-type" style={{ 
                backgroundColor: entry.type === 'monster' ? '#f44336' : 
                               entry.type === 'spell' ? '#2196f3' : '#4caf50',
                color: 'white',
                padding: '2px 6px',
                borderRadius: '12px',
                fontSize: '10px',
                textTransform: 'uppercase',
                marginRight: '8px'
              }}>
                {entry.type}
              </span>
              <strong>{entry.name}</strong>
              {entry.level !== undefined && (
                <span style={{ marginLeft: '8px', color: '#666' }}>Lv.{entry.level}</span>
              )}
              {entry.challenge_rating !== undefined && (
                <span style={{ marginLeft: '8px', color: '#666' }}>CR {entry.challenge_rating}</span>
              )}
            </div>
            <div className="entry-description" style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              {entry.description}
            </div>
          </div>
        ))}
      </div>

      {selectedEntry && (
        <div className="entry-details" style={{ 
          position: 'fixed', 
          top: '50%', 
          left: '50%', 
          transform: 'translate(-50%, -50%)',
          background: 'white',
          border: '2px solid #ccc',
          borderRadius: '8px',
          padding: '16px',
          maxWidth: '400px',
          zIndex: 1000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
        }}>
          <h4>{selectedEntry.name}</h4>
          <p>{selectedEntry.description}</p>
          <button 
            onClick={() => setSelectedEntry(null)}
            style={{ marginTop: '8px', padding: '4px 8px' }}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
};