/**
 * Combat System Integration Test Runner
 * Provides automated testing utilities for validating combat components
 */

import type { WizardFormData } from '../components/CharacterWizard/WizardFormData';

export interface TestResult {
  testName: string;
  status: 'pass' | 'fail' | 'pending';
  details: string;
  component?: string;
  duration?: number;
}

export class CombatTestRunner {
  private static instance: CombatTestRunner;
  private testResults: TestResult[] = [];
  
  static getInstance(): CombatTestRunner {
    if (!CombatTestRunner.instance) {
      CombatTestRunner.instance = new CombatTestRunner();
    }
    return CombatTestRunner.instance;
  }

  /**
   * Run all integration tests for a character
   */
  async runAllTests(character: WizardFormData): Promise<TestResult[]> {
    const startTime = Date.now();
    const results: TestResult[] = [];

    console.log(`🧪 Starting combat integration tests for ${character.name}`);
    
    // Test 1: Character Data Validation
    results.push(await this.validateCharacterData(character));
    
    // Test 2: Equipment System Integration
    results.push(await this.validateEquipmentSystem(character));
    
    // Test 3: Spell System Integration
    results.push(await this.validateSpellSystem(character));
    
    // Test 4: Combat Stat Calculations
    results.push(await this.validateCombatCalculations(character));
    
    // Test 5: Level Progression Validation
    results.push(await this.validateLevelProgression(character));
    
    // Test 6: Data Consistency Checks
    results.push(await this.validateDataConsistency(character));

    const totalTime = Date.now() - startTime;
    const passCount = results.filter(r => r.status === 'pass').length;
    const failCount = results.filter(r => r.status === 'fail').length;

    console.log(`✅ Tests completed in ${totalTime}ms`);
    console.log(`📊 Results: ${passCount} passed, ${failCount} failed`);

    this.testResults = results;
    return results;
  }

  /**
   * Validate character has all required data for combat
   */
  private async validateCharacterData(character: WizardFormData): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      // Required fields
      const requiredFields = [
        'name', 'race', 'class', 'strength', 'dexterity', 
        'constitution', 'intelligence', 'wisdom', 'charisma'
      ];
      
      const missingFields = requiredFields.filter(field => {
        const value = character[field as keyof WizardFormData];
        return value === undefined || value === null || value === '';
      });

      if (missingFields.length > 0) {
        return {
          testName: 'Character Data Validation',
          status: 'fail',
          details: `Missing required fields: ${missingFields.join(', ')}`,
          component: 'Character',
          duration: Date.now() - startTime
        };
      }

      // Validate ability score ranges (3-20 for standard D&D)
      const abilities = [
        character.strength, character.dexterity, character.constitution,
        character.intelligence, character.wisdom, character.charisma
      ];
      
      const invalidAbilities = abilities.filter(score => score < 3 || score > 20);
      
      if (invalidAbilities.length > 0) {
        return {
          testName: 'Character Data Validation',
          status: 'fail',
          details: `Invalid ability scores (must be 3-20): ${invalidAbilities.join(', ')}`,
          component: 'Character',
          duration: Date.now() - startTime
        };
      }

