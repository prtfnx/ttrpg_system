import React, { useState } from "react";
import type { Character } from "../types";
import "./CharacterSheetNew.css";

interface CharacterSheetProps {
  character: Character | null;
  onSave: (character: Partial<Character>) => void;
}

// D&D 5E Skills with their associated ability scores
const SKILLS = [
  { name: 'Acrobatics', ability: 'dex' },
  { name: 'Animal Handling', ability: 'wis' },
  { name: 'Arcana', ability: 'int' },
  { name: 'Athletics', ability: 'str' },
  { name: 'Deception', ability: 'cha' },
  { name: 'History', ability: 'int' },
  { name: 'Insight', ability: 'wis' },
  { name: 'Intimidation', ability: 'cha' },
  { name: 'Investigation', ability: 'int' },
  { name: 'Medicine', ability: 'wis' },
  { name: 'Nature', ability: 'int' },
  { name: 'Perception', ability: 'wis' },
  { name: 'Performance', ability: 'cha' },
  { name: 'Persuasion', ability: 'cha' },
  { name: 'Religion', ability: 'int' },
  { name: 'Sleight of Hand', ability: 'dex' },
  { name: 'Stealth', ability: 'dex' },
  { name: 'Survival', ability: 'wis' },
] as const;

export const CharacterSheet: React.FC<CharacterSheetProps> = ({ character, onSave }) => {
  const [activeTab, setActiveTab] = useState<'core' | 'spells' | 'inventory' | 'bio'>('core');
  
  if (!character) {
    return <div className="character-sheet-empty">No character data</div>;
  }

  const data = character.data || {};
  const abilities = data.abilityScores || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  const stats = data.stats || { hp: 0, maxHp: 10, ac: 10, speed: 30, initiative: 0 };
  const profBonus = data.proficiencyBonus || Math.ceil((data.level || 1) / 4) + 1;
  const skills = data.skills || {};
  const savingThrows = data.savingThrows || { str: false, dex: false, con: false, int: false, wis: false, cha: false };

  // Helper functions
  const getModifier = (score: number): number => Math.floor((score - 10) / 2);
  const getModifierString = (score: number): string => {
    const mod = getModifier(score);
    return mod >= 0 ? `+${mod}` : `${mod}`;
  };

  const handleHPChange = (delta: number) => {
    const newHP = Math.max(0, Math.min((stats.hp || 0) + delta, stats.maxHp || 10));
    onSave({
      data: {
        ...data,
        stats: { ...stats, hp: newHP }
      }
    });
  };

  const handleStatUpdate = (field: string, value: number) => {
    onSave({
      data: {
        ...data,
        stats: { ...stats, [field]: value }
      }
    });
  };

  const handleAbilityUpdate = (ability: string, value: number) => {
    onSave({
      data: {
        ...data,
        abilityScores: { ...abilities, [ability]: value }
      }
    });
  };

  const openInNewWindow = () => {
    const newWindow = window.open(
      '',
      'character-sheet',
      'width=1400,height=900,scrollbars=yes,resizable=yes'
    );
    
    if (newWindow) {
      // Get all stylesheets from current document
      const styles = Array.from(document.styleSheets)
        .map(sheet => {
          try {
            return Array.from(sheet.cssRules)
              .map(rule => rule.cssText)
              .join('\n');
          } catch (e) {
            // Cross-origin stylesheets will throw, skip them
            return '';
          }
        })
        .join('\n');

      // Get the character sheet HTML
      const sheetHTML = document.querySelector('.character-sheet-redesigned')?.outerHTML || '<p>Error loading character sheet</p>';
      
      newWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${character.name} - Character Sheet</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              ${styles}
              body { 
                margin: 0; 
                padding: 0; 
                background: #1a1a1a;
                overflow: auto;
              }
              .character-sheet-redesigned {
                height: 100vh;
              }
              /* Hide pop-out button in pop-out window */
              .popout-btn {
                display: none !important;
              }
            </style>
          </head>
          <body>
            ${sheetHTML}
          </body>
        </html>
      `);
      newWindow.document.close();
    }
  };

  return (
    <div className="character-sheet-redesigned">
      {/* Character Header - Always Visible */}
      <div className="sheet-header">
        <div className="header-left">
          <h1 className="char-name">{character.name}</h1>
          <div className="char-subtitle">
            <span className="char-class">{data.class || 'Class'}</span>
            <span className="char-divider">•</span>
            <span className="char-level">Level {data.level || 1}</span>
            <span className="char-divider">•</span>
            <span className="char-race">{data.race || 'Race'}</span>
          </div>
        </div>
        <div className="header-right">
          <button
            type="button"
            className="popout-btn"
            onClick={openInNewWindow}
            title="Open in new window (Ctrl+Shift+C)"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M14 2H8v2h3.59L5.29 10.3l1.42 1.42L13 5.41V9h2V3c0-.55-.45-1-1-1zM12 14H3V5h4V3H3a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-4h-2v4z"/>
            </svg>
            <span>Pop-out</span>
          </button>
          <div className="prof-bonus-display">
            <div className="prof-label">Proficiency Bonus</div>
            <div className="prof-value">+{profBonus}</div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="sheet-tabs">
        <button
          type="button"
          className={`sheet-tab ${activeTab === 'core' ? 'active' : ''}`}
          onClick={() => setActiveTab('core')}
        >
          Core Stats
        </button>
        <button
          type="button"
          className={`sheet-tab ${activeTab === 'spells' ? 'active' : ''}`}
          onClick={() => setActiveTab('spells')}
        >
          Spells & Features
        </button>
        <button
          type="button"
          className={`sheet-tab ${activeTab === 'inventory' ? 'active' : ''}`}
          onClick={() => setActiveTab('inventory')}
        >
          Inventory
        </button>
        <button
          type="button"
          className={`sheet-tab ${activeTab === 'bio' ? 'active' : ''}`}
          onClick={() => setActiveTab('bio')}
        >
          Notes & Bio
        </button>
      </div>

      {/* Main Content */}
      <div className="sheet-body">
        {activeTab === 'core' && (
          <div className="core-stats-layout">
            {/* Left Column - Ability Scores & Skills */}
            <div className="left-column">
              {/* Ability Scores */}
              <div className="abilities-card card">
                <h3 className="card-title">Ability Scores</h3>
                <div className="abilities-grid">
                  {Object.entries(abilities).map(([key, value]) => {
                    const score = Number(value);
                    const mod = getModifier(score);
                    const modStr = getModifierString(score);
                    const label = key.toUpperCase();
                    const isProficient = savingThrows[key as keyof typeof savingThrows];
                    const saveBonus = mod + (isProficient ? profBonus : 0);
                    const saveStr = saveBonus >= 0 ? `+${saveBonus}` : `${saveBonus}`;

                    return (
                      <div key={key} className="ability-block">
                        <div className="ability-header">{label}</div>
                        <div className="ability-modifier" title="Modifier">{modStr}</div>
                        <input
                          type="number"
                          className="ability-score"
                          value={score}
                          onChange={(e) => handleAbilityUpdate(key, Number(e.target.value))}
                          min={1}
                          max={30}
                        />
                        <div className="saving-throw">
                          <input
                            type="checkbox"
                            id={`save-${key}`}
                            checked={isProficient}
                            onChange={(e) => {
                              onSave({
                                data: {
                                  ...data,
                                  savingThrows: { ...savingThrows, [key]: e.target.checked }
                                }
                              });
                            }}
                          />
                          <label htmlFor={`save-${key}`} title="Saving throw">
                            {saveStr}
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Skills */}
              <div className="skills-card card">
                <h3 className="card-title">Skills</h3>
                <div className="skills-list">
                  {SKILLS.map((skill) => {
                    const abilityMod = getModifier(abilities[skill.ability]);
                    const isProficient = skills[skill.name] || false;
                    const bonus = abilityMod + (isProficient ? profBonus : 0);
                    const bonusStr = bonus >= 0 ? `+${bonus}` : `${bonus}`;

                    return (
                      <div key={skill.name} className="skill-row">
                        <input
                          type="checkbox"
                          id={`skill-${skill.name}`}
                          checked={isProficient}
                          onChange={(e) => {
                            onSave({
                              data: {
                                ...data,
                                skills: { ...skills, [skill.name]: e.target.checked }
                              }
                            });
                          }}
                        />
                        <label htmlFor={`skill-${skill.name}`} className="skill-name">
                          {skill.name}
                        </label>
                        <span className="skill-ability">({skill.ability.toUpperCase()})</span>
                        <span className="skill-bonus">{bonusStr}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="passive-perception">
                  <span className="passive-label">Passive Perception</span>
                  <span className="passive-value">
                    {10 + getModifier(abilities.wis) + (skills['Perception'] ? profBonus : 0)}
                  </span>
                </div>
              </div>
            </div>

            {/* Center Column - Combat Stats */}
            <div className="center-column">
              {/* Hit Points */}
              <div className="hp-card card">
                <h3 className="card-title">Hit Points</h3>
                <div className="hp-display">
                  <input
                    type="number"
                    className="hp-current-input"
                    value={stats.hp || 0}
                    onChange={(e) => handleStatUpdate('hp', Number(e.target.value))}
                    min={0}
                    max={stats.maxHp || 999}
                  />
                  <div className="hp-divider">/</div>
                  <div className="hp-max">{stats.maxHp || 10}</div>
                </div>
                <div className="hp-controls">
                  <button
                    type="button"
                    className="hp-btn damage"
                    onClick={() => handleHPChange(-1)}
                    title="Damage (-1)"
                  >
                    -1
                  </button>
                  <button
                    type="button"
                    className="hp-btn damage"
                    onClick={() => handleHPChange(-5)}
                    title="Damage (-5)"
                  >
                    -5
                  </button>
                  <button
                    type="button"
                    className="hp-btn heal"
                    onClick={() => handleHPChange(1)}
                    title="Heal (+1)"
                  >
                    +1
                  </button>
                  <button
                    type="button"
                    className="hp-btn heal"
                    onClick={() => handleHPChange(5)}
                    title="Heal (+5)"
                  >
                    +5
                  </button>
                </div>
                <div className="hp-adjust">
                  <label htmlFor="max-hp">Max HP:</label>
                  <input
                    id="max-hp"
                    type="number"
                    value={stats.maxHp || 10}
                    onChange={(e) => handleStatUpdate('maxHp', Number(e.target.value))}
                    min={1}
                  />
                </div>
              </div>

              {/* Combat Stats */}
              <div className="combat-stats-card card">
                <h3 className="card-title">Combat Stats</h3>
                <div className="combat-grid">
                  <div className="combat-stat">
                    <label htmlFor="ac">Armor Class</label>
                    <input
                      id="ac"
                      type="number"
                      value={stats.ac || 10}
                      onChange={(e) => handleStatUpdate('ac', Number(e.target.value))}
                      className="combat-input large"
                    />
                  </div>
                  <div className="combat-stat">
                    <label>Initiative</label>
                    <div className="combat-value large">
                      {getModifierString(abilities.dex)}
                    </div>
                  </div>
                  <div className="combat-stat">
                    <label htmlFor="speed">Speed</label>
                    <input
                      id="speed"
                      type="number"
                      value={stats.speed || 30}
                      onChange={(e) => handleStatUpdate('speed', Number(e.target.value))}
                      className="combat-input"
                    />
                    <span className="speed-unit">ft</span>
                  </div>
                </div>
              </div>

              {/* Death Saves */}
              <div className="death-saves-card card">
                <h3 className="card-title">Death Saves</h3>
                <div className="death-saves-grid">
                  <div className="death-saves-row">
                    <span className="save-label success">Successes</span>
                    <div className="save-boxes">
                      <input type="checkbox" className="death-save-check success" />
                      <input type="checkbox" className="death-save-check success" />
                      <input type="checkbox" className="death-save-check success" />
                    </div>
                  </div>
                  <div className="death-saves-row">
                    <span className="save-label failure">Failures</span>
                    <div className="save-boxes">
                      <input type="checkbox" className="death-save-check failure" />
                      <input type="checkbox" className="death-save-check failure" />
                      <input type="checkbox" className="death-save-check failure" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Conditions */}
              <div className="conditions-card card">
                <h3 className="card-title">Conditions</h3>
                <div className="conditions-list">
                  {(data.conditions && data.conditions.length > 0) ? (
                    data.conditions.map((condition: string) => (
                      <span key={condition} className="condition-badge">
                        {condition}
                      </span>
                    ))
                  ) : (
                    <div className="no-conditions">No active conditions</div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column - Features & Actions */}
            <div className="right-column">
              {/* Hit Dice */}
              <div className="hit-dice-card card">
                <h3 className="card-title">Hit Dice</h3>
                <div className="hit-dice-display">
                  <span className="hit-dice-count">
                    {data.level || 1}d{data.hitDie || 8}
                  </span>
                  <button type="button" className="use-hit-die-btn">
                    Use Hit Die
                  </button>
                </div>
              </div>

              {/* Inspiration */}
              <div className="inspiration-card card">
                <label className="inspiration-check">
                  <input
                    type="checkbox"
                    checked={data.inspiration || false}
                    onChange={(e) => {
                      onSave({
                        data: { ...data, inspiration: e.target.checked }
                      });
                    }}
                  />
                  <span className="inspiration-label">Inspiration</span>
                </label>
              </div>

              {/* Attacks & Actions */}
              <div className="attacks-card card">
                <h3 className="card-title">Attacks & Spellcasting</h3>
                <div className="attack-info">
                  <div className="attack-row">
                    <span className="attack-label">Melee Attack:</span>
                    <span className="attack-bonus">
                      {getModifierString(abilities.str)} + {profBonus}
                    </span>
                  </div>
                  <div className="attack-row">
                    <span className="attack-label">Ranged Attack:</span>
                    <span className="attack-bonus">
                      {getModifierString(abilities.dex)} + {profBonus}
                    </span>
                  </div>
                  <div className="attack-row">
                    <span className="attack-label">Spell Save DC:</span>
                    <span className="attack-bonus">
                      {8 + profBonus + Math.max(getModifier(abilities.wis), getModifier(abilities.int), getModifier(abilities.cha))}
                    </span>
                  </div>
                </div>
              </div>

              {/* Features & Traits */}
              <div className="features-card card">
                <h3 className="card-title">Features & Traits</h3>
                <div className="features-list">
                  {data.features && data.features.length > 0 ? (
                    data.features.map((feature: string, idx: number) => (
                      <div key={idx} className="feature-item">
                        {feature}
                      </div>
                    ))
                  ) : (
                    <div className="no-features">No features listed</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'spells' && (
          <div className="spells-tab-content">
            <h3>Spells & Magical Abilities</h3>
            <p>Spell list will appear here</p>
          </div>
        )}

        {activeTab === 'inventory' && (
          <div className="inventory-tab-content">
            <h3>Equipment & Inventory</h3>
            <p>Inventory system will appear here</p>
          </div>
        )}

        {activeTab === 'bio' && (
          <div className="bio-tab-content">
            <h3>Character Biography</h3>
            <p>Character notes and biography will appear here</p>
          </div>
        )}
      </div>
    </div>
  );
};
