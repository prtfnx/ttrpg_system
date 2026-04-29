import { useAuth } from '@features/auth';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compendiumService } from '../services/compendiumService';
import { monsterCreationSystem, type MonsterInstance } from '../services/monsterCreation.service';
import styles from './CompendiumPanel.module.css';
import { MonsterCreationPanel } from './MonsterCreationPanel';

const PAGE_SIZE = 50;

type EntryType = 'all' | 'monster' | 'spell' | 'equipment';

interface CompendiumEntry {
  id: string;
  type: 'monster' | 'spell' | 'equipment';
  name: string;
  description: string;
  challenge_rating?: number;
  level?: number;
  school?: string;
  cost?: string;
  monsterType?: string;
  raw?: Record<string, unknown>;
}

interface CompendiumPanelProps extends React.HTMLProps<HTMLDivElement> {
  category?: string;
}

export const CompendiumPanel: React.FC<CompendiumPanelProps> = ({ category, className, style, id, ...otherProps }) => {
  const { isAuthenticated, hasPermission } = useAuth();

  const initialType: EntryType =
    category === 'spells' ? 'spell' :
    category === 'monsters' ? 'monster' :
    category === 'equipment' ? 'equipment' : 'all';

  const [allEntries, setAllEntries] = useState<CompendiumEntry[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<EntryType>(initialType);
  const [spellLevel, setSpellLevel] = useState('');
  const [crMin, setCrMin] = useState('');
  const [crMax, setCrMax] = useState('');
  const [monsterType, setMonsterType] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [monsterPanelOpen, setMonsterPanelOpen] = useState(false);

  const compendiumInitialized = useRef(false);
  const canAccess = isAuthenticated && hasPermission('compendium:read');

  // Fetch all data once on mount
  useEffect(() => {
    if (!canAccess) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      const results: CompendiumEntry[] = [];

      try {
        const monsterRes = await compendiumService.getMonsters({ limit: 500 });
        const rawMonsters = monsterRes.monsters ?? {};

        // Init monsterCreationSystem once with raw data (enables full stat block in MonsterCreationPanel)
        if (!compendiumInitialized.current) {
          compendiumInitialized.current = true;
          monsterCreationSystem.initializeWithCompendium({ monsters: rawMonsters }).catch(() => {});
        }

        for (const [name, m] of Object.entries(rawMonsters as Record<string, unknown>)) {
          const monster = m as Record<string, unknown>;
          results.push({
            id: name.toLowerCase().replace(/\s+/g, '-'),
            type: 'monster',
            name,
            description: `CR ${monster.challenge_rating ?? '?'} ${monster.type ?? ''}`,
            challenge_rating: parseFloat(String(monster.challenge_rating)) || 0,
            monsterType: String(monster.type ?? ''),
            raw: monster,
          });
        }
      } catch { /* monsters unavailable */ }

      try {
        const spellRes = await compendiumService.getSpells({ limit: 500 });
        for (const spell of Object.values(spellRes.spells ?? {}) as Array<Record<string, unknown>>) {
          results.push({
            id: spell.name.toLowerCase().replace(/\s+/g, '-'),
            type: 'spell',
            name: spell.name,
            description: `Level ${spell.level} ${spell.school}`,
            level: spell.level,
            school: spell.school,
            raw: spell,
          });
        }
      } catch { /* spells unavailable */ }

      try {
        const eqRes = await compendiumService.getEquipment();
        for (const [cat, items] of Object.entries(eqRes.equipment ?? {})) {
          for (const item of (items as Array<Record<string, unknown>>)) {
            if (!item.name) continue;
            results.push({
              id: `${cat}_${item.name}`.toLowerCase().replace(/\s+/g, '-'),
              type: 'equipment',
              name: item.name,
              description: `${cat} — ${item.cost ?? '—'}`,
              cost: item.cost,
              raw: item,
            });
          }
        }
      } catch { /* equipment unavailable */ }

      setAllEntries(results);
      setLoading(false);
    };

    load().catch(e => {
      setError(String(e));
      setLoading(false);
    });
  }, [canAccess]);

  // Reset page on filter change
  useEffect(() => { setPage(0); }, [search, typeFilter, spellLevel, crMin, crMax, monsterType]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const crMinN = crMin !== '' ? parseFloat(crMin) : -Infinity;
    const crMaxN = crMax !== '' ? parseFloat(crMax) : Infinity;

    return allEntries.filter(e => {
      if (typeFilter !== 'all' && e.type !== typeFilter) return false;
      if (q && !e.name.toLowerCase().includes(q)) return false;
      if (e.type === 'spell' && spellLevel && e.level !== parseInt(spellLevel)) return false;
      if (e.type === 'monster') {
        if (crMin !== '' && (e.challenge_rating ?? 0) < crMinN) return false;
        if (crMax !== '' && (e.challenge_rating ?? 0) > crMaxN) return false;
        if (monsterType && e.monsterType !== monsterType) return false;
      }
      return true;
    });
  }, [allEntries, search, typeFilter, spellLevel, crMin, crMax, monsterType]);

  const pageEntries = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const onDragStart = useCallback((e: React.DragEvent, entry: CompendiumEntry) => {
    e.dataTransfer.setData('application/json', JSON.stringify(entry));
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  const onEntryClick = useCallback((entry: CompendiumEntry) => {
    if (entry.type === 'monster') {
      setMonsterPanelOpen(true);
    } else {
      window.dispatchEvent(new CustomEvent('compendium-insert', { detail: entry }));
    }
  }, []);

  const onMonsterPlaceOnTable = useCallback((instance: MonsterInstance) => {
    window.dispatchEvent(new CustomEvent('compendium-insert', {
      detail: {
        type: 'monster',
        name: instance.name,
        id: instance.id,
        templateId: instance.templateId,
        stats: instance.template,
      }
    }));
    setMonsterPanelOpen(false);
  }, []);

  const monsterTypes = useMemo(() => {
    const types = new Set(allEntries.filter(e => e.type === 'monster').map(e => e.monsterType ?? '').filter(Boolean));
    return Array.from(types).sort();
  }, [allEntries]);

  if (!isAuthenticated) {
    return (
      <div className={styles.panel}>
        <div className={styles.status}>Login required for compendium access</div>
      </div>
    );
  }

  if (!hasPermission('compendium:read')) {
    return (
      <div className={styles.panel}>
        <div className={`${styles.status} ${styles.error}`}>Insufficient permissions</div>
      </div>
    );
  }

  return (
    <div className={`${styles.panel} ${className || ''}`} style={style} id={id} {...otherProps}>
      <div className={styles.header}>
        <h3>Compendium</h3>
      </div>

      <div className={styles.controls}>
        <div className={styles.searchRow}>
          <input
            className={styles.searchInput}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
          />
          <select className={styles.select} value={typeFilter} onChange={e => setTypeFilter(e.target.value as EntryType)}>
            <option value="all">All</option>
            <option value="monster">Monsters</option>
            <option value="spell">Spells</option>
            <option value="equipment">Equipment</option>
          </select>
        </div>

        {(typeFilter === 'monster' || typeFilter === 'all') && (
          <div className={styles.filterRow}>
            <span className={styles.crLabel}>CR</span>
            <input className={styles.crInput} type="number" min="0" max="30" step="0.125" placeholder="min" value={crMin} onChange={e => setCrMin(e.target.value)} />
            <span className={styles.crLabel}>–</span>
            <input className={styles.crInput} type="number" min="0" max="30" step="0.125" placeholder="max" value={crMax} onChange={e => setCrMax(e.target.value)} />
            {monsterTypes.length > 0 && (
              <select className={styles.select} value={monsterType} onChange={e => setMonsterType(e.target.value)}>
                <option value="">Any type</option>
                {monsterTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
          </div>
        )}

        {typeFilter === 'spell' && (
          <div className={styles.filterRow}>
            <span className={styles.crLabel}>Level</span>
            <select className={styles.select} value={spellLevel} onChange={e => setSpellLevel(e.target.value)}>
              <option value="">All</option>
              {[0,1,2,3,4,5,6,7,8,9].map(l => <option key={l} value={l}>{l === 0 ? 'Cantrip' : l}</option>)}
            </select>
          </div>
        )}
      </div>

      {error && <div className={`${styles.status} ${styles.error}`}>{error}</div>}

      <div className={styles.list}>
        {loading && <div className={styles.status}>Loading...</div>}

        {!loading && filtered.length === 0 && (
          <div className={styles.status}>
            {allEntries.length === 0 ? 'No compendium data' : 'No matches'}
          </div>
        )}

        {!loading && pageEntries.map(entry => (
          <div
            key={`${entry.type}-${entry.id}`}
            className={styles.entry}
            draggable
            onDragStart={e => onDragStart(e, entry)}
            onClick={() => onEntryClick(entry)}
          >
            <div className={styles.entryTop}>
              <span className={`${styles.badge} ${styles[entry.type]}`}>{entry.type[0].toUpperCase()}</span>
              <span className={styles.entryName}>{entry.name}</span>
              {entry.challenge_rating !== undefined && (
                <span className={styles.entryMeta}>CR {entry.challenge_rating}</span>
              )}
              {entry.level !== undefined && (
                <span className={styles.entryMeta}>Lv {entry.level}</span>
              )}
            </div>
            <div className={styles.entryDesc}>{entry.description}</div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button className={styles.paginationBtn} disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹</button>
          <span>{page + 1} / {totalPages} ({filtered.length})</span>
          <button className={styles.paginationBtn} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>›</button>
        </div>
      )}

      <MonsterCreationPanel
        isOpen={monsterPanelOpen}
        onClose={() => setMonsterPanelOpen(false)}
        onMonsterPlaceOnTable={onMonsterPlaceOnTable}
      />
    </div>
  );
};