      return {
        testName: 'Character Data Validation',
        status: 'pass',
        details: `Character data is valid and complete`,
        component: 'Character',
        duration: Date.now() - startTime
      };
      
    } catch (error) {
      return {
        testName: 'Character Data Validation',
        status: 'fail',
        details: `Validation error: ${error instanceof Error ? error.message : String(error)}`,
        component: 'Character',
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Validate equipment system integration
   */
  private async validateEquipmentSystem(character: WizardFormData): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      if (!character.equipment) {
        return {
          testName: 'Equipment System Integration',
          status: 'pass',
          details: 'No equipment system configured (valid for some characters)',
          component: 'Equipment',
          duration: Date.now() - startTime
        };
      }

      const { items, currency, carrying_capacity } = character.equipment;

      // Test weight calculations
      const calculatedWeight = items.reduce(
        (sum, item) => sum + (item.equipment.weight * item.quantity), 
        0
      );
      
      const weightDifference = Math.abs(calculatedWeight - carrying_capacity.current_weight);
      
      if (weightDifference > 0.1) {
        return {
          testName: 'Equipment System Integration',
          status: 'fail',
          details: `Weight calculation mismatch: calculated ${calculatedWeight}, recorded ${carrying_capacity.current_weight}`,
          component: 'Equipment',
          duration: Date.now() - startTime
        };
      }

      // Test currency validation
      const currencyTypes = Object.keys(currency);
      const validCurrencies = ['cp', 'sp', 'ep', 'gp', 'pp'];
      const invalidCurrencies = currencyTypes.filter(type => !validCurrencies.includes(type));
      
      if (invalidCurrencies.length > 0) {
        return {
          testName: 'Equipment System Integration',
          status: 'fail',
          details: `Invalid currency types: ${invalidCurrencies.join(', ')}`,
          component: 'Equipment',
          duration: Date.now() - startTime
        };
      }

      // Test equipment items structure
      const invalidItems = items.filter(item => 
        !item.equipment.name || 
        typeof item.equipment.weight !== 'number' ||
        typeof item.quantity !== 'number' ||
        item.quantity <= 0
      );

      if (invalidItems.length > 0) {
        return {
          testName: 'Equipment System Integration',
          status: 'fail',
          details: `Found ${invalidItems.length} invalid equipment items`,
          component: 'Equipment',
          duration: Date.now() - startTime
        };
      }

      return {
        testName: 'Equipment System Integration',
        status: 'pass',
        details: `Equipment system valid: ${items.length} items, weight ${calculatedWeight}/${carrying_capacity.max_weight}`,
        component: 'Equipment',
        duration: Date.now() - startTime
      };
      
    } catch (error) {
      return {
        testName: 'Equipment System Integration',
        status: 'fail',
        details: `Equipment validation error: ${error instanceof Error ? error.message : String(error)}`,
        component: 'Equipment',
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Validate spell system integration
   */
  private async validateSpellSystem(character: WizardFormData): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      if (!character.spells) {
        return {
          testName: 'Spell System Integration',
          status: 'pass',
          details: 'Non-spellcaster character (spell system correctly absent)',
          component: 'Spells',
          duration: Date.now() - startTime
        };
      }

      const { cantrips, knownSpells, preparedSpells } = character.spells;

      // Validate prepared spells are subset of known spells
      const invalidPreparedSpells = (preparedSpells || []).filter(
        spell => !knownSpells.includes(spell)
      );
      
      if (invalidPreparedSpells.length > 0) {
        return {
          testName: 'Spell System Integration',
          status: 'fail',
          details: `Prepared spells not in known spells: ${invalidPreparedSpells.join(', ')}`,
          component: 'Spells',
          duration: Date.now() - startTime
        };
      }

      // Check spell progression for spellcaster classes
      const spellcasterClasses = ['wizard', 'sorcerer', 'warlock', 'cleric', 'druid', 'bard', 'paladin', 'ranger'];
      const isSpellcaster = spellcasterClasses.includes(character.class.toLowerCase());
      const characterLevel = character.advancement?.currentLevel || 1;
      
      if (isSpellcaster && characterLevel > 1 && knownSpells.length === 0 && cantrips.length === 0) {
        return {
          testName: 'Spell System Integration',
          status: 'fail',
          details: `Level ${characterLevel} ${character.class} should have spells or cantrips`,
          component: 'Spells',
          duration: Date.now() - startTime
        };
      }

      return {
        testName: 'Spell System Integration',
        status: 'pass',
        details: `Spell system valid: ${cantrips.length} cantrips, ${knownSpells.length} known, ${preparedSpells?.length || 0} prepared`,
        component: 'Spells',
        duration: Date.now() - startTime
      };
      
    } catch (error) {
      return {
        testName: 'Spell System Integration',
        status: 'fail',
        details: `Spell validation error: ${error instanceof Error ? error.message : String(error)}`,
        component: 'Spells',
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Validate combat calculations
   */
  private async validateCombatCalculations(character: WizardFormData): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      // Calculate ability modifiers
      const calculateModifier = (score: number) => Math.floor((score - 10) / 2);
      
      const modifiers = {
        strength: calculateModifier(character.strength),
        dexterity: calculateModifier(character.dexterity),
        constitution: calculateModifier(character.constitution),
        intelligence: calculateModifier(character.intelligence),
        wisdom: calculateModifier(character.wisdom),
        charisma: calculateModifier(character.charisma)
      };

      // Validate modifiers are in reasonable range (-5 to +5 for standard scores)
      const invalidModifiers = Object.entries(modifiers).filter(([_, mod]) => mod < -5 || mod > 5);
      
      if (invalidModifiers.length > 0) {
        return {
          testName: 'Combat Calculations',
          status: 'fail',
          details: `Invalid ability modifiers: ${invalidModifiers.map(([ability, mod]) => `${ability}: ${mod}`).join(', ')}`,
          component: 'Combat',
          duration: Date.now() - startTime
        };
      }

      // Calculate proficiency bonus
      const level = character.advancement?.currentLevel || 1;
      const proficiencyBonus = Math.ceil(level / 4) + 1;
      
      if (proficiencyBonus < 2 || proficiencyBonus > 6) {
        return {
          testName: 'Combat Calculations',
          status: 'fail',
          details: `Invalid proficiency bonus: ${proficiencyBonus} for level ${level}`,
          component: 'Combat',
          duration: Date.now() - startTime
        };
      }

      // Validate HP calculation if level history exists
      if (character.advancement?.levelHistory) {
        const totalHP = character.advancement.levelHistory.reduce(
          (sum, levelData) => sum + levelData.hitPointIncrease, 
          0
        );
        
        if (totalHP <= 0) {
          return {
            testName: 'Combat Calculations',
            status: 'fail',
            details: `Invalid HP total: ${totalHP}`,
            component: 'Combat',
            duration: Date.now() - startTime
          };
        }
      }

      return {
        testName: 'Combat Calculations',
        status: 'pass',
        details: `Combat calculations valid: proficiency +${proficiencyBonus}, modifiers in range`,
        component: 'Combat',
        duration: Date.now() - startTime
      };
      
    } catch (error) {
      return {
        testName: 'Combat Calculations',
        status: 'fail',
        details: `Combat calculation error: ${error instanceof Error ? error.message : String(error)}`,
        component: 'Combat',
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Validate level progression
   */
  private async validateLevelProgression(character: WizardFormData): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      if (!character.advancement) {
        return {
          testName: 'Level Progression Validation',
          status: 'fail',
          details: 'No advancement data found',
          component: 'Advancement',
          duration: Date.now() - startTime
        };
      }

      const { currentLevel, levelHistory } = character.advancement;
      
      // Check level history matches current level
      if (levelHistory.length !== currentLevel) {
        return {
          testName: 'Level Progression Validation',
          status: 'fail',
          details: `Level history count (${levelHistory.length}) doesn't match current level (${currentLevel})`,
          component: 'Advancement',
          duration: Date.now() - startTime
        };
      }

      // Validate level progression (1, 2, 3, ...)
      for (let i = 0; i < levelHistory.length; i++) {
        if (levelHistory[i].level !== i + 1) {
          return {
            testName: 'Level Progression Validation',
            status: 'fail',
            details: `Level progression error at index ${i}: expected level ${i + 1}, got ${levelHistory[i].level}`,
            component: 'Advancement',
            duration: Date.now() - startTime
          };
        }
      }

      // Validate hit point increases are reasonable (1 to hit die max + con modifier)
      const invalidHP = levelHistory.some(level => 
        level.hitPointIncrease < 1 || level.hitPointIncrease > 20
      );
      
      if (invalidHP) {
        return {
          testName: 'Level Progression Validation',
          status: 'fail',
          details: 'Invalid hit point increases found in level history',
          component: 'Advancement',
          duration: Date.now() - startTime
        };
      }

      return {
        testName: 'Level Progression Validation',
        status: 'pass',
        details: `Level progression valid: ${currentLevel} levels with consistent history`,
        component: 'Advancement',
        duration: Date.now() - startTime
      };
      
    } catch (error) {
      return {
        testName: 'Level Progression Validation',
        status: 'fail',
        details: `Level progression error: ${error instanceof Error ? error.message : String(error)}`,
        component: 'Advancement',
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Validate data consistency across all systems
   */
  private async validateDataConsistency(character: WizardFormData): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const issues: string[] = [];

      // Check class consistency across systems
      if (character.advancement?.levelHistory) {
        const classNames = character.advancement.levelHistory.map(level => level.className);
        const primaryClass = classNames[0];
        const hasConsistentClass = classNames.every(className => className === primaryClass);
        
        if (!hasConsistentClass && !character.classes) {
          issues.push('Inconsistent class names in level history without multiclass data');
        }
      }

      // Check skill consistency with class and background
      const skillCount = character.skills?.length || 0;
      if (skillCount === 0) {
        issues.push('No skills selected (unusual for most characters)');
      }

      // Check equipment weight vs strength
      if (character.equipment?.carrying_capacity) {
        const strength = character.strength;
        const expectedMaxWeight = strength * 15; // Basic D&D 5e calculation
        const actualMaxWeight = character.equipment.carrying_capacity.max_weight;
        
        if (Math.abs(expectedMaxWeight - actualMaxWeight) > 30) {
          issues.push(`Carrying capacity mismatch: expected ~${expectedMaxWeight}, got ${actualMaxWeight}`);
        }
      }

      if (issues.length > 0) {
        return {
          testName: 'Data Consistency Validation',
          status: 'fail',
          details: issues.join('; '),
          component: 'System',
          duration: Date.now() - startTime
        };
      }

      return {
        testName: 'Data Consistency Validation',
        status: 'pass',
        details: 'All systems are internally consistent',
        component: 'System',
        duration: Date.now() - startTime
      };
      
    } catch (error) {
      return {
        testName: 'Data Consistency Validation',
        status: 'fail',
        details: `Consistency check error: ${error instanceof Error ? error.message : String(error)}`,
        component: 'System',
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Get test results summary
   */
  getTestSummary(): { total: number; passed: number; failed: number; pending: number } {
    const total = this.testResults.length;
    const passed = this.testResults.filter(r => r.status === 'pass').length;
    const failed = this.testResults.filter(r => r.status === 'fail').length;
    const pending = this.testResults.filter(r => r.status === 'pending').length;
    
    return { total, passed, failed, pending };
  }

  /**
   * Get the most recent test results
   */
  getLatestResults(): TestResult[] {
    return [...this.testResults];
  }
}

// Export singleton instance
export const combatTestRunner = CombatTestRunner.getInstance();