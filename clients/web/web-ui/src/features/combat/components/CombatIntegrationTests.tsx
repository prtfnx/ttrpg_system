import type { WizardFormData } from '@features/character';
import { CombatLauncher } from '@features/character';
import React, { useState } from 'react';
import styles from './CombatIntegrationTests.module.css';

// Test characters with comprehensive data
const testFighter: WizardFormData = {
  name: 'Sir Galahad',
  race: 'Human',
  class: 'Fighter',
  background: 'Knight',
  strength: 18,
  dexterity: 14,
  constitution: 16,
  intelligence: 11,
  wisdom: 12,
  charisma: 13,
  skills: ['Athletics', 'History', 'Intimidation', 'Persuasion'],
  spells: {
    cantrips: [],
    knownSpells: [],
    preparedSpells: []
  },
  bio: 'A noble knight dedicated to justice and honor.',
  equipment: {
    items: [
      {
        equipment: {
          name: 'Greatsword',
          weight: 6,
          cost: { amount: 50, unit: 'gp' }
        },
        quantity: 1,
        equipped: true
      },
      {
        equipment: {
          name: 'Plate Armor',
          weight: 65,
          cost: { amount: 1500, unit: 'gp' }
        },
        quantity: 1,
        equipped: true
      },
      {
        equipment: {
          name: 'Shield',
          weight: 6,
          cost: { amount: 10, unit: 'gp' }
        },
        quantity: 1,
        equipped: false
      },
      {
        equipment: {
          name: 'Healing Potion',
          weight: 0.5,
          cost: { amount: 50, unit: 'gp' }
        },
        quantity: 3
      }
    ],
    currency: { cp: 0, sp: 0, ep: 0, gp: 127, pp: 2 },
    carrying_capacity: {
      current_weight: 78.5,
      max_weight: 270,
      encumbered_at: 180,
      heavily_encumbered_at: 220
    }
  },
  advancement: {
    experiencePoints: 6500,
    currentLevel: 5,
    levelHistory: [
      {
        level: 1,
        className: 'Fighter',
        hitPointIncrease: 10,
        featuresGained: ['Fighting Style: Great Weapon Fighting', 'Second Wind']
      },
      {
        level: 2,
        className: 'Fighter', 
        hitPointIncrease: 7,
        featuresGained: ['Action Surge']
      },
      {
        level: 3,
        className: 'Fighter',
        hitPointIncrease: 6,
        featuresGained: ['Martial Archetype: Champion', 'Improved Critical']
      },
      {
        level: 4,
        className: 'Fighter',
        hitPointIncrease: 8,
        abilityScoreImprovements: [{ ability: 'Strength', increase: 2 }],
        featuresGained: ['Ability Score Improvement']
      },
      {
        level: 5,
        className: 'Fighter',
        hitPointIncrease: 6,
        featuresGained: ['Extra Attack']
      }
    ]
  }
};

