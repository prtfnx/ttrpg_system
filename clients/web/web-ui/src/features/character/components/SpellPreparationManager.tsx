import { useState } from 'react';

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

// Sample spells for demonstration
const SAMPLE_SPELLS: Spell[] = [
  {
    id: 'cure-wounds',
    name: 'Cure Wounds',
    level: 1,
    school: 'Evocation',
    castingTime: '1 action',
    range: 'Touch',
    components: 'V, S',
    duration: 'Instantaneous',
    description: 'A creature you touch regains a number of hit points equal to 1d8 + your spellcasting ability modifier.',
    ritual: false,
    concentration: false
  },
  {
    id: 'detect-magic',
    name: 'Detect Magic',
    level: 1,
    school: 'Divination',
    castingTime: '1 action',
    range: 'Self',
    components: 'V, S',
    duration: 'Concentration, up to 10 minutes',
    description: 'For the duration, you sense the presence of magic within 30 feet of you.',
    ritual: true,
    concentration: true
  },
  {
    id: 'guiding-bolt',
    name: 'Guiding Bolt',
    level: 1,
    school: 'Evocation',
    castingTime: '1 action',
    range: '120 feet',
    components: 'V, S',
    duration: 'Instantaneous',
    description: 'A flash of light streaks toward a creature of your choice within range.',
    ritual: false,
    concentration: false
  },
  {
    id: 'healing-word',
    name: 'Healing Word',
    level: 1,
    school: 'Evocation',
    castingTime: '1 bonus action',
    range: '60 feet',
    components: 'V',
    duration: 'Instantaneous',
    description: 'A creature of your choice that you can see within range regains hit points equal to 1d4 + your spellcasting ability modifier.',
    ritual: false,
    concentration: false
  },
  {
    id: 'shield-of-faith',
    name: 'Shield of Faith',
    level: 1,
    school: 'Abjuration',
    castingTime: '1 bonus action',
    range: '60 feet',
    components: 'V, S, M',
    duration: 'Concentration, up to 10 minutes',
    description: 'A shimmering field appears and surrounds a creature of your choice within range, granting it a +2 bonus to AC for the duration.',
    ritual: false,
    concentration: true
  },
  {
    id: 'comprehend-languages',
    name: 'Comprehend Languages',
    level: 1,
    school: 'Divination',
    castingTime: '1 action',
    range: 'Self',
    components: 'V, S, M',
    duration: '1 hour',
    description: 'For the duration, you understand the literal meaning of any spoken language that you hear.',
    ritual: true,
    concentration: false
  }
];

