import type { Spell } from '@features/compendium';
import { compendiumService } from '@features/compendium/services/compendiumService';
import { ErrorBoundary } from '@shared/components';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { spellManagementService } from '../../services/spellManagement.service';
import type { WizardFormData } from './WizardFormData';

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
  characterClass?: string;
  characterLevel?: number;
  abilityScores?: Record<string, number>;
  onNext: () => void;
  onBack?: () => void;
  onPrevious?: () => void;
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
  characterClass: propCharacterClass,
  characterLevel: propCharacterLevel,
  abilityScores: propAbilityScores,
  onNext,
  onBack,
  onPrevious
}) => {
  const { setValue, watch, formState: { errors }, getValues } = useFormContext<WizardFormData>();
  
  // Get data from form context if not provided as props
  const formData = getValues();
  const characterClass = propCharacterClass || formData.class || 'fighter';
  const characterLevel = propCharacterLevel || formData.advancement?.currentLevel || 1;
  const abilityScores = propAbilityScores || {
    strength: formData.strength || 10,
    dexterity: formData.dexterity || 10,
    constitution: formData.constitution || 10,
    intelligence: formData.intelligence || 10,
    wisdom: formData.wisdom || 10,
    charisma: formData.charisma || 10
  };
  
  const handleBack = onBack || onPrevious;
  const handleNext = () => {
    console.log('🔮 Moving to next step with spells:', currentSpells);
    onNext();
  };
  
  console.log('🔮 SpellSelectionStep - characterClass:', characterClass);
  console.log('🔮 SpellSelectionStep - characterLevel:', characterLevel);
  console.log('🔮 SpellSelectionStep - abilityScores:', abilityScores);
  
  const currentSpells = watch('spells') || { cantrips: [], knownSpells: [], preparedSpells: [] };

  const [availableSpells, setAvailableSpells] = useState<Record<string, Spell>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSpell, setExpandedSpell] = useState<string | null>(null);
  
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
    spellManagementService.getSpellsKnown(characterClass, characterLevel, abilityScores),
    [characterClass, characterLevel, abilityScores]
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
        console.log('🔮 Loaded spells for class:', characterClass, '- Count:', Object.keys(classSpells).length);
        console.log('🔮 Spell slots:', spellSlots);
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
  }, [characterClass, spellSlots]);

  // Filter spells based on current filters AND available spell slots
  const filteredSpells = useMemo(() => {
    let spells = Object.values(availableSpells);
    
    console.log('🔮 Filtering spells. Total available:', spells.length);
    console.log('🔮 Spell slots for filtering:', spellSlots);

    // Filter by spell slots - only show spell levels the character can cast
    spells = spells.filter(spell => {
      if (spell.level === 0) return true; // Cantrips always available
      // Check if character has slots for this spell level
      // Access as index signature since spellSlots has numeric keys
      const hasSlot = (spellSlots as any)[spell.level] && (spellSlots as any)[spell.level] > 0;
      console.log(`🔮 Spell ${spell.name} (level ${spell.level}): hasSlot=${hasSlot}`);
      return hasSlot;
    });
    
    console.log('🔮 After slot filtering:', spells.length);

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
  }, [availableSpells, filters, spellSlots]);

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
    console.log('🔮 handleSpellToggle called for spell:', spell.name);
    const isCantrip = spell.level === 0;
    const currentList = isCantrip ? currentSpells.cantrips : currentSpells.knownSpells;
    const isSelected = currentList.includes(spell.name);

    let newCantrips = [...currentSpells.cantrips];
    let newKnownSpells = [...currentSpells.knownSpells];

    if (isCantrip) {
      if (isSelected) {
        newCantrips = newCantrips.filter(name => name !== spell.name);
        console.log('🔮 Removed cantrip, new list:', newCantrips);
      } else if (newCantrips.length < (spellSlots.cantrips || 0)) {
        newCantrips.push(spell.name);
        console.log('🔮 Added cantrip, new list:', newCantrips);
      } else {
        console.log('🔮 Cannot add more cantrips, limit reached');
      }
    } else {
      if (isSelected) {
        newKnownSpells = newKnownSpells.filter(name => name !== spell.name);
        console.log('🔮 Removed spell, new list:', newKnownSpells);
      } else if (maxSpellsKnown === Infinity || newKnownSpells.length < maxSpellsKnown) {
        newKnownSpells.push(spell.name);
        console.log('🔮 Added spell, new list:', newKnownSpells);
      } else {
        console.log('🔮 Cannot add more spells, limit reached');
      }
    }

    const newSpellData = {
      cantrips: newCantrips,
      knownSpells: newKnownSpells,
      preparedSpells: currentSpells.preparedSpells
    };
    
    console.log('🔮 Setting spells form value:', newSpellData);
    setValue('spells', newSpellData, { shouldValidate: true });
  }, [currentSpells, setValue, spellSlots.cantrips, maxSpellsKnown]);

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
          <p className="spell-requirements">
            {(spellSlots.cantrips || 0) > 0 && `Choose ${spellSlots.cantrips} cantrips`}
            {(spellSlots.cantrips || 0) > 0 && maxSpellsKnown !== Infinity && ' • '}
            {maxSpellsKnown !== Infinity && `Choose ${maxSpellsKnown} spells`}
            {maxSpellsKnown === Infinity && `Prepare spells`}
          </p>
          <p className="spell-help">
            You can only learn spells of levels you have spell slots for (Level {characterLevel} caster)
          </p>
        </div>

        <div className="spell-content">
          {/* Left Side: Available Spells */}
          <div className="available-spells-section">
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
                <span className="filter-label">Level:</span>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(level => (
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
                    {level === 0 ? 'C' : level}
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
                      {level === 0 ? 'Cantrips' : `Level ${level}`}
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

            {/* Compact Spell List */}
            <div className="spell-list-compact">
              {Object.keys(spellsByLevel)
                .sort((a, b) => Number(a) - Number(b))
                .map(levelStr => {
                  const level = Number(levelStr);
                  const spells = spellsByLevel[level];
                  const levelName = level === 0 ? 'Cantrips' : `Level ${level}`;

                  return (
                    <div key={level} className="spell-level-group">
                      <h3 className="level-header">{levelName} ({spells.length})</h3>
                      <div className="spells-compact-grid">
                        {spells.map(spell => {
                          const isCantrip = level === 0;
                          const isSelected = (isCantrip ? currentSpells.cantrips : currentSpells.knownSpells)
                            .includes(spell.name);
                          const canSelect = isCantrip
                            ? currentSpells.cantrips.length < (spellSlots.cantrips || 0)
                            : (maxSpellsKnown === Infinity || currentSpells.knownSpells.length < maxSpellsKnown);
                          const isExpanded = expandedSpell === spell.name;

                          return (
                            <div
                              key={spell.name}
                              className={`spell-card-compact ${isSelected ? 'selected' : ''} ${!canSelect && !isSelected ? 'disabled' : ''} ${isExpanded ? 'expanded' : ''}`}
                            >
                              {/* Compact Header - Always Visible */}
                              <div
                                className="spell-card-header"
                                onClick={() => setExpandedSpell(isExpanded ? null : spell.name)}
                              >
                                <div className="spell-name-row">
                                  <h4 className="spell-name">{spell.name}</h4>
                                  <div className="spell-tags">
                                    {spell.ritual && <span className="spell-tag ritual" title="Ritual">R</span>}
                                    {spell.concentration && <span className="spell-tag concentration" title="Concentration">C</span>}
                                    <span className="spell-tag school">{spell.school.substring(0, 3)}</span>
                                  </div>
                                </div>
                                <div className="spell-quick-info">
                                  <span>{spell.casting_time}</span>
                                  <span>•</span>
                                  <span>{spell.range}</span>
                                  <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
                                </div>
                              </div>

                              {/* Expanded Details */}
                              {isExpanded && (
                                <div className="spell-card-details">
                                  <div className="casting-info">
                                    <div><strong>Components:</strong> {
                                      [
                                        spell.components.verbal && 'V',
                                        spell.components.somatic && 'S',
                                        spell.components.material && 'M'
                                      ].filter(Boolean).join(', ')
                                      + (spell.components.material_description ? ` (${spell.components.material_description})` : '')
                                    }</div>
                                    <div><strong>Duration:</strong> {spell.duration}</div>
                                  </div>
                                  
                                  <p className="spell-description">{spell.description}</p>
                                  
                                  {spell.higher_levels && (
                                    <p className="at-higher-levels">
                                      <strong>At Higher Levels:</strong> {spell.higher_levels}
                                    </p>
                                  )}

                                  <button
                                    className={`add-spell-button ${isSelected ? 'remove' : 'add'}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (canSelect || isSelected) handleSpellToggle(spell);
                                    }}
                                    disabled={!canSelect && !isSelected}
                                  >
                                    {isSelected ? '✓ Selected' : '+ Add to Spellbook'}
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Right Side: Selected Spells Panel */}
          <div className="selected-spells-panel">
            <div className="panel-sticky">
              <h3>Your Spellbook</h3>
              
              {/* Spell Statistics */}
              <div className="spell-stats-panel">
                <div className="stat-row">
                  <span className="stat-label">Cantrips:</span>
                  <span className={`stat-value ${currentSpells.cantrips.length >= (spellSlots.cantrips || 0) ? 'complete' : ''}`}>
                    {currentSpells.cantrips.length} / {spellSlots.cantrips || 0}
                  </span>
                </div>
                
                <div className="stat-row">
                  <span className="stat-label">{maxSpellsKnown === Infinity ? 'Spells' : 'Known'}:</span>
                  <span className={`stat-value ${maxSpellsKnown !== Infinity && currentSpells.knownSpells.length >= maxSpellsKnown ? 'complete' : ''}`}>
                    {currentSpells.knownSpells.length} {maxSpellsKnown === Infinity ? '' : `/ ${maxSpellsKnown}`}
                  </span>
                </div>

                <div className="stat-row">
                  <span className="stat-label">Spell Save DC:</span>
                  <span className="stat-value">{spellcastingStats.spellSaveDC}</span>
                </div>

                <div className="stat-row">
                  <span className="stat-label">Spell Attack:</span>
                  <span className="stat-value">+{spellcastingStats.spellAttackBonus}</span>
                </div>
              </div>

              {/* Selected Cantrips */}
              <div className="selected-spell-section">
                <h4>Cantrips ({currentSpells.cantrips.length})</h4>
                {currentSpells.cantrips.length > 0 ? (
                  <ul className="selected-spell-list">
                    {currentSpells.cantrips.map(spellName => {
                      const spell = availableSpells[spellName];
                      return (
                        <li key={spellName} className="selected-spell-item">
                          <span className="spell-name">{spellName}</span>
                          <button
                            className="remove-spell-btn"
                            onClick={() => spell && handleSpellToggle(spell)}
                            title="Remove spell"
                          >
                            ×
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="empty-message">No cantrips selected</p>
                )}
              </div>

              {/* Selected Spells */}
              <div className="selected-spell-section">
                <h4>{maxSpellsKnown === Infinity ? 'Spells' : 'Known Spells'} ({currentSpells.knownSpells.length})</h4>
                {currentSpells.knownSpells.length > 0 ? (
                  <ul className="selected-spell-list">
                    {currentSpells.knownSpells.map(spellName => {
                      const spell = availableSpells[spellName];
                      return (
                        <li key={spellName} className="selected-spell-item">
                          <span className="spell-name">{spellName}</span>
                          {spell && <span className="spell-level">Lvl {spell.level}</span>}
                          <button
                            className="remove-spell-btn"
                            onClick={() => spell && handleSpellToggle(spell)}
                            title="Remove spell"
                          >
                            ×
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="empty-message">No spells selected</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {errors.spells && (
          <div className="validation-error">
            {errors.spells.message}
          </div>
        )}

        {/* Navigation */}
        <div className="step-navigation">
          <button
            type="button"
            onClick={handleBack}
            className="nav-button back-button"
          >
            ← Back
          </button>
          
          <button
            type="button"
            onClick={handleNext}
            className="nav-button next-button"
          >
            Next →
          </button>
        </div>
      </div>
    </ErrorBoundary>
  );
};