const testWizard: WizardFormData = {
  name: 'Eldara Moonwhisper',
  race: 'Elf',
  class: 'Wizard',
  background: 'Sage',
  strength: 8,
  dexterity: 14,
  constitution: 13,
  intelligence: 17,
  wisdom: 15,
  charisma: 12,
  skills: ['Arcana', 'History', 'Insight', 'Investigation'],
  spells: {
    cantrips: ['Mage Hand', 'Prestidigitation', 'Light', 'Minor Illusion'],
    knownSpells: [
      'Magic Missile', 'Shield', 'Sleep', 'Burning Hands',
      'Detect Magic', 'Identify', 'Comprehend Languages',
      'Misty Step', 'Scorching Ray', 'Web', 'Fireball',
      'Counterspell', 'Dispel Magic'
    ],
    preparedSpells: [
      'Magic Missile', 'Shield', 'Misty Step', 'Fireball',
      'Counterspell', 'Detect Magic'
    ]
  },
  bio: 'A scholarly wizard who has dedicated her long life to understanding the mysteries of magic.',
  equipment: {
    items: [
      {
        equipment: {
          name: 'Quarterstaff',
          weight: 4,
          cost: { amount: 2, unit: 'sp' }
        },
        quantity: 1,
        equipped: true
      },
      {
        equipment: {
          name: 'Spellbook',
          weight: 3,
          cost: { amount: 50, unit: 'gp' }
        },
        quantity: 1
      },
      {
        equipment: {
          name: 'Component Pouch',
          weight: 2,
          cost: { amount: 25, unit: 'gp' }
        },
        quantity: 1,
        equipped: true
      },
      {
        equipment: {
          name: 'Robes',
          weight: 4,
          cost: { amount: 1, unit: 'gp' }
        },
        quantity: 1,
        equipped: true
      }
    ],
    currency: { cp: 0, sp: 0, ep: 0, gp: 183, pp: 0 },
    carrying_capacity: {
      current_weight: 13,
      max_weight: 120,
      encumbered_at: 80,
      heavily_encumbered_at: 100
    }
  },
  advancement: {
    experiencePoints: 2700,
    currentLevel: 3,
    levelHistory: [
      {
        level: 1,
        className: 'Wizard',
        hitPointIncrease: 6,
        featuresGained: ['Spellcasting', 'Arcane Recovery'],
        spellsLearned: ['Magic Missile', 'Shield', 'Sleep', 'Burning Hands', 'Detect Magic', 'Identify']
      },
      {
        level: 2,
        className: 'Wizard',
        hitPointIncrease: 4,
        featuresGained: ['Arcane Tradition: School of Evocation', 'Evocation Savant', 'Sculpt Spells'],
        spellsLearned: ['Misty Step', 'Scorching Ray', 'Web']
      },
      {
        level: 3,
        className: 'Wizard',
        hitPointIncrease: 5,
        featuresGained: [],
        spellsLearned: ['Fireball', 'Counterspell', 'Dispel Magic', 'Comprehend Languages']
      }
    ]
  }
};

const testRogue: WizardFormData = {
  name: 'Shadow Nightblade',
  race: 'Half-elf',
  class: 'Rogue',
  background: 'Criminal',
  strength: 10,
  dexterity: 17,
  constitution: 14,
  intelligence: 13,
  wisdom: 12,
  charisma: 16,
  skills: ['Stealth', 'Sleight of Hand', 'Thieves\' Tools', 'Deception', 'Insight', 'Persuasion'],
  spells: {
    cantrips: [],
    knownSpells: [],
    preparedSpells: []
  },
  bio: 'A skilled infiltrator with a mysterious past and flexible morals.',
  equipment: {
    items: [
      {
        equipment: {
          name: 'Shortsword',
          weight: 2,
          cost: { amount: 10, unit: 'gp' }
        },
        quantity: 1,
        equipped: true
      },
      {
        equipment: {
          name: 'Dagger',
          weight: 1,
          cost: { amount: 2, unit: 'gp' }
        },
        quantity: 3,
        equipped: true
      },
      {
        equipment: {
          name: 'Leather Armor',
          weight: 10,
          cost: { amount: 10, unit: 'gp' }
        },
        quantity: 1,
        equipped: true
      },
      {
        equipment: {
          name: 'Thieves\' Tools',
          weight: 1,
          cost: { amount: 25, unit: 'gp' }
        },
        quantity: 1
      }
    ],
    currency: { cp: 150, sp: 0, ep: 0, gp: 47, pp: 0 },
    carrying_capacity: {
      current_weight: 17,
      max_weight: 150,
      encumbered_at: 100,
      heavily_encumbered_at: 125
    }
  },
  advancement: {
    experiencePoints: 900,
    currentLevel: 2,
    levelHistory: [
      {
        level: 1,
        className: 'Rogue',
        hitPointIncrease: 8,
        featuresGained: ['Expertise', 'Sneak Attack', 'Thieves\' Cant']
      },
      {
        level: 2,
        className: 'Rogue',
        hitPointIncrease: 6,
        featuresGained: ['Cunning Action']
      }
    ]
  }
};

interface TestResult {
  testName: string;
  status: 'pass' | 'fail' | 'pending';
  details: string;
  component?: string;
}

