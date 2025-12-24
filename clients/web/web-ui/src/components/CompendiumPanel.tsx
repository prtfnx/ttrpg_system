import clsx from 'clsx';
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { useAuth } from '../components/AuthContext';
import type { Equipment, Monster, Spell } from '../services/compendium.service';
import { compendiumService } from '../services/compendium.service';
import type { ExtendedMonster } from '../services/npcCharacter.service';
import styles from './CompendiumPanel.module.css';
import { MonsterStatBlock } from './MonsterStatBlock';

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
        setLoading(false);
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
        // Improved error handling for different scenarios
        let errorMessage = 'Failed to load compendium data';
        
        if (err instanceof Error) {
          if (err.message.includes('Authentication required')) {
            errorMessage = 'Please log in to access the compendium';
          } else if (err.message.includes('Permission denied')) {
            errorMessage = 'Upgrade your account for full compendium access';
          } else if (err.message.includes('API error')) {
            errorMessage = 'Server error - please try again later';
          } else {
            errorMessage = err.message;
          }
        }
        
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
  const onDragStart = (entry: CompendiumEntry, e: React.DragEvent) => {
    setDragged(entry);
    
    // Set drag data for drop handling
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'compendium',
      entryType: entry.type,
      entry: entry
    }));
    
    // For monsters, include additional context for NPC creation
    if (entry.type === 'monster' && entry.stats) {
      e.dataTransfer.setData('compendium/monster', JSON.stringify({
        monster: entry.stats,
        name: entry.name,
        id: entry.id
      }));
    }
    
    console.log('Drag start:', entry.name, entry.type);
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

  const [previewMonster, setPreviewMonster] = useState<{ name: string; data: ExtendedMonster } | null>(null);

  const insertEntry = (entry: CompendiumEntry) => {
    console.log('Insert:', entry.name);
    
    // If it's a monster, show preview UI (don't create character yet)
    if (entry.type === 'monster' && entry.stats) {
      setPreviewMonster({ name: entry.name, data: entry.stats as ExtendedMonster });
    } else {
      // For spells and equipment, use the old selectedEntry display
      setSelectedEntry(entry);
    }
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
      className={clsx(styles.compendiumPanel, className)} 
      style={style} 
      id={id}
      onDrop={onDropToTable}
      onDragOver={(e) => e.preventDefault()}
      {...otherProps}
    >
      <div className={styles.compendiumHeader}>
        <h3>📚 Compendium</h3>
        {!isAuthenticated && (
          <div className={styles.authWarning}>
            ⚠️ Login required for compendium access
          </div>
        )}
        {isAuthenticated && !hasPermission('compendium:read') && (
          <div className={styles.permissionWarning}>
            ⚠️ Insufficient permissions for compendium access
          </div>
        )}
        {user && (
          <div className={styles.userInfo}>
            Welcome, {user.username}
          </div>
        )}
      </div>

      {error && (
        <div className={styles.errorMessage}>
          {error}
        </div>
      )}

      <div className={styles.searchSection}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search compendium..."
          disabled={!isAuthenticated || !hasPermission('compendium:read')}
        />

        <div className={styles.filters}>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            disabled={!isAuthenticated || !hasPermission('compendium:read')}
          >
            <option value="all">All Types</option>
            <option value="monster">Monsters</option>
            <option value="spell">Spells</option>
            <option value="equipment">Equipment</option>
          </select>

          {typeFilter === 'spell' && (
            <div>
              <label htmlFor="spell-level-filter">
                Spell Level
              </label>
              <select
                id="spell-level-filter"
                value={spellLevel}
                onChange={(e) => setSpellLevel(e.target.value)}
                disabled={!isAuthenticated || !hasPermission('compendium:read')}
              >
                <option value="">All Levels</option>
                {[0,1,2,3,4,5,6,7,8,9].map(level => (
                  <option key={level} value={level.toString()}>Level {level}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className={styles.entriesList}>
        {loading && (
          <div className={styles.loadingIndicator}>
            Loading compendium data...
          </div>
        )}

        {!loading && filtered.length === 0 && !error && (
          <div className={styles.noResults}>
            {debounced ? 'No entries found' : 'Enter search terms to find compendium entries'}
          </div>
        )}

        {!loading && filtered.map(entry => (
          <div
            key={`${entry.type}-${entry.id}`}
            className={clsx(styles.entryItem, selectedEntry?.id === entry.id && styles.selected)}
            draggable={isAuthenticated && hasPermission('compendium:read')}
            onDragStart={(e) => onDragStart(entry, e)}
            onDragEnd={onDragEnd}
            onClick={() => insertEntry(entry)}
          >
            <div className={styles.entryHeader}>
              <span className={clsx(styles.entryType, styles[entry.type])}>
                {entry.type}
              </span>
              <strong>{entry.name}</strong>
              {entry.level !== undefined && (
                <span style={{ marginLeft: 'var(--space-sm)', color: 'var(--text-tertiary)' }}>Lv.{entry.level}</span>
              )}
              {entry.challenge_rating !== undefined && (
                <span style={{ marginLeft: 'var(--space-sm)', color: 'var(--text-tertiary)' }}>CR {entry.challenge_rating}</span>
              )}
            </div>
            <div className={styles.entryDescription}>
              {entry.description}
            </div>
          </div>
        ))}
      </div>

      {selectedEntry && (
        <div className={styles.entryDetails}>
          <h4>{selectedEntry.name}</h4>
          <p>{selectedEntry.description}</p>
          <button 
            onClick={() => setSelectedEntry(null)}
            style={{ marginTop: 'var(--space-sm)', padding: 'var(--space-xs) var(--space-sm)' }}
          >
            Close
          </button>
        </div>
      )}

      {/* Monster Preview Modal - Shows monster stat block without creating character */}
      {previewMonster && (() => {
        const handleCloseModal = (e: React.MouseEvent) => {
          if (e.target === e.currentTarget) {
            setPreviewMonster(null);
          }
        };
        
        // Create temporary character object for MonsterStatBlock display only
        const tempCharacter = {
          id: 'preview',
          sessionId: 'preview',
          name: previewMonster.name,
          ownerId: 0,
          controlledBy: [],
          data: previewMonster.data,
          version: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        
        const modalContent = (
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}
            onClick={handleCloseModal}
          >
            <div 
              style={{
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-2xl)',
                maxHeight: '90vh',
                width: 'clamp(320px, 95vw, 800px)',
                maxWidth: '98vw',
                display: 'flex',
                flexDirection: 'column',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{
                padding: 'var(--space-md)',
                borderBottom: '1px solid var(--border-primary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <h2 style={{ margin: 0 }}>{previewMonster.name} - Preview</h2>
                <button 
                  onClick={() => setPreviewMonster(null)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    fontSize: '24px',
                    cursor: 'pointer',
                    padding: 'var(--space-xs)',
                    color: 'var(--text-primary)',
                  }}
                  aria-label="Close preview"
                  type="button"
                >
                  ✕
                </button>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-md)' }}>
                <MonsterStatBlock character={tempCharacter} onClose={() => setPreviewMonster(null)} />
              </div>
            </div>
          </div>
        );
        
        return ReactDOM.createPortal(modalContent, document.body);
      })()}
    </div>
  );
};