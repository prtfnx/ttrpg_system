import React, { useState, useEffect } from 'react';
import { MessageType, createMessage } from '../../protocol/message';
import { useProtocol } from '../../services/ProtocolContext';
import type { CompendiumSearchResult } from '../../types/compendium';
import styles from './CompendiumBrowser.module.css';
import { EquipmentToken } from './EquipmentToken';

export const CompendiumBrowser: React.FC = () => {
  const { protocol } = useProtocol();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | 'spells' | 'equipment' | 'monsters'>('all');
  const [results, setResults] = useState<CompendiumSearchResult>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!protocol) return;

    const handleResponse = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { results: searchResults } = customEvent.detail;
      setResults(searchResults || {});
      setLoading(false);
    };

    window.addEventListener('compendium-search-response', handleResponse);
    return () => window.removeEventListener('compendium-search-response', handleResponse);
  }, [protocol]);

  const handleSearch = () => {
    if (!protocol || !query.trim()) return;

    setLoading(true);
    protocol.sendMessage(createMessage(
      MessageType.COMPENDIUM_SEARCH,
      { query, category: category === 'all' ? undefined : category }
    ));
  };

  const handleDragStart = (e: React.DragEvent, item: any, type: string) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ ...item, type }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className={styles.browser}>
      <div className={styles.searchBar}>
        <input
          type="text"
          placeholder="Search compendium..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          className={styles.searchInput}
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as any)}
          className={styles.categorySelect}
        >
          <option value="all">All</option>
          <option value="spells">Spells</option>
          <option value="equipment">Equipment</option>
          <option value="monsters">Monsters</option>
        </select>
        <button onClick={handleSearch} disabled={loading} className={styles.searchButton}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      <div className={styles.results}>
        {results.spells && results.spells.length > 0 && (
          <div className={styles.section}>
            <h3>Spells ({results.spells.length})</h3>
            <div className={styles.itemList}>
              {results.spells.map((spell, idx) => (
                <div
                  key={idx}
                  className={styles.item}
                  draggable
                  onDragStart={(e) => handleDragStart(e, spell, 'spell')}
                >
                  <span className={styles.itemName}>{spell.name}</span>
                  <span className={styles.itemLevel}>Level {spell.level}</span>
                  <span className={styles.itemSchool}>{spell.school}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {results.equipment && results.equipment.length > 0 && (
          <div className={styles.section}>
            <h3>Equipment ({results.equipment.length})</h3>
            <div className={styles.equipmentGrid}>
              {results.equipment.map((item, idx) => (
                <EquipmentToken
                  key={idx}
                  item={item}
                  onDragStart={() => console.log('Dragging:', item.name)}
                />
              ))}
            </div>
          </div>
        )}

        {results.monsters && results.monsters.length > 0 && (
          <div className={styles.section}>
            <h3>Monsters ({results.monsters.length})</h3>
            <div className={styles.itemList}>
              {results.monsters.map((monster, idx) => (
                <div key={idx} className={styles.item}>
                  <span className={styles.itemName}>{monster.name}</span>
                  <span className={styles.itemCR}>CR {monster.cr}</span>
                  <span className={styles.itemType}>{monster.type}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && Object.values(results).every(arr => !arr || arr.length === 0) && query && (
          <div className={styles.noResults}>No results found for "{query}"</div>
        )}
      </div>
    </div>
  );
};
