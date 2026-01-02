/**
 * Compendium search interface
 * Uses WebSocket protocol for all searches
 */

import React, { useState } from 'react';
import { useCompendiumSearch } from '../../hooks/useCompendium';
import styles from './CompendiumSearch.module.css';
import { SpellCard } from './SpellCard';

export const CompendiumSearch: React.FC = () => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('');
  const { search, results, isLoading, error } = useCompendiumSearch();

  const handleSearch = () => {
    if (query.trim()) {
      search(query, category || undefined);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.searchBar}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Search spells, monsters, equipment..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyPress={handleKeyPress}
        />
        
        <select 
          className={styles.categorySelect}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All Categories</option>
          <option value="spells">Spells</option>
          <option value="monsters">Monsters</option>
          <option value="equipment">Equipment</option>
          <option value="classes">Classes</option>
        </select>

        <button 
          className={styles.searchButton}
          onClick={handleSearch}
          disabled={isLoading}
        >
          {isLoading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {error && (
        <div className={styles.error}>
          Error: {error}
        </div>
      )}

      {results && (
        <div className={styles.results}>
          {results.spells && results.spells.length > 0 && (
            <section className={styles.section}>
              <h2>Spells ({results.spells.length})</h2>
              <div className={styles.grid}>
                {results.spells.map((spell: any) => (
                  <SpellCard key={spell.name} spell={spell} />
                ))}
              </div>
            </section>
          )}

          {results.monsters && results.monsters.length > 0 && (
            <section className={styles.section}>
              <h2>Monsters ({results.monsters.length})</h2>
              <div className={styles.list}>
                {results.monsters.map((monster: any) => (
                  <div key={monster.name} className={styles.monsterItem}>
                    <strong>{monster.name}</strong>
                    <span>{monster.size} {monster.type}</span>
                    <span>CR {monster.cr}</span>
                    {monster.is_legendary && <span className={styles.legendary}>Legendary</span>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {results.equipment && results.equipment.length > 0 && (
            <section className={styles.section}>
              <h2>Equipment ({results.equipment.length})</h2>
              <div className={styles.list}>
                {results.equipment.map((item: any) => (
                  <div key={item.name} className={styles.equipmentItem}>
                    <strong>{item.name}</strong>
                    <span>{item.type}</span>
                    {item.is_magic && <span className={styles.magic}>{item.rarity}</span>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {results && !results.spells?.length && !results.monsters?.length && !results.equipment?.length && (
        <div className={styles.noResults}>
          No results found for "{query}"
        </div>
      )}
    </div>
  );
};
