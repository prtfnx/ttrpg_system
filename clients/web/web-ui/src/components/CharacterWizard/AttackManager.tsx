import React, { useEffect, useState } from 'react';
import './AttackManager.css';
import { DiceRoller } from './DiceRoller';
import type { WizardFormData } from './WizardFormData';

interface AttackManagerProps {
  character: WizardFormData;
  onClose?: () => void;
  onUpdateCharacter?: (character: WizardFormData) => void;
}

interface WeaponData {
  name: string;
  type: 'melee' | 'ranged';
  damage: {
    dice: string;
    type: string;
  };
  properties: string[];
  range?: string;
  attackBonus: number;
  damageBonus: number;
  proficient: boolean;
  finesse?: boolean;
  versatile?: string;
  ammunition?: boolean;
}

interface AttackHistory {
  id: string;
  timestamp: Date;
  weaponName: string;
  attackRoll: {
    total: number;
    rolls: number[];
    modifier: number;
    critical: boolean;
  };
  damageRoll?: {
    total: number;
    rolls: number[];
    modifier: number;
    damageType: string;
  };
  hit: boolean;
  targetAC?: number;
}

export const AttackManager: React.FC<AttackManagerProps> = ({ 
  character, 
  onClose 
}) => {
  const [activeTab, setActiveTab] = useState<'weapons' | 'attacks' | 'history'>('weapons');
  const [weapons, setWeapons] = useState<WeaponData[]>([]);
  const [attackHistory, setAttackHistory] = useState<AttackHistory[]>([]);
  const [selectedWeapon, setSelectedWeapon] = useState<WeaponData | null>(null);
  const [targetAC, setTargetAC] = useState<number>(10);
  const [advantageState, setAdvantageState] = useState<'normal' | 'advantage' | 'disadvantage'>('normal');
  const [showDiceRoller, setShowDiceRoller] = useState<boolean>(false);

  // Initialize weapons from character equipment
  useEffect(() => {
    // Guard: Don't process if character is not provided
    if (!character) {
      console.warn('[AttackManager] Character is undefined, skipping weapon initialization');
      return;
    }
    
    if (character.equipment?.items) {
      const weaponItems = character.equipment.items.filter(item =>
        item.equipment.name.toLowerCase().includes('sword') ||
        item.equipment.name.toLowerCase().includes('bow') ||
        item.equipment.name.toLowerCase().includes('dagger') ||
        item.equipment.name.toLowerCase().includes('weapon') ||
        item.equipment.name.toLowerCase().includes('axe') ||
        item.equipment.name.toLowerCase().includes('spear') ||
        item.equipment.name.toLowerCase().includes('mace') ||
        item.equipment.name.toLowerCase().includes('hammer')
      );

      const weaponData: WeaponData[] = weaponItems.map(item => {
        const weaponName = item.equipment.name;
        return parseWeapon(weaponName, character);
      });

      // Add unarmed strike if no weapons
      if (weaponData.length === 0) {
        weaponData.push({
          name: 'Unarmed Strike',
          type: 'melee',
          damage: { dice: '1', type: 'bludgeoning' },
          properties: [],
          attackBonus: getProficiencyBonus(character.advancement?.currentLevel || 1) + getAbilityModifier(character.strength),
          damageBonus: getAbilityModifier(character.strength),
          proficient: true
        });
      }

      setWeapons(weaponData);
      if (weaponData.length > 0 && !selectedWeapon) {
        setSelectedWeapon(weaponData[0]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character]); // Simplified dependency - just watch the whole character object

  const getAbilityModifier = (abilityScore: number): number => {
    return Math.floor((abilityScore - 10) / 2);
  };

  const getProficiencyBonus = (level: number): number => {
    return Math.ceil(level / 4) + 1;
  };

  const parseWeapon = (weaponName: string, char: WizardFormData): WeaponData => {
    const name = weaponName.toLowerCase();
    const level = char.advancement?.currentLevel || 1;
    const profBonus = getProficiencyBonus(level);
    
    let type: 'melee' | 'ranged' = 'melee';
    let damage = { dice: '1d8', type: 'bludgeoning' };
    let properties: string[] = [];
    let range: string | undefined;
    let finesse = false;
    let versatile: string | undefined;
    let ammunition = false;

    // Determine weapon type and properties
    if (name.includes('bow') || name.includes('crossbow') || name.includes('dart') || name.includes('javelin')) {
      type = 'ranged';
    }

    // Set damage and properties based on weapon type
    if (name.includes('dagger')) {
      damage = { dice: '1d4', type: 'piercing' };
      properties = ['Finesse', 'Light', 'Thrown'];
      finesse = true;
    } else if (name.includes('shortsword')) {
      damage = { dice: '1d6', type: 'piercing' };
      properties = ['Finesse', 'Light'];
      finesse = true;
    } else if (name.includes('rapier')) {
      damage = { dice: '1d8', type: 'piercing' };
      properties = ['Finesse'];
      finesse = true;
    } else if (name.includes('longsword')) {
      damage = { dice: '1d8', type: 'slashing' };
      properties = ['Versatile'];
      versatile = '1d10';
    } else if (name.includes('greatsword')) {
      damage = { dice: '2d6', type: 'slashing' };
      properties = ['Heavy', 'Two-handed'];
    } else if (name.includes('shortbow')) {
      damage = { dice: '1d6', type: 'piercing' };
      properties = ['Ammunition', 'Two-handed'];
      range = '80/320';
      type = 'ranged';
      ammunition = true;
    } else if (name.includes('longbow')) {
      damage = { dice: '1d8', type: 'piercing' };
      properties = ['Ammunition', 'Heavy', 'Two-handed'];
      range = '150/600';
      type = 'ranged';
      ammunition = true;
    } else if (name.includes('crossbow')) {
      damage = { dice: '1d8', type: 'piercing' };
      properties = ['Ammunition', 'Loading', 'Two-handed'];
      range = '100/400';
      type = 'ranged';
      ammunition = true;
    }

    // Calculate attack and damage bonuses
    let attackBonus = profBonus;
    let damageBonus = 0;

    if (type === 'ranged' || (finesse && char.dexterity > char.strength)) {
      attackBonus += getAbilityModifier(char.dexterity);
      damageBonus = getAbilityModifier(char.dexterity);
    } else {
      attackBonus += getAbilityModifier(char.strength);
      damageBonus = getAbilityModifier(char.strength);
    }

    return {
      name: weaponName,
      type,
      damage,
      properties,
      range,
      attackBonus,
      damageBonus,
      proficient: true,
      finesse,
      versatile,
      ammunition
    };
  };

  const rollAttack = (weapon: WeaponData, targetAC: number) => {
    // Roll 1d20 for attack
    const attackRoll = Math.floor(Math.random() * 20) + 1;
    const rolls = [attackRoll];
    
    // Handle advantage/disadvantage
    if (advantageState !== 'normal') {
      const secondRoll = Math.floor(Math.random() * 20) + 1;
      rolls.push(secondRoll);
    }

    let finalRoll = attackRoll;
    if (advantageState === 'advantage') {
      finalRoll = Math.max(...rolls);
    } else if (advantageState === 'disadvantage') {
      finalRoll = Math.min(...rolls);
    }

    const critical = finalRoll === 20;
    const total = finalRoll + weapon.attackBonus;
    const hit = critical || total >= targetAC;

    let damageRoll: AttackHistory['damageRoll'] | undefined;

    if (hit) {
      // Roll damage
      const baseDice = weapon.damage.dice;
      let diceCount = 1;
      let diceSize = 8;
      
      const diceMatch = baseDice.match(/(\d+)d(\d+)/);
      if (diceMatch) {
        diceCount = parseInt(diceMatch[1]);
        diceSize = parseInt(diceMatch[2]);
      }

      // Double dice on critical hit
      if (critical) {
        diceCount *= 2;
      }

      const damageRolls: number[] = [];
      for (let i = 0; i < diceCount; i++) {
        damageRolls.push(Math.floor(Math.random() * diceSize) + 1);
      }

      const damageTotal = damageRolls.reduce((sum, roll) => sum + roll, 0) + weapon.damageBonus;

      damageRoll = {
        total: damageTotal,
        rolls: damageRolls,
        modifier: weapon.damageBonus,
        damageType: weapon.damage.type
      };
    }

    const attackRecord: AttackHistory = {
      id: Date.now().toString(),
      timestamp: new Date(),
      weaponName: weapon.name,
      attackRoll: {
        total,
        rolls,
        modifier: weapon.attackBonus,
        critical
      },
      damageRoll,
      hit,
      targetAC
    };

    setAttackHistory(prev => [attackRecord, ...prev.slice(0, 19)]); // Keep last 20 attacks
    return attackRecord;
  };

  const clearHistory = () => {
    setAttackHistory([]);
  };

  const renderWeaponsTab = () => (
    <div className="weapons-tab">
      <div className="weapons-header">
        <h3>Available Weapons</h3>
        <div className="weapon-count">{weapons.length} weapon{weapons.length !== 1 ? 's' : ''}</div>
      </div>

      <div className="weapons-list">
        {weapons.map((weapon, index) => (
          <div 
            key={index} 
            className={`weapon-card ${selectedWeapon?.name === weapon.name ? 'selected' : ''}`}
            onClick={() => setSelectedWeapon(weapon)}
          >
            <div className="weapon-header">
              <h4>{weapon.name}</h4>
              <div className={`weapon-type ${weapon.type}`}>
                {weapon.type.charAt(0).toUpperCase() + weapon.type.slice(1)}
              </div>
            </div>
            
            <div className="weapon-stats">
              <div className="weapon-stat">
                <span className="stat-label">Attack:</span>
                <span className="stat-value">+{weapon.attackBonus}</span>
              </div>
              <div className="weapon-stat">
                <span className="stat-label">Damage:</span>
                <span className="stat-value">
                  {weapon.damage.dice}+{weapon.damageBonus} {weapon.damage.type}
                </span>
              </div>
              {weapon.range && (
                <div className="weapon-stat">
                  <span className="stat-label">Range:</span>
                  <span className="stat-value">{weapon.range} ft</span>
                </div>
              )}
            </div>

            {weapon.properties.length > 0 && (
              <div className="weapon-properties">
                {weapon.properties.map((prop, i) => (
                  <span key={i} className="property-tag">{prop}</span>
                ))}
              </div>
            )}

            {weapon.versatile && (
              <div className="versatile-damage">
                <span className="stat-label">Versatile:</span>
                <span className="stat-value">{weapon.versatile}+{weapon.damageBonus}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {weapons.length === 0 && (
        <div className="no-weapons">
          No weapons found. Add weapons to your equipment to see them here.
        </div>
      )}
    </div>
  );

  const renderAttacksTab = () => (
    <div className="attacks-tab">
      <div className="attack-controls">
        <h3>Make Attack</h3>
        
        <div className="attack-settings">
          <div className="weapon-selector">
            <label htmlFor="weapon-select">Weapon:</label>
            <select 
              id="weapon-select"
              value={selectedWeapon?.name || ''}
              onChange={(e) => {
                const weapon = weapons.find(w => w.name === e.target.value);
                setSelectedWeapon(weapon || null);
              }}
            >
              {weapons.map((weapon, index) => (
                <option key={index} value={weapon.name}>
                  {weapon.name}
                </option>
              ))}
            </select>
          </div>

          <div className="target-ac">
            <label htmlFor="target-ac">Target AC:</label>
            <input 
              id="target-ac"
              type="number" 
              value={targetAC} 
              onChange={(e) => setTargetAC(parseInt(e.target.value) || 10)}
              min="1"
              max="30"
            />
          </div>

          <div className="advantage-selector">
            <label htmlFor="advantage">Roll Type:</label>
            <select 
              id="advantage"
              value={advantageState} 
              onChange={(e) => setAdvantageState(e.target.value as any)}
            >
              <option value="normal">Normal</option>
              <option value="advantage">Advantage</option>
              <option value="disadvantage">Disadvantage</option>
            </select>
          </div>
        </div>
      </div>

      {selectedWeapon && (
        <div className="selected-weapon-display">
          <div className="weapon-info">
            <h4>{selectedWeapon.name}</h4>
            <div className="weapon-details">
              <div>Attack Bonus: +{selectedWeapon.attackBonus}</div>
              <div>Damage: {selectedWeapon.damage.dice}+{selectedWeapon.damageBonus} {selectedWeapon.damage.type}</div>
              {selectedWeapon.range && <div>Range: {selectedWeapon.range} ft</div>}
            </div>
          </div>

          <div className="attack-actions">
            <button 
              className="attack-btn"
              onClick={() => rollAttack(selectedWeapon, targetAC)}
            >
              Roll Attack
            </button>
            
            <button 
              className="dice-roller-btn"
              onClick={() => setShowDiceRoller(!showDiceRoller)}
            >
              Open Dice Roller
            </button>
          </div>
        </div>
      )}

      {showDiceRoller && (
        <div className="dice-roller-container">
          <DiceRoller />
        </div>
      )}

      {!selectedWeapon && weapons.length > 0 && (
        <div className="no-weapon-selected">
          Select a weapon to make attacks.
        </div>
      )}
    </div>
  );

  const renderHistoryTab = () => (
    <div className="history-tab">
      <div className="history-header">
        <h3>Attack History</h3>
        <div className="history-actions">
          <span className="history-count">{attackHistory.length} attack{attackHistory.length !== 1 ? 's' : ''}</span>
          <button className="clear-history-btn" onClick={clearHistory}>
            Clear History
          </button>
        </div>
      </div>

      <div className="history-list">
        {attackHistory.map((attack) => (
          <div key={attack.id} className={`attack-record ${attack.hit ? 'hit' : 'miss'}`}>
            <div className="attack-summary">
              <div className="attack-weapon">{attack.weaponName}</div>
              <div className="attack-time">
                {attack.timestamp.toLocaleTimeString()}
              </div>
              <div className={`attack-result ${attack.hit ? 'hit' : 'miss'}`}>
                {attack.hit ? 'HIT' : 'MISS'}
              </div>
            </div>
            
            <div className="attack-details">
              <div className="attack-roll">
                <span className="roll-label">Attack:</span>
                <span className={`roll-value ${attack.attackRoll.critical ? 'critical' : ''}`}>
                  {attack.attackRoll.rolls.join(', ')} + {attack.attackRoll.modifier} = {attack.attackRoll.total}
                  {attack.attackRoll.critical && ' (CRIT!)'}
                </span>
                <span className="vs-ac">vs AC {attack.targetAC}</span>
              </div>
              
              {attack.damageRoll && (
                <div className="damage-roll">
                  <span className="roll-label">Damage:</span>
                  <span className="roll-value">
                    {attack.damageRoll.rolls.join(', ')} + {attack.damageRoll.modifier} = {attack.damageRoll.total} {attack.damageRoll.damageType}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {attackHistory.length === 0 && (
        <div className="no-history">
          No attacks recorded yet. Make some attacks to see them here!
        </div>
      )}
    </div>
  );

  return (
    <div className="attack-manager">
      {/* Header */}
      <div className="manager-header">
        <div className="manager-title">
          <h2>Attack Manager</h2>
          <div className="character-info">
            {character.name} - {character.class} Level {character.advancement?.currentLevel || 1}
          </div>
        </div>
        {onClose && (
          <button className="close-manager" onClick={onClose}>
            <span>×</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="manager-tabs">
        <button 
          className={`tab-button ${activeTab === 'weapons' ? 'active' : ''}`}
          onClick={() => setActiveTab('weapons')}
        >
          Weapons
        </button>
        <button 
          className={`tab-button ${activeTab === 'attacks' ? 'active' : ''}`}
          onClick={() => setActiveTab('attacks')}
        >
          Attack
        </button>
        <button 
          className={`tab-button ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          History ({attackHistory.length})
        </button>
      </div>

      {/* Content */}
      <div className="manager-content">
        {activeTab === 'weapons' && renderWeaponsTab()}
        {activeTab === 'attacks' && renderAttacksTab()}
        {activeTab === 'history' && renderHistoryTab()}
      </div>
    </div>
  );
};