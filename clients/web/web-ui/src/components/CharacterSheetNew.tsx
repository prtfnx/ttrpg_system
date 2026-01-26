import { ProtocolService, useProtocol } from '@lib/api';
import { showToast } from '@shared/utils';
import clsx from "clsx";
import React, { useRef, useState } from "react";
import { useGameStore } from "../store";
import type { Character } from "../types";
import styles from "./CharacterSheetNew.module.css";

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
  const [selectedTokenSpriteId, setSelectedTokenSpriteId] = useState<string>('');
  const [tokenImagePreview, setTokenImagePreview] = useState<string>('');
  const imageInputRef = useRef<HTMLInputElement>(null);
  
  const { isConnected } = useProtocol();
  const { sprites, activeTableId, getSpritesForCharacter, linkSpriteToCharacter } = useGameStore();
  
  if (!character) {
    return <div className={styles.characterSheetEmpty}>No character data</div>;
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

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast.error('Please select an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setTokenImagePreview(result);
    };
    reader.readAsDataURL(file);
  };

  const handleLinkExistingToken = () => {
    if (!selectedTokenSpriteId) {
      showToast.error('Please select a token to link');
      return;
    }

    linkSpriteToCharacter(selectedTokenSpriteId, character.id);
    showToast.success(`Token linked to ${character.name}`);
    setSelectedTokenSpriteId('');
  };

  const handleCreateTokenFromImage = () => {
    if (!tokenImagePreview) {
      showToast.error('Please upload an image first');
      return;
    }

    if (!activeTableId) {
      showToast.error('No active table. Please create or join a table first');
      return;
    }

    if (!isConnected || !ProtocolService.hasProtocol()) {
      showToast.error('Not connected to server');
      return;
    }

    const spriteId = `sprite_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const spriteData = {
      sprite_id: spriteId,
      table_id: activeTableId,
      character_id: character.id,
      texture_path: tokenImagePreview,
      coord_x: 100,
      coord_y: 100,
      scale_x: 1.0,
      scale_y: 1.0,
      rotation: 0,
      layer: 'tokens',
      moving: false,
      collidable: true,
      hp: character.data?.stats?.hp,
      max_hp: character.data?.stats?.maxHp,
      ac: character.data?.stats?.ac
    };

    console.log('[CharacterSheet] Creating token sprite:', spriteData);
    
    try {
      ProtocolService.getProtocol().createSprite(spriteData);
      showToast.success(`Token created for ${character.name}`);
      setTokenImagePreview('');
      if (imageInputRef.current) {
        imageInputRef.current.value = '';
      }
    } catch (error) {
      console.error('[CharacterSheet] Failed to create token:', error);
      showToast.error('Failed to create token');
    }
  };

  const linkedTokens = getSpritesForCharacter(character.id);
  const availableSprites = sprites.filter(s => s.tableId === activeTableId && !s.characterId);


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
    <div className={styles.characterSheetRedesigned}>
      {/* Character Header - Always Visible */}
      <div className={styles.sheetHeader}>
        <div className={styles.headerLeft}>
          <h1 className={styles.charName}>{character.name}</h1>
          <div className={styles.charSubtitle}>
            <span className={styles.charClass}>{data.class || 'Class'}</span>
            <span className={styles.charDivider}>•</span>
            <span className={styles.charLevel}>Level {data.level || 1}</span>
            <span className={styles.charDivider}>•</span>
            <span className={styles.charRace}>{data.race || 'Race'}</span>
          </div>
        </div>
        <div className={styles.headerRight}>
          <button
            type="button"
            className={styles.popoutBtn}
            onClick={openInNewWindow}
            title="Open in new window (Ctrl+Shift+C)"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M14 2H8v2h3.59L5.29 10.3l1.42 1.42L13 5.41V9h2V3c0-.55-.45-1-1-1zM12 14H3V5h4V3H3a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-4h-2v4z"/>
            </svg>
            <span>Pop-out</span>
          </button>
          <div className={styles.profBonusDisplay}>
            <div className={styles.profLabel}>Proficiency Bonus</div>
            <div className={styles.profValue}>+{profBonus}</div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className={styles.sheetTabs}>
        <button
          type="button"
          className={clsx(styles.sheetTab, activeTab === "core" && styles.active)}
          onClick={() => setActiveTab('core')}
        >
          Core Stats
        </button>
        <button
          type="button"
          className={clsx(styles.sheetTab, activeTab === "spells" && styles.active)}
          onClick={() => setActiveTab('spells')}
        >
          Spells & Features
        </button>
        <button
          type="button"
          className={clsx(styles.sheetTab, activeTab === "inventory" && styles.active)}
          onClick={() => setActiveTab('inventory')}
        >
          Inventory
        </button>
        <button
          type="button"
          className={clsx(styles.sheetTab, activeTab === "bio" && styles.active)}
          onClick={() => setActiveTab('bio')}
        >
          Notes & Bio
        </button>
      </div>

      {/* Main Content */}
      <div className={styles.sheetBody}>
        {activeTab === 'core' && (
          <div className={styles.coreStatsLayout}>
            {/* Left Column - Ability Scores & Skills */}
            <div className={styles.leftColumn}>
              {/* Ability Scores */}
              <div className={clsx(styles.abilitiesCard, styles.card)}>
                <h3 className={styles.cardTitle}>Ability Scores</h3>
                <div className={styles.abilitiesGrid}>
                  {Object.entries(abilities).map(([key, value]) => {
                    const score = Number(value);
                    const mod = getModifier(score);
                    const modStr = getModifierString(score);
                    const label = key.toUpperCase();
                    const isProficient = savingThrows[key as keyof typeof savingThrows];
                    const saveBonus = mod + (isProficient ? profBonus : 0);
                    const saveStr = saveBonus >= 0 ? `+${saveBonus}` : `${saveBonus}`;

                    return (
                      <div key={key} className={styles.abilityBlock}>
                        <div className={styles.abilityHeader}>{label}</div>
                        <div className={styles.abilityModifier} title="Modifier">{modStr}</div>
                        <input
                          type="number"
                          className={styles.abilityScore}
                          value={score}
                          onChange={(e) => handleAbilityUpdate(key, Number(e.target.value))}
                          min={1}
                          max={30}
                        />
                        <div className={styles.savingThrow}>
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
              <div className={clsx(styles.skillsCard, styles.card)}>
                <h3 className={styles.cardTitle}>Skills</h3>
                <div className={styles.skillsList}>
                  {SKILLS.map((skill) => {
                    const abilityMod = getModifier(abilities[skill.ability]);
                    const isProficient = skills[skill.name] || false;
                    const bonus = abilityMod + (isProficient ? profBonus : 0);
                    const bonusStr = bonus >= 0 ? `+${bonus}` : `${bonus}`;

                    return (
                      <div key={skill.name} className={styles.skillRow}>
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
                        <label htmlFor={`skill-${skill.name}`} className={styles.skillName}>
                          {skill.name}
                        </label>
                        <span className={styles.skillAbility}>({skill.ability.toUpperCase()})</span>
                        <span className={styles.skillBonus}>{bonusStr}</span>
                      </div>
                    );
                  })}
                </div>
                <div className={styles.passivePerception}>
                  <span className={styles.passiveLabel}>Passive Perception</span>
                  <span className={styles.passiveValue}>
                    {10 + getModifier(abilities.wis) + (skills['Perception'] ? profBonus : 0)}
                  </span>
                </div>
              </div>
            </div>

            {/* Center Column - Combat Stats */}
            <div className={styles.centerColumn}>
              {/* Hit Points */}
              <div className={clsx(styles.hpCard, styles.card)}>
                <h3 className={styles.cardTitle}>Hit Points</h3>
                <div className={styles.hpDisplay}>
                  <input
                    type="number"
                    className={styles.hpCurrentInput}
                    value={stats.hp || 0}
                    onChange={(e) => handleStatUpdate('hp', Number(e.target.value))}
                    min={0}
                    max={stats.maxHp || 999}
                  />
                  <div className={styles.hpDivider}>/</div>
                  <div className={styles.hpMax}>{stats.maxHp || 10}</div>
                </div>
                <div className={styles.hpControls}>
                  <button
                    type="button"
                    className={clsx(styles.hpBtn, styles.damage)}
                    onClick={() => handleHPChange(-1)}
                    title="Damage (-1)"
                  >
                    -1
                  </button>
                  <button
                    type="button"
                    className={clsx(styles.hpBtn, styles.damage)}
                    onClick={() => handleHPChange(-5)}
                    title="Damage (-5)"
                  >
                    -5
                  </button>
                  <button
                    type="button"
                    className={clsx(styles.hpBtn, styles.heal)}
                    onClick={() => handleHPChange(1)}
                    title="Heal (+1)"
                  >
                    +1
                  </button>
                  <button
                    type="button"
                    className={clsx(styles.hpBtn, styles.heal)}
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
                <h3 className={styles.cardTitle}>Combat Stats</h3>
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
                <h3 className={styles.cardTitle}>Death Saves</h3>
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
                <h3 className={styles.cardTitle}>Conditions</h3>
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
            <div className={styles.rightColumn}>
              {/* Hit Dice */}
              <div className="hit-dice-card card">
                <h3 className={styles.cardTitle}>Hit Dice</h3>
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
                <h3 className={styles.cardTitle}>Attacks & Spellcasting</h3>
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
                <h3 className={styles.cardTitle}>Features & Traits</h3>
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
            <h3>Character Biography & Tokens</h3>
            
            {/* Bio Section */}
            <div className={styles.bioSection} style={{ marginBottom: '24px' }}>
              <h4>Biography</h4>
              <textarea
                value={character.data?.bio || ''}
                onChange={(e) => onSave({
                  data: { ...data, bio: e.target.value }
                })}
                placeholder="Write your character's backstory, personality, goals, etc..."
                rows={6}
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: '14px',
                  border: '1px solid #444',
                  borderRadius: '6px',
                  backgroundColor: '#2a2a2a',
                  color: '#e0e0e0',
                  resize: 'vertical',
                  fontFamily: 'inherit'
                }}
              />
            </div>

            {/* Linked Tokens Section */}
            <div className="linked-tokens-section" style={{ marginBottom: '24px' }}>
              <h4>Linked Tokens</h4>
              {linkedTokens.length > 0 ? (
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {linkedTokens.map(token => (
                    <div 
                      key={token.id} 
                      style={{
                        padding: '8px 12px',
                        backgroundColor: '#3a3a3a',
                        borderRadius: '6px',
                        border: '1px solid #555',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      <span style={{ fontSize: '14px' }}>🎭</span>
                      <span style={{ fontSize: '13px' }}>{token.name || token.id.substring(0, 8)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#888', fontSize: '13px' }}>No tokens linked to this character</p>
              )}
            </div>

            {/* Link Existing Token */}
            <div className="link-token-section" style={{ marginBottom: '24px', padding: '16px', backgroundColor: '#2a2a2a', borderRadius: '8px', border: '1px solid #444' }}>
              <h4 style={{ marginTop: 0 }}>Link Existing Token</h4>
              <p style={{ fontSize: '13px', color: '#aaa', marginBottom: '12px' }}>
                Select a token from the current table to link to this character
              </p>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <select
                  value={selectedTokenSpriteId}
                  onChange={(e) => setSelectedTokenSpriteId(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    backgroundColor: '#1a1a1a',
                    color: '#e0e0e0',
                    border: '1px solid #555',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                >
                  <option value="">-- Select a token --</option>
                  {availableSprites.map(sprite => (
                    <option key={sprite.id} value={sprite.id}>
                      {sprite.name || `Token ${sprite.id.substring(0, 8)}`}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleLinkExistingToken}
                  disabled={!selectedTokenSpriteId}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: selectedTokenSpriteId ? '#4a90e2' : '#333',
                    color: selectedTokenSpriteId ? '#fff' : '#666',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: selectedTokenSpriteId ? 'pointer' : 'not-allowed',
                    fontSize: '14px',
                    fontWeight: 500
                  }}
                >
                  Link Token
                </button>
              </div>
            </div>

            {/* Create New Token from Image */}
            <div className="create-token-section" style={{ padding: '16px', backgroundColor: '#2a2a2a', borderRadius: '8px', border: '1px solid #444' }}>
              <h4 style={{ marginTop: 0 }}>Create New Token</h4>
              <p style={{ fontSize: '13px', color: '#aaa', marginBottom: '12px' }}>
                Upload an image to create a new token on the current table
              </p>
              
              {/* Image Upload */}
              <div style={{ marginBottom: '16px' }}>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  style={{
                    padding: '8px',
                    backgroundColor: '#1a1a1a',
                    color: '#e0e0e0',
                    border: '1px solid #555',
                    borderRadius: '6px',
                    fontSize: '14px',
                    cursor: 'pointer',
                    width: '100%'
                  }}
                />
              </div>

              {/* Image Preview */}
              {tokenImagePreview && (
                <div style={{ marginBottom: '16px', textAlign: 'center' }}>
                  <p style={{ fontSize: '13px', color: '#aaa', marginBottom: '8px' }}>Preview:</p>
                  <img
                    src={tokenImagePreview}
                    alt="Token preview"
                    style={{
                      maxWidth: '120px',
                      maxHeight: '120px',
                      borderRadius: '8px',
                      border: '2px solid #4a90e2',
                      objectFit: 'contain'
                    }}
                  />
                </div>
              )}

              {/* Create Button */}
              <button
                onClick={handleCreateTokenFromImage}
                disabled={!tokenImagePreview || !isConnected}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: (tokenImagePreview && isConnected) ? '#10b981' : '#333',
                  color: (tokenImagePreview && isConnected) ? '#fff' : '#666',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: (tokenImagePreview && isConnected) ? 'pointer' : 'not-allowed',
                  fontSize: '15px',
                  fontWeight: 600
                }}
              >
                {!isConnected ? '⚠️ Not Connected' : !tokenImagePreview ? 'Upload Image First' : '✨ Add as Token on Table'}
              </button>
              
              {!activeTableId && (
                <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '8px', textAlign: 'center' }}>
                  ⚠️ No active table selected
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
