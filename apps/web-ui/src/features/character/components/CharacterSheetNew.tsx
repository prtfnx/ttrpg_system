import { ProtocolService, useProtocol } from '@lib/api';
import { showToast } from '@shared/utils';
import clsx from "clsx";
import { Check, CircleUser, Dices, Footprints, Shield, X, Zap } from "lucide-react";
import React, { useRef, useState } from "react";
import { useGameStore } from "../../../store";
import type { Character } from "../../../types";
import { ActivityTab } from './ActivityTab';
import styles from "./CharacterSheetNew.module.css";
import { InventoryTab } from './InventoryTab';
import { SpellsTab } from './SpellsTab';


const ABILITY_SHORT: Record<string, string> = {
  str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA',
};

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
  const [activeTab, setActiveTab] = useState<'core' | 'spells' | 'inventory' | 'bio' | 'activity'>('core');
  const [selectedTokenSpriteId, setSelectedTokenSpriteId] = useState<string>('');
  const [tokenImagePreview, setTokenImagePreview] = useState<string>('');
  const [hpAmount, setHpAmount] = useState<number>(0);
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

  const getModifier = (score: number) => Math.floor((score - 10) / 2);
  const modStr = (mod: number) => mod >= 0 ? `+${mod}` : `${mod}`;
  const hpPct = Math.min(1, (stats.hp || 0) / Math.max(1, stats.maxHp || 10));
  const hpBarColor = hpPct > 0.5 ? 'var(--green-600)' : hpPct > 0.25 ? '#eab308' : 'var(--red-600, #dc2626)';

  const handleHPChange = (delta: number) => {
    const currentTempHp = stats.tempHp || 0;
    let remaining = delta;
    let newTempHp = currentTempHp;
    if (delta < 0 && currentTempHp > 0) {
      const absorbed = Math.min(currentTempHp, -delta);
      newTempHp = currentTempHp - absorbed;
      remaining = delta + absorbed;
    }
    const newHP = Math.max(0, Math.min((stats.hp || 0) + remaining, stats.maxHp || 10));
    // Reset death saves when healed from 0
    const deathSaves = newHP > 0 ? { successes: 0, failures: 0 } : (stats.deathSaves || { successes: 0, failures: 0 });
    onSave({ data: { ...data, stats: { ...stats, hp: newHP, tempHp: newTempHp, deathSaves } } });
  };

  const handleDeathSave = (type: 'successes' | 'failures', index: number) => {
    const current = stats.deathSaves || { successes: 0, failures: 0 };
    const val = current[type];
    // Toggle: clicking checked box unchecks it, clicking unchecked checks it
    const toggled = index < val ? index : index + 1;
    onSave({ data: { ...data, stats: { ...stats, deathSaves: { ...current, [type]: toggled } } } });
  };

  const handleTempHpChange = (value: number) => {
    onSave({ data: { ...data, stats: { ...stats, tempHp: Math.max(0, value) } } });
  };

  const handleSkillRoll = (skillName: string, modifier: number) => {
    if (isConnected && ProtocolService.hasProtocol() && character) {
      ProtocolService.getProtocol().rollSkill(character.id, skillName, modifier);
      showToast.success(`Rolling ${skillName}…`);
    }
  };

  const handleAbilitySaveRoll = (ability: string, modifier: number) => {
    if (isConnected && ProtocolService.hasProtocol() && character) {
      ProtocolService.getProtocol().rollAbilitySave(character.id, ability, modifier);
      showToast.success(`Rolling ${ABILITY_SHORT[ability]} save…`);
    }
  };

  const handleAbilityCheckRoll = (ability: string, modifier: number) => {
    if (isConnected && ProtocolService.hasProtocol() && character) {
      ProtocolService.getProtocol().rollAbilityCheck(character.id, ability, modifier);
      showToast.success(`Rolling ${ABILITY_SHORT[ability]} check…`);
    }
  };

  const handleAttackRoll = (attackType: string, modifier: number) => {
    if (isConnected && ProtocolService.hasProtocol() && character) {
      ProtocolService.getProtocol().rollAttack(character.id, attackType, modifier);
      showToast.success(`Rolling ${attackType} attack…`);
    }
  };

  const handleDeathSaveRoll = () => {
    if (isConnected && ProtocolService.hasProtocol() && character) {
      ProtocolService.getProtocol().rollDeathSave(character.id);
      showToast.info('Rolling death save…');
    }
  };

  const handleLongRest = () => {
    if (!character) return;
    const totalHitDice = data.level || 1;
    const usedHitDice = data.hitDiceUsed || 0;
    const recoveredDice = Math.max(1, Math.floor(totalHitDice / 2));
    const newUsedHitDice = Math.max(0, usedHitDice - recoveredDice);
    onSave({
      data: {
        ...data,
        stats: { ...stats, hp: stats.maxHp || 10, deathSaves: { successes: 0, failures: 0 } },
        spellSlotsUsed: {},
        hitDiceUsed: newUsedHitDice,
      }
    });
    showToast.success('Long Rest — HP and spell slots restored');
  };

  const handleShortRest = () => {
    showToast.info('Short Rest — use Hit Dice roll to recover HP');
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

    try {
      ProtocolService.getProtocol().createSprite(spriteData);
      showToast.success(`Token created for ${character.name}`);
      setTokenImagePreview('');
      if (imageInputRef.current) {
        imageInputRef.current.value = '';
      }
    } catch (error) {
      showToast.error('Failed to create token');
    }
  };

  const linkedTokens = getSpritesForCharacter(character.id);
  const availableSprites = sprites.filter(s => s.tableId === activeTableId && !s.characterId);

  return (
    <div className={styles.characterSheetRedesigned}>
      {/* Header */}
      <div className={styles.sheetHeader}>
        <div className={styles.headerLeft}>
          <h1 className={styles.charName}>{character.name}</h1>
          <div className={styles.charSubtitle}>
            <span>{data.class || 'Class'}</span>
            <span className={styles.charDivider}>&middot;</span>
            <span>Level {data.level || 1}</span>
            <span className={styles.charDivider}>&middot;</span>
            <span>{data.race || 'Race'}</span>
          </div>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.profBonusDisplay}>
            <div className={styles.profLabel}>Proficiency</div>
            <div className={styles.profValue}>+{profBonus}</div>
          </div>
        </div>
      </div>

      {/* Main layout: sidebar + content */}
      <div className={styles.sheetLayout}>
        {/* Left sidebar — always visible */}
        <aside className={styles.sidebar}>
          <div className={styles.abilitiesColumn}>
            {Object.entries(abilities).map(([key, rawVal]) => {
              const score = Number(rawVal);
              const mod = getModifier(score);
              const isProfSave = savingThrows[key as keyof typeof savingThrows];
              const saveBonus = mod + (isProfSave ? profBonus : 0);
              return (
                <div key={key} className={styles.abilityBlock}>
                  <div className={styles.abilityLabel}>{ABILITY_SHORT[key]}</div>
                  <button
                    type="button"
                    className={styles.abilityMod}
                    onClick={() => handleAbilityCheckRoll(key, mod)}
                    title={`Roll ${ABILITY_SHORT[key]} check`}
                  >
                    {modStr(mod)}
                  </button>
                  <input
                    type="number"
                    className={styles.abilityScore}
                    value={score}
                    onChange={e => handleAbilityUpdate(key, Number(e.target.value))}
                    min={1} max={30}
                  />
                  <div className={styles.abilitySaveRow}>
                    <span
                      className={clsx(styles.saveDot, isProfSave && styles.saveProficient)}
                      title="Toggle saving throw proficiency"
                      onClick={() => onSave({ data: { ...data, savingThrows: { ...savingThrows, [key]: !isProfSave } } })}
                    />
                    <button
                      type="button"
                      className={styles.saveBonus}
                      onClick={() => handleAbilitySaveRoll(key, saveBonus)}
                      title={`Roll ${ABILITY_SHORT[key]} saving throw`}
                    >
                      {modStr(saveBonus)}
                    </button>
                    <span className={styles.saveLabel}>Save</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className={styles.sidebarExtras}>
            <div className={styles.passiveRow}>
              <span className={styles.passiveLabel}>Passive Perception</span>
              <strong className={styles.passiveValue}>
                {10 + getModifier(abilities.wis) + (skills['Perception'] ? profBonus : 0)}
              </strong>
            </div>
            <label className={styles.inspirationRow}>
              <input
                type="checkbox"
                checked={data.inspiration || false}
                onChange={e => onSave({ data: { ...data, inspiration: e.target.checked } })}
              />
              <span>Inspiration</span>
            </label>
          </div>
        </aside>

        {/* Right main area */}
        <div className={styles.mainArea}>
          {/* Tabs */}
          <div className={styles.sheetTabs}>
            {(['core', 'spells', 'inventory', 'bio', 'activity'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                className={clsx(styles.sheetTab, activeTab === tab && styles.active)}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'core' ? 'Core' : tab === 'spells' ? 'Spells' : tab === 'inventory' ? 'Inventory' : tab === 'bio' ? 'Notes' : 'Activity'}
              </button>
            ))}
          </div>

          <div className={styles.sheetBody}>
            {activeTab === 'core' && (
              <div className={styles.coreLayout}>
                {/* Combat row */}
                <div className={styles.combatRow}>
                  <div className={styles.combatStat}>
                    <div className={styles.combatIcon}>рџ›Ў</div>
                    <input type="number" className={styles.combatInput} value={stats.ac || 10}
                      onChange={e => handleStatUpdate('ac', Number(e.target.value))} />
                    <div className={styles.combatLabel}>Armor Class</div>
                  </div>
                  <div className={styles.combatStat}>
                    <div className={styles.combatIcon}>вљЎ</div>
                    <div className={styles.combatValue}>{modStr(getModifier(abilities.dex))}</div>
                    <div className={styles.combatLabel}>Initiative</div>
                  </div>
                  <div className={styles.combatStat}>
                    <div className={styles.combatIcon}>рџЏѓ</div>
                    <input type="number" className={styles.combatInput} value={stats.speed || 30}
                      onChange={e => handleStatUpdate('speed', Number(e.target.value))} />
                    <div className={styles.combatLabel}>Speed (ft)</div>
                  </div>
                  <div className={styles.combatStat}>
                    <div className={styles.combatIcon}>рџЋІ</div>
                    <div className={styles.combatValue}>{data.level || 1}d{data.hitDie || 8}</div>
                    <button type="button" className={styles.hitDieBtn}
                      onClick={() => handleHPChange(Math.floor(Math.random() * (data.hitDie || 8)) + 1 + getModifier(abilities.con))}>
                      Roll
                    </button>
                    <div className={styles.combatLabel}>Hit Dice</div>
                  </div>
                </div>

                {/* HP block */}
                <div className={styles.hpBlock}>
                  <div className={styles.hpBarWrap}>
                    <div className={styles.hpBarFill} style={{ width: `${hpPct * 100}%`, background: hpBarColor }} />
                  </div>
                  <div className={styles.hpNums}>
                    <input type="number" className={styles.hpCurrent} value={stats.hp || 0}
                      onChange={e => handleStatUpdate('hp', Number(e.target.value))} min={0} max={stats.maxHp || 999} />
                    <span className={styles.hpSlash}>/</span>
                    <input type="number" className={styles.hpMax} value={stats.maxHp || 10}
                      onChange={e => handleStatUpdate('maxHp', Number(e.target.value))} min={1} />
                    {(stats.tempHp || 0) > 0 && (
                      <span className={styles.tempHpBadge}>+{stats.tempHp} tmp</span>
                    )}
                  </div>
                  <div className={styles.hpControls}>
                    <input type="number" className={styles.hpAmountInput} value={hpAmount} min={0}
                      onChange={e => setHpAmount(Math.max(0, Number(e.target.value)))} placeholder="Amt" />
                    <button type="button" className={styles.damageBtn}
                      onClick={() => { handleHPChange(-hpAmount); setHpAmount(0); }} disabled={hpAmount === 0}>Damage</button>
                    <button type="button" className={styles.healBtn}
                      onClick={() => { handleHPChange(hpAmount); setHpAmount(0); }} disabled={hpAmount === 0}>Heal</button>
                    <label className={styles.tempHpLabel}>
                      Temp:
                      <input type="number" value={stats.tempHp || 0} min={0}
                        onChange={e => handleTempHpChange(Number(e.target.value))} />
                    </label>
                  </div>
                </div>

                {/* Death saves вЂ” only at 0 HP */}
                {/* Death saves — only at 0 HP */}
                {(stats.hp || 0) === 0 && (
                  <div className={styles.deathSavesBlock}>
                    <span className={styles.deathTitle}>Death Saves</span>
                    <div className={styles.deathRow}>
                      <span className={styles.deathLabel}><Check size={14} aria-hidden /></span>
                      {[0, 1, 2].map(i => (
                        <span key={i} className={clsx(styles.deathPip, i < (stats.deathSaves?.successes || 0) && styles.deathSuccess)} />
                      ))}
                    </div>
                    <div className={styles.deathRow}>
                      <span className={clsx(styles.deathLabel, styles.deathFailLabel)}><X size={14} aria-hidden /></span>
                      {[0, 1, 2].map(i => (
                        <span key={i} className={clsx(styles.deathPip, i < (stats.deathSaves?.failures || 0) && styles.deathFailure)} />
                      ))}
                    </div>
                    <button type="button" className={styles.deathRollBtn} onClick={handleDeathSaveRoll}>
                      Roll Death Save
                    </button>
                  </div>
                )}

                {/* Rest Actions */}
                <div className={styles.restActionsBlock}>
                  <button type="button" className={styles.shortRestBtn} onClick={handleShortRest}>Short Rest</button>
                  <button type="button" className={styles.longRestBtn} onClick={handleLongRest}>Long Rest</button>
                </div>

                {/* Conditions */}
                {data.conditions && data.conditions.length > 0 && (
                  <div className={styles.conditionsRow}>
                    {data.conditions.map((c: string) => (
                      <span key={c} className={styles.conditionBadge}>{c}</span>
                    ))}
                  </div>
                )}

                {/* Skills 2-column */}
                <div className={styles.skillsSection}>
                  <div className={styles.skillsTitle}>Skills</div>
                  <div className={styles.skillsGrid}>
                    {SKILLS.map(skill => {
                      const mod = getModifier(abilities[skill.ability as keyof typeof abilities]);
                      const isProficient = skills[skill.name] || false;
                      const bonus = mod + (isProficient ? profBonus : 0);
                      return (
                        <div key={skill.name} className={styles.skillRow}>
                          <span
                            className={clsx(styles.profDot, isProficient && styles.proficient)}
                            onClick={() => onSave({ data: { ...data, skills: { ...skills, [skill.name]: !isProficient } } })}
                          />
                          <button type="button" className={styles.skillRollBtn}
                            onClick={() => handleSkillRoll(skill.name, bonus)}
                            title={`Roll ${skill.name}`}>
                            {modStr(bonus)}
                          </button>
                          <span className={styles.skillName}>{skill.name}</span>
                          <span className={styles.skillAbility}>{ABILITY_SHORT[skill.ability].slice(0, 3)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Attacks summary */}
                <div className={styles.attacksBlock}>
                  <div className={styles.attacksTitle}>Attacks</div>
                  <button type="button" className={styles.attackRollBtn}
                    onClick={() => handleAttackRoll('melee', getModifier(abilities.str) + profBonus)}>
                    <span>Melee</span>
                    <span className={styles.attackBonus}>{modStr(getModifier(abilities.str) + profBonus)}</span>
                  </button>
                  <button type="button" className={styles.attackRollBtn}
                    onClick={() => handleAttackRoll('ranged', getModifier(abilities.dex) + profBonus)}>
                    <span>Ranged</span>
                    <span className={styles.attackBonus}>{modStr(getModifier(abilities.dex) + profBonus)}</span>
                  </button>
                  <div className={styles.attackRow}>
                    <span>Spell DC</span>
                    <span>{8 + profBonus + Math.max(getModifier(abilities.wis), getModifier(abilities.int), getModifier(abilities.cha))}</span>
                  </div>
                </div>

                {/* Features */}
                {data.features && data.features.length > 0 && (
                  <div className={styles.featuresBlock}>
                    <div className={styles.featuresTitle}>Features & Traits</div>
                    {data.features.map((f: string, i: number) => (
                      <div key={i} className={styles.featureItem}>{f}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'spells' && (
              <SpellsTab data={data} onSave={newData => onSave({ data: newData })} />
            )}

            {activeTab === 'inventory' && (
              <InventoryTab data={data} onSave={newData => onSave({ data: newData })} />
            )}

            {activeTab === 'bio' && (
              <div className={styles.bioTabContent}>
                <div className={styles.bioSection}>
                  <h4>Biography</h4>
                  <textarea
                    value={character.data?.bio || ''}
                    onChange={e => onSave({ data: { ...data, bio: e.target.value } })}
                    placeholder="Backstory, personality, goals…"
                    rows={6}
                    className={styles.bioTextarea}
                  />
                </div>

                <div className={styles.linkedTokensSection}>
                  <h4>Linked Tokens</h4>
                  {linkedTokens.length > 0 ? (
                    <div className={styles.tokenList}>
                      {linkedTokens.map(token => (
                        <div key={token.id} className={styles.tokenBadge}>
                          <CircleUser size={14} aria-hidden />
                          <span>{token.name || token.id.substring(0, 8)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className={styles.noTokens}>No tokens linked</p>
                  )}
                </div>

                <div className={styles.linkTokenSection}>
                  <h4>Link Existing Token</h4>
                  <div className={styles.linkTokenRow}>
                    <select value={selectedTokenSpriteId} onChange={e => setSelectedTokenSpriteId(e.target.value)} className={styles.tokenSelect}>
                      <option value="">-- Select a token --</option>
                      {availableSprites.map(sprite => (
                        <option key={sprite.id} value={sprite.id}>
                          {sprite.name || `Token ${sprite.id.substring(0, 8)}`}
                        </option>
                      ))}
                    </select>
                    <button onClick={handleLinkExistingToken} disabled={!selectedTokenSpriteId} className={styles.linkBtn}>Link</button>
                  </div>
                </div>

                <div className={styles.createTokenSection}>
                  <h4>Create Token from Image</h4>
                  <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageChange} className={styles.tokenImageInput} />
                  {tokenImagePreview && (
                    <div className={styles.imagePreview}>
                      <img src={tokenImagePreview} alt="Token preview" className={styles.previewImg} />
                    </div>
                  )}
                  <button
                    onClick={handleCreateTokenFromImage}
                    disabled={!tokenImagePreview || !isConnected}
                    className={clsx(styles.createTokenBtn, tokenImagePreview && isConnected && styles.ready)}
                  >
                    {!isConnected ? 'Not Connected' : !tokenImagePreview ? 'Upload Image First' : 'Add Token to Table'}
                  </button>
                  {!activeTableId && <p className={styles.noTableWarning}>No active table</p>}
                </div>
              </div>
            )}

            {activeTab === 'activity' && (
              <ActivityTab characterId={character.id} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
