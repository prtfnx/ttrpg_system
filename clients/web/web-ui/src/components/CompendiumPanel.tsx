/**
 * CompendiumPanel - Redesigned with Category Tabs and Lazy Loading
 * D&D 5e Compendium with Monsters, Spells, and Equipment
 */

import clsx from 'clsx';
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { useAuth } from '../components/AuthContext';
import type { Equipment, Monster, Spell } from '../services/compendium.service';
import { compendiumService } from '../services/compendium.service';
import { MonsterFilters, type MonsterFilterState } from './Compendium/MonsterFilters';
import { SpellCard } from './Compendium/SpellCard';
import styles from './CompendiumPanel.module.css';
import { MonsterStatBlock } from './MonsterStatBlock';

type CategoryType = 'monsters' | 'spells' | 'equipment';

interface CompendiumPanelProps extends React.HTMLProps<HTMLDivElement> {
  category?: string;
}

export const CompendiumPanel: React.FC<CompendiumPanelProps> = ({ category, className, style, id, ...otherProps }) => {
  const { isAuthenticated, hasPermission } = useAuth();
  
  // Category tabs state - null by default, only load when user selects
  const [selectedCategory, setSelectedCategory] = useState<CategoryType | null>(null);
  
  // Search state
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  
  // Data state
  const [monsters, setMonsters] = useState<Monster[]>([]);
  const [spells, setSpells] = useState<Spell[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  
  // Loading/Error state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Filter states
  const [monsterFilters, setMonsterFilters] = useState<MonsterFilterState>({});
  const [spellLevel, setSpellLevel] = useState<string>('');
  
  // Preview/Selection state
  const [previewMonster, setPreviewMonster] = useState<Monster | null>(null);
  const [previewSpell, setPreviewSpell] = useState<Spell | null>(null);

  // Authentication check
  const checkAccess = () => {
    if (!isAuthenticated) {
      return { hasAccess: false, error: 'Authentication required for compendium access' };
    }
    if (!hasPermission('compendium:read')) {
      return { hasAccess: false, error: 'Insufficient permissions for compendium access' };
    }
    return { hasAccess: true, error: null };
  };

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Lazy load category data - only when category is selected
  useEffect(() => {
    // Don't load if no category selected
    if (!selectedCategory) {
      return;
    }

    const loadCategoryData = async () => {
      const accessCheck = checkAccess();
      if (!accessCheck.hasAccess) {
        setError(accessCheck.error);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        switch (selectedCategory) {
          case 'monsters':
            const monsterData = await compendiumService.searchMonsters(debounced);
            setMonsters(monsterData);
            break;
          
          case 'spells':
            const spellData = await compendiumService.searchSpells(debounced);
            setSpells(spellData);
            break;
          
          case 'equipment':
            const equipmentData = await compendiumService.searchEquipment(debounced);
            setEquipment(equipmentData);
            break;
        }
      } catch (err) {
        let errorMessage = 'Failed to load compendium data';
        if (err instanceof Error) {
          if (err.message.includes('Authentication required')) {
            errorMessage = 'Please log in to access the compendium';
          } else if (err.message.includes('Permission denied')) {
            errorMessage = 'Upgrade your account for full compendium access';
          } else {
            errorMessage = err.message;
          }
        }
        setError(errorMessage);
        console.error('Compendium load error:', err);
      } finally {
        setLoading(false);
      }
    };

    loadCategoryData();
  }, [selectedCategory, debounced, isAuthenticated]);

  // Filter monsters by advanced filters
  const filteredMonsters = monsters.filter(monster => {
    if (monsterFilters.cr && monster.challenge_rating?.toString() !== monsterFilters.cr) {
      return false;
    }
    if (monsterFilters.type && !monster.type?.toLowerCase().includes(monsterFilters.type.toLowerCase())) {
      return false;
    }
    if (monsterFilters.size && !monster.size?.toLowerCase().includes(monsterFilters.size.toLowerCase())) {
      return false;
    }
    if (monsterFilters.alignment && !monster.alignment?.toLowerCase().includes(monsterFilters.alignment.toLowerCase())) {
      return false;
    }
    if (monsterFilters.environment && !monster.environment?.toLowerCase().includes(monsterFilters.environment.toLowerCase())) {
      return false;
    }
    return true;
  });

  // Filter spells by level
  const filteredSpells = spells.filter(spell => {
    if (spellLevel && spell.level?.toString() !== spellLevel) {
      return false;
    }
    return true;
  });

  // Drag handlers
  const [_dragged, setDragged] = useState<any>(null);
  
  const onDragStart = (entry: any, entryType: string, e: React.DragEvent) => {
    setDragged(entry);
    
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'compendium',
      entryType,
      entry
    }));
    
    if (entryType === 'monster') {
      e.dataTransfer.setData('compendium/monster', JSON.stringify({
        monster: entry,
        name: entry.name,
        id: entry.id
      }));
    }
    
    console.log('Drag start:', entry.name, entryType);
  };

  const onDragEnd = () => {
    setDragged(null);
  };

  const handleCategoryChange = (category: CategoryType) => {
    setSelectedCategory(category);
    setSearch('');
    setDebounced('');
    setError(null);
  };

  const handleMonsterClick = (monster: Monster) => {
    setPreviewMonster(monster);
  };

  const handleSpellClick = (spell: Spell) => {
    setPreviewSpell(spell);
  };

  // Convert Monster to Character for MonsterStatBlock
  const monsterToCharacter = (monster: Monster): any => {
    return {
      id: monster.id,
      name: monster.name,
      type: 'npc',
      data: {
        ...monster,
        stats: {
          ac: monster.ac,
          hp: monster.hp,
          maxHp: monster.hp,
          speed: 30
        },
        abilityScores: {
          strength: 10,
          dexterity: 10,
          constitution: 10,
          intelligence: 10,
          wisdom: 10,
          charisma: 10
        }
      }
    };
  };

  return (
    <div 
      className={clsx(styles.compendiumPanel, className)} 
      style={style} 
      id={id}
      onDrop={() => setDragged(null)}
      onDragOver={(e) => e.preventDefault()}
      {...otherProps}
    >
      {/* Header */}
      <div className={styles.compendiumHeader}>
        <h3>📚 Compendium</h3>
        {!isAuthenticated && (
          <div className={styles.authWarning}>⚠️ Login required</div>
        )}
        {isAuthenticated && !hasPermission('compendium:read') && (
          <div className={styles.permissionWarning}>⚠️ Insufficient permissions</div>
        )}
      </div>

      {/* Category Tabs */}
      <div className={styles.categoryTabs}>
        <button
          className={clsx(styles.categoryTab, selectedCategory === 'monsters' && styles.active)}
          onClick={() => handleCategoryChange('monsters')}
          disabled={!isAuthenticated || !hasPermission('compendium:read')}
        >
          🐉 Monsters
        </button>
        <button
          className={clsx(styles.categoryTab, selectedCategory === 'spells' && styles.active)}
          onClick={() => handleCategoryChange('spells')}
          disabled={!isAuthenticated || !hasPermission('compendium:read')}
        >
          ✨ Spells
        </button>
        <button
          className={clsx(styles.categoryTab, selectedCategory === 'equipment' && styles.active)}
          onClick={() => handleCategoryChange('equipment')}
          disabled={!isAuthenticated || !hasPermission('compendium:read')}
        >
          ⚔️ Equipment
        </button>
      </div>

      {error && (
        <div className={styles.errorMessage}>{error}</div>
      )}

      {/* Search */}
      <div className={styles.searchSection}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${selectedCategory}...`}
          disabled={!isAuthenticated || !hasPermission('compendium:read')}
          className={styles.searchInput}
        />
      </div>

      {/* Category-specific filters */}
      {selectedCategory === 'monsters' && (
        <MonsterFilters
          filters={monsterFilters}
          onChange={setMonsterFilters}
          onReset={() => setMonsterFilters({})}
        />
      )}

      {selectedCategory === 'spells' && (
        <div className={styles.spellFilters}>
          <select
            value={spellLevel}
            onChange={(e) => setSpellLevel(e.target.value)}
            className={styles.levelSelect}
          >
            <option value="">All Levels</option>
            <option value="0">Cantrip</option>
            {[1,2,3,4,5,6,7,8,9].map(level => (
              <option key={level} value={level}>Level {level}</option>
            ))}
          </select>
        </div>
      )}

      {/* Content List */}
      <div className={styles.contentList}>
        {!selectedCategory && (
          <div className={styles.welcomeScreen}>
            <div className={styles.welcomeIcon}>📚</div>
            <h4>Welcome to the Compendium</h4>
            <p>Select a category above to browse monsters, spells, or equipment</p>
          </div>
        )}

        {loading && <div className={styles.loading}>Loading...</div>}

        {!loading && selectedCategory === 'monsters' && (
          <div className={styles.monsterList}>
            {filteredMonsters.length === 0 && <div className={styles.noResults}>No monsters found</div>}
            {filteredMonsters.map(monster => (
              <div
                key={monster.id}
                className={styles.compendiumEntry}
                draggable
                onDragStart={(e) => onDragStart(monster, 'monster', e)}
                onDragEnd={onDragEnd}
                onClick={() => handleMonsterClick(monster)}
              >
                <div className={styles.entryHeader}>
                  <span className={styles.entryName}>{monster.name}</span>
                  <span className={styles.entryCR}>CR {monster.challenge_rating}</span>
                </div>
                <div className={styles.entryMeta}>
                  {monster.size} {monster.type}
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && selectedCategory === 'spells' && (
          <div className={styles.spellList}>
            {filteredSpells.length === 0 && <div className={styles.noResults}>No spells found</div>}
            {filteredSpells.map(spell => (
              <div
                key={spell.id}
                className={styles.compendiumEntry}
                draggable
                onDragStart={(e) => onDragStart(spell, 'spell', e)}
                onDragEnd={onDragEnd}
                onClick={() => handleSpellClick(spell)}
              >
                <div className={styles.entryHeader}>
                  <span className={styles.entryName}>{spell.name}</span>
                  <span className={styles.spellLevel}>
                    {spell.level === 0 ? 'Cantrip' : `Lv ${spell.level}`}
                  </span>
                </div>
                <div className={styles.entryMeta}>
                  {spell.school}
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && selectedCategory === 'equipment' && (
          <div className={styles.equipmentList}>
            {equipment.length === 0 && <div className={styles.noResults}>No equipment found</div>}
            {equipment.map(item => (
              <div
                key={item.id}
                className={styles.compendiumEntry}
                draggable
                onDragStart={(e) => onDragStart(item, 'equipment', e)}
                onDragEnd={onDragEnd}
              >
                <div className={styles.entryHeader}>
                  <span className={styles.entryName}>{item.name}</span>
                  <span className={styles.equipmentCost}>
                    {typeof item.cost === 'number' 
                      ? `${item.cost} ${(item as any).cost_unit || 'gp'}`
                      : typeof item.cost === 'object' && item.cost !== null
                        ? `${(item.cost as any).quantity || 0} ${(item.cost as any).unit || 'gp'}`
                        : 'N/A'}
                  </span>
                </div>
                <div className={styles.entryMeta}>
                  {item.type}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Monster Preview Modal */}
      {previewMonster && ReactDOM.createPortal(
        <div className={styles.modalOverlay} onClick={() => setPreviewMonster(null)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <MonsterStatBlock
              character={monsterToCharacter(previewMonster)}
              onClose={() => setPreviewMonster(null)}
            />
          </div>
        </div>,
        document.body
      )}

      {/* Spell Card Modal */}
      {previewSpell && ReactDOM.createPortal(
        <div className={styles.modalOverlay} onClick={() => setPreviewSpell(null)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <SpellCard
              spell={previewSpell}
              onClose={() => setPreviewSpell(null)}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
