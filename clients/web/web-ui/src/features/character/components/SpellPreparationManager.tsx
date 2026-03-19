import { useState } from 'react';
import styles from './SpellPreparationManager.module.css';

interface Spell {
  id: string;
  name: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  description: string;
  ritual: boolean;
  concentration: boolean;
}

interface SpellPreparationManagerProps {
  characterClass: string;
  characterLevel: number;
  abilityScores: Record<string, number>;
  knownSpells: Spell[];
  preparedSpells: string[];
  onPrepareSpell: (spellId: string) => void;
  onUnprepareSpell: (spellId: string) => void;
}

// D&D 5e spell preparation limits
function calculateSpellsCanPrepare(characterClass: string, level: number, abilityModifier: number): number {
  const classes = characterClass.toLowerCase().split(',').map(c => c.trim());
  
  // For multiclass, use the primary spellcasting class
  const primaryClass = classes.find(c => 
    ['cleric', 'druid', 'paladin', 'ranger', 'wizard'].includes(c)
  ) || classes[0];

  switch (primaryClass) {
    case 'cleric':
    case 'druid':
    case 'paladin':
      return Math.max(1, level + abilityModifier);
    case 'wizard':
      return Math.max(1, level + abilityModifier);
    case 'ranger':
      return level >= 2 ? Math.max(1, Math.floor(level / 2) + abilityModifier) : 0;
    default:
      return 0; // Non-preparation casters
  }
}

function getAbilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

function getSpellcastingAbilityModifier(characterClass: string, abilityScores: Record<string, number>): number {
  const classes = characterClass.toLowerCase().split(',').map(c => c.trim());
  const primaryClass = classes.find(c => 
    ['cleric', 'druid', 'paladin', 'ranger', 'wizard'].includes(c)
  ) || classes[0];

  switch (primaryClass) {
    case 'cleric':
    case 'druid':
    case 'ranger':
      return getAbilityModifier(abilityScores.wisdom || 10);
    case 'paladin':
      return getAbilityModifier(abilityScores.charisma || 10);
    case 'wizard':
      return getAbilityModifier(abilityScores.intelligence || 10);
    default:
      return 0;
  }
}

