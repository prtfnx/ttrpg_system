import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import type { Spell } from '../../services/compendiumService';
import { compendiumService } from '../../services/compendiumService';
import { spellManagementService } from '../../services/spellManagement.service';
import { ErrorBoundary } from '../common/ErrorBoundary';
import type { WizardFormData } from './WizardFormData';
import './SpellSelectionStep.css';

// Loading spinner component
const LoadingSpinner: React.FC = () => (
  <div className="loading-spinner">
    <div className="spinner"></div>
  </div>
);

// Spell list filtering and management
interface SpellFilters {
  level: number[];
  school: string[];
  classes: string[];
  ritual: boolean | null;
  concentration: boolean | null;
  search: string;
}

interface SpellSelectionStepProps {
  characterClass: string;
  characterLevel: number;
  abilityScores: Record<string, number>;
  onNext: () => void;
  onBack: () => void;
}

// D&D 5e spell schools
const SPELL_SCHOOLS = [
  'Abjuration',
  'Conjuration', 
  'Divination',
  'Enchantment',
  'Evocation',
  'Illusion',
  'Necromancy',
  'Transmutation'
];

export const SpellSelectionStep: React.FC<SpellSelectionStepProps> = ({
  characterClass,
  characterLevel,
  abilityScores,
  onNext,
  onBack
}) => {
  const { setValue, watch, formState: { errors } } = useFormContext<WizardFormData>();
  const currentSpells = watch('spells') || { cantrips: [], knownSpells: [], preparedSpells: [] };

  const [availableSpells, setAvailableSpells] = useState<Record<string, Spell>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [filters, setFilters] = useState<SpellFilters>({
    level: [],
    school: [],
    classes: [],
    ritual: null,
    concentration: null,
    search: ''
  });

  // Get spell slot information
  const spellSlots = useMemo(() => 
    spellManagementService.getSpellSlots(characterClass, characterLevel),
    [characterClass, characterLevel]
  );

  const maxSpellsKnown = useMemo(() => 
    spellManagementService.getSpellsKnown(characterClass, characterLevel),
    [characterClass, characterLevel]
  );

  const spellcastingStats = useMemo(() =>
    spellManagementService.getSpellcastingStats(characterClass, characterLevel, abilityScores),
    [characterClass, characterLevel, abilityScores]
  );

  // Load spells on component mount
  useEffect(() => {
    const loadSpells = async () => {
      try {
        setLoading(true);
        const spellsData = await compendiumService.getSpells();
        const classSpells = spellManagementService.getSpellsForClass(spellsData.spells, characterClass);
        setAvailableSpells(classSpells);
        setError(null);
      } catch (err) {
        console.error('Failed to load spells:', err);
        setError('Failed to load spell data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadSpells();
  }, [characterClass]);

  // Filter spells based on current filters
  const filteredSpells = useMemo(() => {
    let spells = Object.values(availableSpells);

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      spells = spells.filter(spell =>
        spell.name.toLowerCase().includes(searchLower) ||
        spell.description.toLowerCase().includes(searchLower)
      );
    }

    // Level filter
    if (filters.level.length > 0) {
      spells = spells.filter(spell => filters.level.includes(spell.level));
    }

    // School filter
    if (filters.school.length > 0) {
      spells = spells.filter(spell => filters.school.includes(spell.school));
    }

    // Ritual filter
    if (filters.ritual !== null) {
      spells = spells.filter(spell => spell.ritual === filters.ritual);
    }

    // Concentration filter
    if (filters.concentration !== null) {
      spells = spells.filter(spell => spell.concentration === filters.concentration);
    }

    // Sort by level, then name
    return spells.sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      return a.name.localeCompare(b.name);
    });
  }, [availableSpells, filters]);

  // Group spells by level for display
  const spellsByLevel = useMemo(() => {
    const groups: Record<number, Spell[]> = {};
    filteredSpells.forEach(spell => {
      if (!groups[spell.level]) groups[spell.level] = [];
      groups[spell.level].push(spell);
    });
    return groups;
  }, [filteredSpells]);

  // Handle spell selection
  const handleSpellToggle = useCallback((spell: Spell) => {
    const isCantrip = spell.level === 0;
    const currentList = isCantrip ? currentSpells.cantrips : currentSpells.knownSpells;
    const isSelected = currentList.includes(spell.name);

    let newCantrips = [...currentSpells.cantrips];
    let newKnownSpells = [...currentSpells.knownSpells];

    if (isCantrip) {
      if (isSelected) {
        newCantrips = newCantrips.filter(name => name !== spell.name);
      } else if (newCantrips.length < (spellSlots.cantrips || 0)) {
        newCantrips.push(spell.name);
      }
    } else {
      if (isSelected) {
        newKnownSpells = newKnownSpells.filter(name => name !== spell.name);
      } else if (maxSpellsKnown === Infinity || newKnownSpells.length < maxSpellsKnown) {
        newKnownSpells.push(spell.name);
      }
    }

    setValue('spells', {
      cantrips: newCantrips,
      knownSpells: newKnownSpells,
      preparedSpells: currentSpells.preparedSpells
    });
  }, [currentSpells, setValue, spellSlots.cantrips, maxSpellsKnown]);

  // Validation
  const isValid = useMemo(() => {
    const validation = spellManagementService.validateSpellSelection(
      characterClass,
      characterLevel,
      [...currentSpells.cantrips, ...currentSpells.knownSpells],
      availableSpells
    );
    return validation.isValid;
  }, [characterClass, characterLevel, currentSpells, availableSpells]);

  const handleFilterChange = useCallback((key: keyof SpellFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({
      level: [],
      school: [],
      classes: [],
      ritual: null,
      concentration: null,
      search: ''
    });
  }, []);

  if (loading) {
    return (
      <div className="spell-selection-step">
        <h2>Select Spells</h2>
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="spell-selection-step">
        <h2>Select Spells</h2>
        <div className="error-message">
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary fallback={<div>Error loading spell selection</div>}>
      <div className="spell-selection-step">
        <div className="step-header">
          <h2>Select Spells for {characterClass}</h2>
          <p>Choose your starting spells for level {characterLevel}</p>
        </div>

        {/* Spell Statistics */}
        <div className="spell-stats">
          <div className="stat-card">
            <h4>Cantrips</h4>
            <span className="stat-value">
              {currentSpells.cantrips.length} / {spellSlots.cantrips || 0}
            </span>
          </div>
          
          <div className="stat-card">
            <h4>{maxSpellsKnown === Infinity ? 'Prepared Spells' : 'Known Spells'}</h4>
            <span className="stat-value">
              {currentSpells.knownSpells.length} / {maxSpellsKnown === Infinity ? '∞' : maxSpellsKnown}
            </span>
          </div>

          <div className="stat-card">
            <h4>Spell Save DC</h4>
            <span className="stat-value">{spellcastingStats.spellSaveDC}</span>
          </div>

          <div className="stat-card">
            <h4>Spell Attack</h4>
            <span className="stat-value">+{spellcastingStats.spellAttackBonus}</span>
          </div>
        </div>

        {/* Filters */}
        <div className="spell-filters">
          <div className="filter-row">
            <input
              type="text"
              placeholder="Search spells..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="search-input"
            />
            
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  handleFilterChange('school', [...filters.school, e.target.value]);
                }
              }}
              className="filter-select"
            >
              <option value="">Filter by School</option>
              {SPELL_SCHOOLS.map(school => (
                <option
                  key={school}
                  value={school}
                  disabled={filters.school.includes(school)}
                >
                  {school}
                </option>
              ))}
            </select>

            <button onClick={clearFilters} className="clear-filters">
              Clear Filters
            </button>
          </div>

          {/* Level filter buttons */}
          <div className="level-filters">
            <span className="filter-label">Filter by Level:</span>
            {[0, 1, 2, 3, 4, 5].map(level => (
              <button
                key={level}
                className={`level-filter ${filters.level.includes(level) ? 'active' : ''}`}
                onClick={() => {
                  const newLevels = filters.level.includes(level)
                    ? filters.level.filter(l => l !== level)
                    : [...filters.level, level];
                  handleFilterChange('level', newLevels);
                }}
              >
                {level === 0 ? 'Cantrips' : level}
              </button>
            ))}
          </div>

          {/* Active filters display */}
          {(filters.school.length > 0 || filters.level.length > 0) && (
            <div className="active-filters">
              {filters.school.map(school => (
                <span key={school} className="filter-tag">
                  {school}
                  <button
                    onClick={() => handleFilterChange('school', filters.school.filter(s => s !== school))}
                  >
                    ×
                  </button>
                </span>
              ))}
              {filters.level.map(level => (
                <span key={level} className="filter-tag">
                  Level {level}
                  <button
                    onClick={() => handleFilterChange('level', filters.level.filter(l => l !== level))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Spell List */}
        <div className="spell-list">
          {Object.keys(spellsByLevel)
            .sort((a, b) => Number(a) - Number(b))
            .map(levelStr => {
              const level = Number(levelStr);
              const spells = spellsByLevel[level];
              const levelName = level === 0 ? 'Cantrips' : `Level ${level}`;

              return (
                <div key={level} className="spell-level-group">
                  <h3 className="level-header">{levelName}</h3>
                  <div className="spells-grid">
                    {spells.map(spell => {
                      const isSelected = (level === 0 ? currentSpells.cantrips : currentSpells.knownSpells)
                        .includes(spell.name);
                      const canSelect = level === 0
                        ? currentSpells.cantrips.length < (spellSlots.cantrips || 0)
                        : (maxSpellsKnown === Infinity || currentSpells.knownSpells.length < maxSpellsKnown);

                      return (
                        <div
                          key={spell.name}
                          className={`spell-card ${isSelected ? 'selected' : ''} ${!canSelect && !isSelected ? 'disabled' : ''}`}
                          onClick={() => canSelect || isSelected ? handleSpellToggle(spell) : null}
                        >
                          <div className="spell-header">
                            <h4 className="spell-name">{spell.name}</h4>
                            <div className="spell-meta">
                              <span className="spell-school">{spell.school}</span>
                              {spell.ritual && <span className="spell-tag ritual">R</span>}
                              {spell.concentration && <span className="spell-tag concentration">C</span>}
                            </div>
                          </div>
                          
                          <div className="spell-details">
                            <div className="casting-info">
                              <span><strong>Casting Time:</strong> {spell.casting_time}</span>
                              <span><strong>Range:</strong> {spell.range}</span>
                              <span><strong>Components:</strong> {
                                [
                                  spell.components.verbal && 'V',
                                  spell.components.somatic && 'S',
                                  spell.components.material && 'M'
                                ].filter(Boolean).join(', ')
                                + (spell.components.material_description ? ` (${spell.components.material_description})` : '')
                              }</span>
                              <span><strong>Duration:</strong> {spell.duration}</span>
                            </div>
                            
                            <p className="spell-description">{spell.description}</p>
                            
                            {spell.higher_levels && (
                              <p className="at-higher-levels">
                                <strong>At Higher Levels:</strong> {spell.higher_levels}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>

        {/* Step Navigation */}
        <div className="step-navigation">
          <button onClick={onBack} className="nav-button secondary">
            ← Back
          </button>
          
          <button 
            onClick={onNext} 
            className={`nav-button primary ${!isValid ? 'disabled' : ''}`}
            disabled={!isValid}
          >
            Next →
          </button>
        </div>

        {errors.spells && (
          <div className="validation-error">
            {errors.spells.message}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};