export function SpellPreparationManager({
  characterClass,
  characterLevel,
  abilityScores,
  knownSpells = SAMPLE_SPELLS,
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
      <div style={{ 
        padding: 16, 
        border: '1px solid #e2e8f0', 
        borderRadius: 8,
        background: '#f8fafc'
      }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1em', color: '#1e293b' }}>
          Spell Management
        </h3>
        <p style={{ margin: 0, color: '#64748b', fontSize: '0.9em' }}>
          This class doesn't prepare spells (spells known system).
        </p>
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
        <div style={{ 
          marginBottom: 16,
          padding: 16,
          background: '#f0fdf4',
          borderRadius: 8
        }}>
          <h4>Domain Spells (always prepared)</h4>
          <div>
            <strong>1st Level:</strong> bless, cure wounds
          </div>
          <div>
            <strong>2nd Level:</strong> hold person, spiritual weapon
          </div>
        </div>
      )}

      <div style={{ 
        padding: 16, 
        borderRadius: 8,
        background: '#f8fafc'
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: 16
        }}>
          <h3 style={{ margin: 0, fontSize: '1.1em', color: '#1e293b' }}>
            Spell Management
          </h3>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ fontSize: '0.9em', color: '#64748b' }}>
              {preparedSpells.length} / {maxPreparedSpells} prepared
            </div>
            <div style={{ fontSize: '0.9em', color: '#64748b' }}>
              Spell Slots Used: <span data-testid="spell-slots-used">{spellSlotsUsed}</span>
            </div>
          </div>
        </div>

        <div style={{ 
          display: 'flex', 
          gap: 16,
          marginBottom: 16
        }}>
        <div style={{ flex: 1 }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '1em', color: '#374151' }}>
            Available Spells
          </h4>
          <div style={{ 
            maxHeight: 200, 
            overflowY: 'auto',
            border: '1px solid #d1d5db',
            borderRadius: 4,
            background: 'white'
          }}>
            {availableSpells.length === 0 ? (
              <div style={{ 
                padding: 12, 
                textAlign: 'center', 
                color: '#64748b',
                fontSize: '0.9em'
              }}>
                {preparedSpells.length >= maxPreparedSpells 
                  ? "Cannot prepare more spells" 
                  : "No spells available to prepare"}
              </div>
            ) : (
              availableSpells.map(spell => (
                <div 
                  key={spell.id}
                  style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid #f1f5f9',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}
                >
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
                  <label 
                    htmlFor={`prepare-${spell.id}`}
                    style={{ 
                      flex: 1,
                      cursor: 'pointer',
                      fontSize: '0.9em'
                    }}
                  >
                    <div style={{ fontWeight: 500 }}>
                      {spell.name}
                      {spell.ritual && (
                        <span style={{ 
                          marginLeft: 8, 
                          fontSize: '0.75em', 
                          color: '#7c3aed',
                          fontWeight: 400
                        }}>
                          (Ritual)
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.8em', color: '#64748b' }}>
                      Level {spell.level} {spell.school}
                    </div>
                  </label>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '1em', color: '#374151' }}>
            Prepared Spells
          </h4>
          <div style={{ 
            maxHeight: 200, 
            overflowY: 'auto',
            border: '1px solid #d1d5db',
            borderRadius: 4,
            background: 'white'
          }}>
            {prepared.length === 0 ? (
              <div style={{ 
                padding: 12, 
                textAlign: 'center', 
                color: '#64748b',
                fontSize: '0.9em'
              }}>
                No spells prepared
              </div>
            ) : (
              prepared.map(spell => (
                <div 
                  key={spell.id}
                  style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid #f1f5f9',
                    cursor: 'pointer',
                    background: selectedSpell?.id === spell.id ? '#e0f2fe' : 'transparent'
                  }}
                  onClick={() => {
                    setSelectedSpell(spell);
                    setIsRitualCasting(false);
                  }}
                >
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center' 
                  }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '0.9em' }}>
                        {spell.name}
                        {spell.ritual && (
                          <span style={{ 
                            marginLeft: 8, 
                            fontSize: '0.75em', 
                            color: '#7c3aed',
                            fontWeight: 400
                          }}>
                            (Ritual)
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.8em', color: '#64748b' }}>
                        Level {spell.level} {spell.school}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUnprepareSpell(spell.id);
                      }}
                      style={{
                        padding: '4px 8px',
                        background: '#dc2626',
                        color: 'white',
                        border: 'none',
                        borderRadius: 4,
                        fontSize: '0.8em',
                        cursor: 'pointer'
                      }}
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
      <div style={{ marginBottom: 16 }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: 8
        }}>
          <h4 style={{ margin: 0, fontSize: '1em', color: '#374151' }}>
            Ritual Spells
          </h4>
          <button
            onClick={() => setShowRitualSpells(!showRitualSpells)}
            style={{
              padding: '4px 8px',
              background: 'transparent',
              border: '1px solid #d1d5db',
              borderRadius: 4,
              fontSize: '0.8em',
              cursor: 'pointer',
              color: '#374151'
            }}
          >
            {showRitualSpells ? 'Hide' : 'Show'}
          </button>
        </div>
        
        {showRitualSpells && (
          <div style={{ 
            padding: 12, 
            background: '#fefce8', 
            border: '1px solid #facc15',
            borderRadius: 4 
          }}>
            <div style={{ fontSize: '0.85em', color: '#92400e', marginBottom: 8 }}>
              Ritual spells can be cast without preparing them, but take 10 minutes longer to cast.
            </div>
            {ritualSpells.length === 0 ? (
              <div style={{ fontSize: '0.85em', color: '#64748b' }}>
                No ritual spells known.
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {ritualSpells.map(spell => (
                  <button 
                    key={spell.id}
                    aria-label={`Cast ${spell.name} (Ritual)`}
                    onClick={() => {
                      setSelectedSpell(spell);
                      setIsRitualCasting(true);
                      // Show casting time information or cast the spell
                      console.log(`Casting ${spell.name} as a ritual (takes ${spell.castingTime} + 10 minutes)`);
                    }}
                    style={{
                      padding: '4px 8px',
                      background: '#f3e8ff',
                      border: '1px solid #a855f7',
                      borderRadius: 4,
                      fontSize: '0.8em',
                      color: '#7c3aed',
                      cursor: 'pointer'
                    }}
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
        <div style={{ 
          padding: 12, 
          background: '#f1f5f9', 
          border: '1px solid #cbd5e1',
          borderRadius: 4 
        }}>
          <h5 style={{ margin: '0 0 8px 0', fontSize: '1em', color: '#1e293b' }}>
            {selectedSpell.name}
          </h5>
          <div style={{ fontSize: '0.85em', color: '#475569', marginBottom: 8 }}>
            <div>Level: {selectedSpell.level} | School: {selectedSpell.school}</div>
            <div>Casting Time: {isRitualCasting ? `${selectedSpell.castingTime} + 10 minutes (ritual)` : selectedSpell.castingTime} | Range: {selectedSpell.range}</div>
            <div>Components: {selectedSpell.components} | Duration: {selectedSpell.duration}</div>
            {isRitualCasting && (
              <div style={{ color: '#7c3aed' }}>No spell slot required</div>
            )}
          </div>
          <div style={{ fontSize: '0.85em', color: '#374151', lineHeight: 1.4 }}>
            {selectedSpell.description}
          </div>
          {isRitualCasting && (
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button 
                aria-label="Cast Ritual"
                onClick={() => {
                  console.log(`Confirmed ritual casting of ${selectedSpell.name}`);
                  // Handle ritual casting confirmation
                }}
                style={{
                  padding: '8px 16px',
                  background: '#7c3aed',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  fontSize: '0.9em',
                  cursor: 'pointer'
                }}
              >
                Cast Ritual
              </button>
              <button 
                onClick={() => {
                  setIsRitualCasting(false);
                  setSelectedSpell(null);
                }}
                style={{
                  padding: '8px 16px',
                  background: '#e5e7eb',
                  color: '#374151',
                  border: 'none',
                  borderRadius: 4,
                  fontSize: '0.9em',
                  cursor: 'pointer'
                }}
              >
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