export const CombatIntegrationTests: React.FC = () => {
  const [activeTest, setActiveTest] = useState<'fighter' | 'wizard' | 'rogue'>('fighter');
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isRunningTests, setIsRunningTests] = useState(false);

  const getCurrentCharacter = () => {
    switch (activeTest) {
      case 'fighter':
        return testFighter;
      case 'wizard':
        return testWizard;
      case 'rogue':
        return testRogue;
      default:
        return testFighter;
    }
  };

  const runComprehensiveTests = async () => {
    setIsRunningTests(true);
    const results: TestResult[] = [];
    
    // Test 1: Character data integrity
    results.push(await testCharacterDataIntegrity());
    
    // Test 2: Equipment integration
    results.push(await testEquipmentIntegration());
    
    // Test 3: Spell system integration
    results.push(await testSpellSystemIntegration());
    
    // Test 4: Combat calculations
    results.push(await testCombatCalculations());
    
    // Test 5: Level progression
    results.push(await testLevelProgression());
    
    // Test 6: Component rendering
    results.push(await testComponentRendering());
    
    setTestResults(results);
    setIsRunningTests(false);
  };

  const testCharacterDataIntegrity = async (): Promise<TestResult> => {
    const character = getCurrentCharacter();
    
    try {
      // Validate required fields
      const requiredFields = ['name', 'race', 'class', 'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
      const missingFields = requiredFields.filter(field => !character[field as keyof WizardFormData]);
      
      if (missingFields.length > 0) {
        return {
          testName: 'Character Data Integrity',
          status: 'fail',
          details: `Missing required fields: ${missingFields.join(', ')}`,
          component: 'CharacterData'
        };
      }

      // Validate ability scores are within D&D range
      const abilityScores = [
        character.strength, character.dexterity, character.constitution,
        character.intelligence, character.wisdom, character.charisma
      ];
      
      const invalidScores = abilityScores.filter(score => score < 3 || score > 20);
      
      if (invalidScores.length > 0) {
        return {
          testName: 'Character Data Integrity',
          status: 'fail',
          details: `Invalid ability scores found (must be 3-20): ${invalidScores.join(', ')}`,
          component: 'CharacterData'
        };
      }

      return {
        testName: 'Character Data Integrity',
        status: 'pass',
        details: `Character ${character.name} has valid data structure and ability scores`,
        component: 'CharacterData'
      };
      
    } catch (error) {
      return {
        testName: 'Character Data Integrity',
        status: 'fail',
        details: `Data integrity test failed: ${error}`,
        component: 'CharacterData'
      };
    }
  };

  const testEquipmentIntegration = async (): Promise<TestResult> => {
    const character = getCurrentCharacter();
    
    try {
      if (!character.equipment) {
        return {
          testName: 'Equipment Integration',
          status: 'fail',
          details: 'No equipment data found',
          component: 'Equipment'
        };
      }

      // Test weight calculations
      const totalWeight = character.equipment.items.reduce(
        (sum, item) => sum + (item.equipment.weight * item.quantity), 0
      );
      
      const recordedWeight = character.equipment.carrying_capacity.current_weight;
      const weightDifference = Math.abs(totalWeight - recordedWeight);
      
      if (weightDifference > 0.1) { // Allow small floating point differences
        return {
          testName: 'Equipment Integration',
          status: 'fail',
          details: `Weight calculation mismatch: calculated ${totalWeight}, recorded ${recordedWeight}`,
          component: 'Equipment'
        };
      }

      // Test equipped items
      const equippedItems = character.equipment.items.filter(item => item.equipped);
      const hasWeaponEquipped = equippedItems.some(item => 
        ['sword', 'dagger', 'staff', 'bow'].some(weapon => 
          item.equipment.name.toLowerCase().includes(weapon)
        )
      );

      return {
        testName: 'Equipment Integration',
        status: 'pass',
        details: `Equipment system working: ${character.equipment.items.length} items, ${equippedItems.length} equipped, weapon equipped: ${hasWeaponEquipped}`,
        component: 'Equipment'
      };
      
    } catch (error) {
      return {
        testName: 'Equipment Integration',
        status: 'fail',
        details: `Equipment integration test failed: ${error}`,
        component: 'Equipment'
      };
    }
  };

  const testSpellSystemIntegration = async (): Promise<TestResult> => {
    const character = getCurrentCharacter();
    
    try {
      if (!character.spells) {
        return {
          testName: 'Spell System Integration',
          status: 'pass',
          details: 'Non-spellcaster character - spell system correctly not present',
          component: 'Spells'
        };
      }

      // For spellcasters, validate spell structure
      const { cantrips, knownSpells, preparedSpells } = character.spells;
      
      // Check that prepared spells are subset of known spells
      const invalidPreparedSpells = preparedSpells?.filter(
        spell => !knownSpells.includes(spell)
      ) || [];
      
      if (invalidPreparedSpells.length > 0) {
        return {
          testName: 'Spell System Integration',
          status: 'fail',
          details: `Invalid prepared spells (not in known spells): ${invalidPreparedSpells.join(', ')}`,
          component: 'Spells'
        };
      }

      // Validate spell progression makes sense for class and level
      const spellcasterClasses = ['wizard', 'sorcerer', 'warlock', 'cleric', 'druid', 'bard'];
      const isSpellcaster = spellcasterClasses.includes(character.class.toLowerCase());
      
      if (isSpellcaster && knownSpells.length === 0 && character.advancement!.currentLevel > 1) {
        return {
          testName: 'Spell System Integration',
          status: 'fail',
          details: `Spellcaster class ${character.class} at level ${character.advancement!.currentLevel} should have known spells`,
          component: 'Spells'
        };
      }

      return {
        testName: 'Spell System Integration',
        status: 'pass',
        details: `Spell system working: ${cantrips.length} cantrips, ${knownSpells.length} known, ${preparedSpells?.length || 0} prepared`,
        component: 'Spells'
      };
      
    } catch (error) {
      return {
        testName: 'Spell System Integration',
        status: 'fail',
        details: `Spell system test failed: ${error}`,
        component: 'Spells'
      };
    }
  };

  const testCombatCalculations = async (): Promise<TestResult> => {
    const character = getCurrentCharacter();
    
    try {
      // Test ability modifiers
      const strengthMod = Math.floor((character.strength - 10) / 2);
      const dexMod = Math.floor((character.dexterity - 10) / 2);
      
      // Test attack bonuses (proficiency bonus calculation)
      const proficiencyBonus = character.advancement?.currentLevel ? Math.ceil(character.advancement.currentLevel / 4) : 0;
      
      // These calculations validate that combat stats can be computed correctly
      const calculationsValid = !isNaN(strengthMod) && !isNaN(dexMod) && !isNaN(proficiencyBonus);
      
      if (!calculationsValid) {
        return {
          testName: 'Combat Calculations',
          status: 'fail',
          details: 'Invalid combat stat calculations',
          component: 'Combat'
        };
      }
      
      // Test HP calculation
      if (character.advancement?.levelHistory) {
        const totalHP = character.advancement.levelHistory.reduce(
          (sum, level) => sum + level.hitPointIncrease, 0
        );
        
        if (totalHP <= 0) {
          return {
            testName: 'Combat Calculations',
            status: 'fail',
            details: 'Invalid HP calculation - total HP is zero or negative',
            component: 'Combat'
          };
        }
      }

      // Test AC calculation (basic - would need more complex logic for actual AC)
      const hasArmorEquipped = character.equipment?.items.some(item => 
        item.equipped && item.equipment.name.toLowerCase().includes('armor')
      );

      return {
        testName: 'Combat Calculations',
        status: 'pass',
        details: `Combat stats calculated: STR mod ${strengthMod >= 0 ? '+' : ''}${strengthMod}, DEX mod ${dexMod >= 0 ? '+' : ''}${dexMod}, armor equipped: ${hasArmorEquipped}`,
        component: 'Combat'
      };
      
    } catch (error) {
      return {
        testName: 'Combat Calculations',
        status: 'fail',
        details: `Combat calculations test failed: ${error}`,
        component: 'Combat'
      };
    }
  };

  const testLevelProgression = async (): Promise<TestResult> => {
    const character = getCurrentCharacter();
    
    try {
      if (!character.advancement) {
        return {
          testName: 'Level Progression',
          status: 'fail',
          details: 'No advancement data found',
          component: 'Advancement'
        };
      }

      const { currentLevel, levelHistory } = character.advancement;
      
      // Validate level history consistency
      if (levelHistory.length !== currentLevel) {
        return {
          testName: 'Level Progression',
          status: 'fail',
          details: `Level history mismatch: ${levelHistory.length} entries for level ${currentLevel}`,
          component: 'Advancement'
        };
      }

      // Check that levels progress correctly (1, 2, 3, etc.)
      const expectedLevels = Array.from({ length: currentLevel }, (_, i) => i + 1);
      const actualLevels = levelHistory.map(level => level.level);
      
      const levelMismatch = expectedLevels.some((expected, index) => expected !== actualLevels[index]);
      
      if (levelMismatch) {
        return {
          testName: 'Level Progression',
          status: 'fail',
          details: `Level progression inconsistency: expected ${expectedLevels.join(', ')}, got ${actualLevels.join(', ')}`,
          component: 'Advancement'
        };
      }

      return {
        testName: 'Level Progression',
        status: 'pass',
        details: `Level progression valid: level ${currentLevel} with consistent history`,
        component: 'Advancement'
      };
      
    } catch (error) {
      return {
        testName: 'Level Progression',
        status: 'fail',
        details: `Level progression test failed: ${error}`,
        component: 'Advancement'
      };
    }
  };

  const testComponentRendering = async (): Promise<TestResult> => {
    try {
      // This is a basic test - in a real app you'd use testing utilities like React Testing Library
      const character = getCurrentCharacter();
      
      // Test that essential character data is present for rendering
      const hasRenderableData = Boolean(
        character.name &&
        character.class &&
        character.race &&
        typeof character.strength === 'number'
      );
      
      if (!hasRenderableData) {
        return {
          testName: 'Component Rendering',
          status: 'fail',
          details: 'Missing essential data for component rendering',
          component: 'UI'
        };
      }

      return {
        testName: 'Component Rendering',
        status: 'pass',
        details: `All essential data present for rendering ${character.name}`,
        component: 'UI'
      };
      
    } catch (error) {
      return {
        testName: 'Component Rendering',
        status: 'fail',
        details: `Component rendering test failed: ${error}`,
        component: 'UI'
      };
    }
  };

  const getStatusIcon = (status: 'pass' | 'fail' | 'pending') => {
    switch (status) {
      case 'pass':
        return '✅';
      case 'fail':
        return '❌';
      case 'pending':
        return '⏳';
      default:
        return '❓';
    }
  };

  return (
    <div className="combat-integration-tests">
      <h2>Combat Integration Tests</h2>
      <p>Comprehensive testing of combat components with real character data</p>

      {/* Character Selection */}
      <div className="test-character-selection">
        <h3>Test Character</h3>
        <div className="character-tabs">
          <button 
            className={activeTest === 'fighter' ? 'active' : ''}
            onClick={() => setActiveTest('fighter')}
          >
            Fighter (Galahad)
          </button>
          <button 
            className={activeTest === 'wizard' ? 'active' : ''}
            onClick={() => setActiveTest('wizard')}
          >
            Wizard (Eldara)
          </button>
          <button 
            className={activeTest === 'rogue' ? 'active' : ''}
            onClick={() => setActiveTest('rogue')}
          >
            Rogue (Shadow)
          </button>
        </div>
      </div>

      {/* Test Controls */}
      <div className={styles.testControls}>
        <button 
          className="run-tests-btn"
          onClick={runComprehensiveTests}
          disabled={isRunningTests}
        >
          {isRunningTests ? '🔄 Running Tests...' : '▶️ Run All Tests'}
        </button>
      </div>

      {/* Test Results */}
      {testResults.length > 0 && (
        <div className={styles.testResults}>
          <h3>Test Results</h3>
          <div className="results-grid">
            {testResults.map((result, index) => (
              <div key={index} className={`test-result ${result.status}`}>
                <div className="test-header">
                  <span className="status-icon">{getStatusIcon(result.status)}</span>
                  <span className="test-name">{result.testName}</span>
                  {result.component && <span className="component-tag">{result.component}</span>}
                </div>
                <div className="test-details">{result.details}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live Combat Components Test */}
      <div className="live-components-test">
        <h3>Live Component Integration</h3>
        <div className="component-demo-grid">
          <div className="demo-section">
            <h4>Combat Launcher</h4>
            <CombatLauncher 
              character={getCurrentCharacter()}
              buttonText="Test Combat View"
              size="medium"
            />
          </div>
          
          <div className="demo-section">
            <h4>Character Stats Summary</h4>
            <div className="character-summary">
              <p><strong>Name:</strong> {getCurrentCharacter().name}</p>
              <p><strong>Class:</strong> {getCurrentCharacter().class}</p>
              <p><strong>Level:</strong> {getCurrentCharacter().advancement?.currentLevel}</p>
              <p><strong>HP:</strong> {getCurrentCharacter().advancement?.levelHistory.reduce((sum, level) => sum + level.hitPointIncrease, 0)}</p>
              <p><strong>Equipment Items:</strong> {getCurrentCharacter().equipment?.items.length || 0}</p>
              <p><strong>Known Spells:</strong> {getCurrentCharacter().spells?.knownSpells.length || 0}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};