export function SpellPreparationManager({
  characterClass,
  characterLevel,
  abilityScores,
  knownSpells,
  preparedSpells,
  onPrepareSpell,
  onUnprepareSpell
}: SpellPreparationManagerProps) {
  const [selectedSpell, setSelectedSpell] = useState<Spell | null>(null);
  const [showRitualSpells, setShowRitualSpells] = useState(true);
  const [isRitualCasting, setIsRitualCasting] = useState(false);
  const [spellSlotsUsed] = useState(0);

  const abilityModifier = getSpellcastingAbilityModifier(characterClass, abilityScores);
  const maxPreparedSpells = calculateSpellsCanPrepare(characterClass, characterLevel, abilityModifier);
  
  // Don't show for non-preparation casters
  if (maxPreparedSpells === 0) {
    return (
      <div className={styles.container}>
        <h3 className={styles.title}>Spell Management</h3>
        <p className={styles.spellMeta}>This class doesn't prepare spells (spells known system).</p>
      </div>
    );
  }

  const availableSpells = knownSpells.filter(spell => !preparedSpells.includes(spell.id));
  const prepared = knownSpells.filter(spell => preparedSpells.includes(spell.id));
  const ritualSpells = knownSpells.filter(spell => spell.ritual);

  return (
    <div>
      {/* Domain Spells for Clerics */}
      {characterClass.toLowerCase().includes('cleric') && (
        <div className={styles.domainSpells}>
          <h4>Domain Spells (always prepared)</h4>
          <div>
            <strong>1st Level:</strong> bless, cure wounds
          </div>
          <div>
            <strong>2nd Level:</strong> hold person, spiritual weapon
          </div>
        </div>
      )}

      <div className={styles.container}>
        <div className={styles.header}>
          <h3 className={styles.title}>Spell Management</h3>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div className={styles.counter}>{preparedSpells.length} / {maxPreparedSpells} prepared</div>
            <div className={styles.counter}>Spell Slots Used: <span data-testid="spell-slots-used">{spellSlotsUsed}</span></div>
          </div>
        </div>

        <div className={styles.spellGrid}>
        <div className={styles.spellColumn}>
          <h4 className={styles.columnTitle}>Available Spells</h4>
          <div className={styles.spellList}>
            {availableSpells.length === 0 ? (
              <div className={styles.emptyState}>
                {preparedSpells.length >= maxPreparedSpells 
                  ? 'Cannot prepare more spells' 
                  : 'No spells available to prepare'}
              </div>
            ) : (
              availableSpells.map(spell => (
                <div key={spell.id} className={styles.spellItem}>
                  <input
                    type="checkbox"
                    id={`prepare-${spell.id}`}
                    checked={false}
                    onChange={() => {
                      if (preparedSpells.length < maxPreparedSpells) {
                        onPrepareSpell(spell.id);
                      }
                    }}
                    disabled={preparedSpells.length >= maxPreparedSpells}
                    aria-label={`prepare spell ${spell.name}`}
                  />
                  <label htmlFor={`prepare-${spell.id}`} className={styles.spellLabel}>
                    <div className={styles.spellName}>
                      {spell.name}
                      {spell.ritual && <span className={styles.ritualBadge}>(Ritual)</span>}
                    </div>
                    <div className={styles.spellMeta}>Level {spell.level} {spell.school}</div>
                  </label>
                </div>
              ))
            )}
          </div>
        </div>

        <div className={styles.spellColumn}>
          <h4 className={styles.columnTitle}>Prepared Spells</h4>
          <div className={styles.spellList}>
            {prepared.length === 0 ? (
              <div className={styles.emptyState}>No spells prepared</div>
            ) : (
              prepared.map(spell => (
                <div
                  key={spell.id}
                  className={`${styles.preparedItem} ${selectedSpell?.id === spell.id ? styles.preparedItemSelected : ''}`}
                  onClick={() => { setSelectedSpell(spell); setIsRitualCasting(false); }}
                >
                  <div className={styles.preparedItemRow}>
                    <div>
                      <div className={styles.spellName}>
                        {spell.name}
                        {spell.ritual && <span className={styles.ritualBadge}>(Ritual)</span>}
                      </div>
                      <div className={styles.spellMeta}>Level {spell.level} {spell.school}</div>
                    </div>
                    <button
                      className={styles.removeBtn}
                      onClick={(e) => { e.stopPropagation(); onUnprepareSpell(spell.id); }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Ritual Spells Section */}
      <div className={styles.ritualSection}>
        <div className={styles.ritualHeader}>
          <h4 className={styles.sectionLabel}>Ritual Spells</h4>
          <button className={styles.toggleBtn} onClick={() => setShowRitualSpells(!showRitualSpells)}>
            {showRitualSpells ? 'Hide' : 'Show'}
          </button>
        </div>
        
        {showRitualSpells && (
          <div className={styles.ritualBox}>
            <div className={styles.ritualInfo}>
              Ritual spells can be cast without preparing them, but take 10 minutes longer to cast.
            </div>
            {ritualSpells.length === 0 ? (
              <div className={styles.spellMeta}>No ritual spells known.</div>
            ) : (
              <div className={styles.ritualChips}>
                {ritualSpells.map(spell => (
                  <button
                    key={spell.id}
                    className={styles.ritualChip}
                    aria-label={`Cast ${spell.name} (Ritual)`}
                    onClick={() => { setSelectedSpell(spell); setIsRitualCasting(true); }}
                  >
                    {spell.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Spell Details */}
      {selectedSpell && (
        <div className={styles.spellDetail}>
          <h5 className={styles.detailTitle}>{selectedSpell.name}</h5>
          <div className={styles.detailMeta}>
            <div>Level: {selectedSpell.level} | School: {selectedSpell.school}</div>
            <div>Casting Time: {isRitualCasting ? `${selectedSpell.castingTime} + 10 minutes (ritual)` : selectedSpell.castingTime} | Range: {selectedSpell.range}</div>
            <div>Components: {selectedSpell.components} | Duration: {selectedSpell.duration}</div>
            {isRitualCasting && <div className={styles.detailRitualNote}>No spell slot required</div>}
          </div>
          <div className={styles.detailDesc}>{selectedSpell.description}</div>
          {isRitualCasting && (
            <div className={styles.castRow}>
              <button className={styles.castBtn} aria-label="Cast Ritual" onClick={() => {}}>
                Cast Ritual
              </button>
              <button className={styles.cancelBtn} onClick={() => { setIsRitualCasting(false); setSelectedSpell(null); }}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}