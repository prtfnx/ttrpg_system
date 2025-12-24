/**
 * MonsterFilters Component
 * Advanced filtering for monsters: CR, environment, type, race
 */

import React from 'react';
import styles from './MonsterFilters.module.css';

export interface MonsterFilterState {
  cr?: string;
  environment?: string;
  type?: string;
  size?: string;
  alignment?: string;
}

interface MonsterFiltersProps {
  filters: MonsterFilterState;
  onChange: (filters: MonsterFilterState) => void;
  onReset: () => void;
}

const CR_OPTIONS = [
  '0', '1/8', '1/4', '1/2',
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
  '21', '22', '23', '24', '25', '26', '27', '28', '29', '30'
];

const ENVIRONMENTS = [
  'Arctic', 'Coastal', 'Desert', 'Forest', 'Grassland',
  'Hill', 'Mountain', 'Swamp', 'Underdark', 'Underwater', 'Urban'
];

const TYPES = [
  'Aberration', 'Beast', 'Celestial', 'Construct', 'Dragon',
  'Elemental', 'Fey', 'Fiend', 'Giant', 'Humanoid',
  'Monstrosity', 'Ooze', 'Plant', 'Undead'
];

const SIZES = [
  'Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'
];

const ALIGNMENTS = [
  'Lawful Good', 'Neutral Good', 'Chaotic Good',
  'Lawful Neutral', 'True Neutral', 'Chaotic Neutral',
  'Lawful Evil', 'Neutral Evil', 'Chaotic Evil',
  'Unaligned'
];

export const MonsterFilters: React.FC<MonsterFiltersProps> = ({ filters, onChange, onReset }) => {
  const updateFilter = (key: keyof MonsterFilterState, value: string) => {
    onChange({
      ...filters,
      [key]: value || undefined
    });
  };

  const hasActiveFilters = Object.values(filters).some(v => v);

  return (
    <div className={styles.filtersContainer}>
      <div className={styles.filtersGrid}>
        <div className={styles.filterGroup}>
          <label>Challenge Rating</label>
          <select
            value={filters.cr || ''}
            onChange={(e) => updateFilter('cr', e.target.value)}
          >
            <option value="">All CR</option>
            {CR_OPTIONS.map(cr => (
              <option key={cr} value={cr}>CR {cr}</option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label>Environment</label>
          <select
            value={filters.environment || ''}
            onChange={(e) => updateFilter('environment', e.target.value)}
          >
            <option value="">All Environments</option>
            {ENVIRONMENTS.map(env => (
              <option key={env} value={env}>{env}</option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label>Type</label>
          <select
            value={filters.type || ''}
            onChange={(e) => updateFilter('type', e.target.value)}
          >
            <option value="">All Types</option>
            {TYPES.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label>Size</label>
          <select
            value={filters.size || ''}
            onChange={(e) => updateFilter('size', e.target.value)}
          >
            <option value="">All Sizes</option>
            {SIZES.map(size => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label>Alignment</label>
          <select
            value={filters.alignment || ''}
            onChange={(e) => updateFilter('alignment', e.target.value)}
          >
            <option value="">All Alignments</option>
            {ALIGNMENTS.map(alignment => (
              <option key={alignment} value={alignment}>{alignment}</option>
            ))}
          </select>
        </div>

        {hasActiveFilters && (
          <div className={styles.filterGroup}>
            <label>&nbsp;</label>
            <button className={styles.resetBtn} onClick={onReset}>
              Clear Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
