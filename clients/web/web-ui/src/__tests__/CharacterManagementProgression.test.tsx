/**
 * Character Management and Progression System Behavior Tests  
 * Tests real D&D 5e character creation, leveling, spell management, and abilities
 * Focus: Real expected behavior for complete character lifecycle
 */
// @ts-nocheck
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

// Import actual components - no mocking
import { CharacterWizard } from '../components/CharacterWizard/CharacterWizard';
import { CompendiumPanel } from '../components/CompendiumPanel';

describe('Character Management System - D&D 5e Character Lifecycle', () => {
  const mockUserInfo = { 
    id: 'player1', 
    username: 'Alice', 
    role: 'player' as const,
    permissions: ['create_character', 'manage_own_character', 'cast_spells'] 
  };

  describe('Character Creation Wizard - Complete Workflow', () => {
    it('should guide user through complete character creation process', async () => {
      const user = userEvent.setup();
      render(<CharacterWizard userInfo={mockUserInfo} />);
      
      // Step 1: Basic Information
      expect(screen.getByText(/create your character/i)).toBeInTheDocument();
      
      const characterName = screen.getByLabelText(/character name/i);
      await user.type(characterName, 'Thorin Oakenshield');
      
      // Step 2: Race Selection with racial traits
      const nextButton = screen.getByRole('button', { name: /next/i });
      await user.click(nextButton);
      
      expect(screen.getByText(/choose your race/i)).toBeInTheDocument();
      
      const raceSelect = screen.getByLabelText(/select race/i);
      await user.selectOptions(raceSelect, 'mountain-dwarf');
      
      // Racial bonuses should be displayed and applied
      await waitFor(() => {
        expect(screen.getByText(/\+2 constitution, \+2 strength/i)).toBeInTheDocument();
        expect(screen.getByText(/darkvision 60 feet/i)).toBeInTheDocument();
        expect(screen.getByText(/dwarven resilience/i)).toBeInTheDocument();
      });
      
      await user.click(nextButton);
      
      // Step 3: Class Selection with features
      expect(screen.getByText(/choose your class/i)).toBeInTheDocument();
      
      const classSelect = screen.getByLabelText(/select class/i);
      await user.selectOptions(classSelect, 'fighter');
      
      // Class features should be shown
      await waitFor(() => {
        expect(screen.getByText(/hit die: d10/i)).toBeInTheDocument();
        expect(screen.getByText(/fighting style/i)).toBeInTheDocument();
        expect(screen.getByText(/second wind/i)).toBeInTheDocument();
      });
      
      // Choose fighting style
      const fightingStyleSelect = screen.getByLabelText(/fighting style/i);
      await user.selectOptions(fightingStyleSelect, 'defense');
      
      await user.click(nextButton);
      
      // Step 4: Ability Scores (Point Buy System)
      expect(screen.getByText(/assign ability scores/i)).toBeInTheDocument();
      expect(screen.getByText(/point buy \(27 points\)/i)).toBeInTheDocument();
      
      // All scores start at 8, spend 27 points to increase
      const strIncrease = screen.getByRole('button', { name: /increase strength/i });
      const conIncrease = screen.getByRole('button', { name: /increase constitution/i });
      
      // Increase STR from 8 to 15 (costs 9 points)
      for (let i = 0; i < 7; i++) {
        await user.click(strIncrease);
      }
      
      // Increase CON from 8 to 14 (costs 7 points)  
      for (let i = 0; i < 6; i++) {
        await user.click(conIncrease);
      }
      
      // Check point calculation
      await waitFor(() => {
        expect(screen.getByTestId('points-remaining')).toHaveTextContent('11'); // 27 - 9 - 7
      });
      
      // Apply racial bonuses
      await waitFor(() => {
        expect(screen.getByTestId('strength-final')).toHaveTextContent('17'); // 15 + 2 racial
        expect(screen.getByTestId('constitution-final')).toHaveTextContent('16'); // 14 + 2 racial
      });
      
      await user.click(nextButton);
      
      // Step 5: Background and Skills
      expect(screen.getByText(/choose background/i)).toBeInTheDocument();
      
      const backgroundSelect = screen.getByLabelText(/select background/i);
      await user.selectOptions(backgroundSelect, 'soldier');
      
      // Background should provide skill proficiencies
      await waitFor(() => {
        expect(screen.getByText(/athletics, intimidation/i)).toBeInTheDocument();
        expect(screen.getByText(/vehicles \(land\), gaming set/i)).toBeInTheDocument();
      });
      
      // Choose additional class skills (Fighter gets 2 from list)
      const skillCheckboxes = screen.getAllByRole('checkbox', { name: /skill proficiency/i });
      await user.click(skillCheckboxes[0]); // Acrobatics
      await user.click(skillCheckboxes[3]); // Insight
      
      await user.click(nextButton);
      
      // Final Review - all choices should be compiled
      expect(screen.getByText(/character summary/i)).toBeInTheDocument();
      expect(screen.getByText(/thorin oakenshield/i)).toBeInTheDocument();
      expect(screen.getByText(/mountain dwarf fighter/i)).toBeInTheDocument();
      expect(screen.getByText(/hit points: 13/i)).toBeInTheDocument(); // 10 + 3 CON modifier
      
      // Finalize character creation
      const createButton = screen.getByRole('button', { name: /create character/i });
      await user.click(createButton);
      
      // Character should be saved and ready for play
      await waitFor(() => {
        expect(screen.getByText(/character created successfully/i)).toBeInTheDocument();
      });
    });

    it('should handle spellcaster creation with spell selection', async () => {
      const user = userEvent.setup();
      render(<CharacterWizard userInfo={mockUserInfo} />);
      
      // Create wizard character
      await user.type(screen.getByLabelText(/character name/i), 'Elaria Moonwhisper');
      await user.click(screen.getByRole('button', { name: /next/i }));
      
      // Select High Elf (gets cantrip)
      await user.selectOptions(screen.getByLabelText(/select race/i), 'high-elf');
      await user.click(screen.getByRole('button', { name: /next/i }));
      
      // Select Wizard class
      await user.selectOptions(screen.getByLabelText(/select class/i), 'wizard');
      await user.click(screen.getByRole('button', { name: /next/i }));
      
      // Set high INT for spellcasting
      const intIncrease = screen.getByRole('button', { name: /increase intelligence/i });
      for (let i = 0; i < 7; i++) {
        await user.click(intIncrease);
      }
      await user.click(screen.getByRole('button', { name: /next/i }));
      
      // Background
      await user.selectOptions(screen.getByLabelText(/select background/i), 'sage');
      await user.click(screen.getByRole('button', { name: /next/i }));
      
      // Spell Selection Step
      expect(screen.getByText(/select spells/i)).toBeInTheDocument();
      
      // Wizard gets 3 cantrips and 6 1st level spells in spellbook
      expect(screen.getByText(/choose 3 cantrips/i)).toBeInTheDocument();
      expect(screen.getByText(/choose 6 first level spells/i)).toBeInTheDocument();
      
      // Select cantrips
      const cantripCheckboxes = screen.getAllByRole('checkbox', { name: /cantrip/i });
      await user.click(cantripCheckboxes[0]); // Mage Hand
      await user.click(cantripCheckboxes[1]); // Prestidigitation  
      await user.click(cantripCheckboxes[2]); // Minor Illusion
      
      // Select 1st level spells
      const spellCheckboxes = screen.getAllByRole('checkbox', { name: /1st level spell/i });
      for (let i = 0; i < 6; i++) {
        await user.click(spellCheckboxes[i]);
      }
      
      // Racial cantrip (High Elf gets one wizard cantrip)
      const racialCantripSelect = screen.getByLabelText(/racial cantrip/i);
      await user.selectOptions(racialCantripSelect, 'fire-bolt');
      
      await user.click(screen.getByRole('button', { name: /next/i }));
      
      // Final review should show spellcasting details
      expect(screen.getByText(/spellcasting ability: intelligence/i)).toBeInTheDocument();
      expect(screen.getByText(/spell attack bonus: \+5/i)).toBeInTheDocument(); // +2 prof + 3 INT
      expect(screen.getByText(/spell save dc: 13/i)).toBeInTheDocument(); // 8 + 2 + 3
      expect(screen.getByText(/spells known: 4 cantrips, 6 first level/i)).toBeInTheDocument();
    });
  });

  describe('Character Progression and Leveling', () => {
    it('should handle level advancement with proper feature unlocks', async () => {
      const user = userEvent.setup();
      
      // Level 1 Fighter character
      const existingCharacter = {
        name: 'Thorin Oakenshield',
        race: 'mountain-dwarf',
        class: 'fighter',
        level: 1,
        hitPoints: 13,
        maxHitPoints: 13,
        experience: 0
      };
      
      render(<CharacterWizard character={existingCharacter} userInfo={mockUserInfo} mode="level-up" />);
      
      // Award experience to reach level 2 (300 XP needed)
      const addXpInput = screen.getByLabelText(/add experience/i);
      await user.type(addXpInput, '300');
      
      const addXpButton = screen.getByRole('button', { name: /add experience/i });
      await user.click(addXpButton);
      
      // Level up should be available
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /level up/i })).toBeEnabled();
      });
      
      const levelUpButton = screen.getByRole('button', { name: /level up/i });
      await user.click(levelUpButton);
      
      // Level 2 features should be presented
      expect(screen.getByText(/level 2 fighter features/i)).toBeInTheDocument();
      expect(screen.getByText(/action surge/i)).toBeInTheDocument();
      
      // HP increase - roll or take average
      const hpRollButton = screen.getByRole('button', { name: /roll for hp/i });
      await user.click(hpRollButton);
      
      // HP should increase (minimum 1 + CON modifier)
      await waitFor(() => {
        const newHP = parseInt(screen.getByTestId('max-hit-points').textContent || '13');
        expect(newHP).toBeGreaterThan(13);
        expect(newHP).toBeLessThanOrEqual(23); // 13 + 10 (max roll) + 3 (CON mod)
      });
      
      // Continue leveling to test major milestones
      // Level 3 - Archetype selection
      await user.type(addXpInput, '600'); // 900 total XP for level 3
      await user.click(addXpButton);
      await user.click(levelUpButton);
      
      expect(screen.getByText(/choose martial archetype/i)).toBeInTheDocument();
      
      const archetypeSelect = screen.getByLabelText(/martial archetype/i);
      await user.selectOptions(archetypeSelect, 'champion');
      
      // Champion features should be added
      await waitFor(() => {
        expect(screen.getByText(/improved critical/i)).toBeInTheDocument();
        expect(screen.getByText(/critical hit on 19-20/i)).toBeInTheDocument();
      });
    });

    it('should handle multiclassing with prerequisites and restrictions', async () => {
      const user = userEvent.setup();
      
      // Level 3 Fighter wanting to multiclass
      const existingCharacter = {
        name: 'Thorin',
        race: 'mountain-dwarf', 
        class: 'fighter',
        level: 3,
        strength: 17,
        dexterity: 13,
        constitution: 16,
        intelligence: 12,
        wisdom: 14,
        charisma: 8
      };
      
      render(<CharacterWizard character={existingCharacter} userInfo={mockUserInfo} mode="level-up" />);
      
      // Choose to multiclass
      const multiclassButton = screen.getByRole('button', { name: /multiclass/i });
      await user.click(multiclassButton);
      
      // Check prerequisites - should show available classes
      expect(screen.getByText(/multiclass prerequisites/i)).toBeInTheDocument();
      
      // Barbarian requires STR 13 (met)
      expect(screen.getByRole('option', { name: /barbarian/i })).not.toBeDisabled();
      
      // Wizard requires INT 13 (not met - has 12)
      expect(screen.getByRole('option', { name: /wizard/i })).toBeDisabled();
      expect(screen.getByText(/wizard requires intelligence 13/i)).toBeInTheDocument();
      
      // Select Barbarian
      const classSelect = screen.getByLabelText(/multiclass into/i);
      await user.selectOptions(classSelect, 'barbarian');
      
      // Should get limited proficiencies (not full class proficiencies)
      expect(screen.getByText(/multiclass proficiencies/i)).toBeInTheDocument();
      expect(screen.getByText(/shields, simple weapons, martial weapons/i)).toBeInTheDocument();
      
      // Choose Barbarian features for level 1
      expect(screen.getByText(/rage \(2 uses\)/i)).toBeInTheDocument();
      expect(screen.getByText(/unarmored defense/i)).toBeInTheDocument();
      
      const confirmButton = screen.getByRole('button', { name: /confirm multiclass/i });
      await user.click(confirmButton);
      
      // Character should now be Fighter 3/Barbarian 1
      await waitFor(() => {
        expect(screen.getByTestId('character-class')).toHaveTextContent('Fighter 3 / Barbarian 1');
        expect(screen.getByTestId('character-level')).toHaveTextContent('4');
      });
    });
  });

  describe('Spell Management and Preparation', () => {
    it('should handle spell preparation for prepared casters', async () => {
      const user = userEvent.setup();
      
      // 3rd level Cleric character
      const clericCharacter = {
        name: 'Sister Mary',
        race: 'human',
        class: 'cleric',
        level: 3,
        wisdom: 16, // +3 modifier
        spellcastingAbility: 'wisdom',
        spellSlots: { 1: 4, 2: 2 },
        knownSpells: [], // Clerics know all domain spells
        domainSpells: ['bless', 'cure-wounds', 'hold-person', 'spiritual-weapon']
      };
      
      render(<CharacterWizard character={clericCharacter} userInfo={mockUserInfo} mode="manage-spells" />);
      
      // Spell preparation interface
      expect(screen.getByText(/prepare spells/i)).toBeInTheDocument();
      
      // Can prepare WIS modifier + Cleric level spells = 3 + 3 = 6 spells
      expect(screen.getByText(/you can prepare 6 spells/i)).toBeInTheDocument();
      
      // Domain spells are always prepared
      expect(screen.getByText(/domain spells \(always prepared\)/i)).toBeInTheDocument();
      expect(screen.getByText(/bless, cure wounds/i)).toBeInTheDocument(); // 1st level domain
      expect(screen.getByText(/hold person, spiritual weapon/i)).toBeInTheDocument(); // 2nd level domain
      
      // Select spells to prepare from cleric spell list
      const availableSpells = screen.getAllByRole('checkbox', { name: /prepare spell/i });
      
      // Prepare 6 additional spells
      for (let i = 0; i < 6; i++) {
        await user.click(availableSpells[i]);
      }
      
      // Try to prepare one more - should be prevented
      const extraSpell = availableSpells[6];
      await user.click(extraSpell);
      
      expect(screen.getByText(/cannot prepare more spells/i)).toBeInTheDocument();
      expect(extraSpell).not.toBeChecked();
      
      // Confirm spell preparation
      const confirmButton = screen.getByRole('button', { name: /confirm preparation/i });
      await user.click(confirmButton);
      
      // Prepared spells should be saved
      await waitFor(() => {
        expect(screen.getByTestId('prepared-spells-count')).toHaveTextContent('10'); // 6 + 4 domain
      });
    });

    it('should handle ritual casting correctly', async () => {
      const user = userEvent.setup();
      
      const wizardCharacter = {
        name: 'Gandalf',
        class: 'wizard',
        level: 5,
        spellbook: ['detect-magic', 'identify', 'comprehend-languages', 'find-familiar'],
        preparedSpells: ['detect-magic', 'identify'],
        ritualSpells: ['detect-magic', 'identify', 'comprehend-languages', 'find-familiar']
      };
      
      render(<CharacterWizard character={wizardCharacter} userInfo={mockUserInfo} mode="cast-spell" />);
      
      // Ritual section should show all ritual spells from spellbook
      expect(screen.getByText(/ritual spells/i)).toBeInTheDocument();
      
      // Should show ritual spells even if not prepared
      expect(screen.getByText(/comprehend languages/i)).toBeInTheDocument();
      expect(screen.getByText(/find familiar/i)).toBeInTheDocument();
      
      // Cast comprehend languages as ritual
      const ritualButton = screen.getByRole('button', { name: /cast comprehend languages \(ritual\)/i });
      await user.click(ritualButton);
      
      // Ritual casting should take 10 minutes longer
      expect(screen.getByText(/casting time: 1 action \+ 10 minutes \(ritual\)/i)).toBeInTheDocument();
      expect(screen.getByText(/no spell slot required/i)).toBeInTheDocument();
      
      const confirmRitualButton = screen.getByRole('button', { name: /cast ritual/i });
      await user.click(confirmRitualButton);
      
      // Spell slots should not be consumed
      await waitFor(() => {
        expect(screen.getByTestId('spell-slots-used')).toHaveTextContent('0'); // No slots used
      });
    });
  });

  describe('Compendium Integration for Character Building', () => {
    it('should provide searchable spell database for character creation', async () => {
      const user = userEvent.setup();
      render(<CompendiumPanel userInfo={mockUserInfo} category="spells" />);
      
      // Search for spells by school
      const searchInput = screen.getByLabelText(/search spells/i);
      await user.type(searchInput, 'evocation');
      
      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);
      
      // Should show evocation spells
      await waitFor(() => {
        expect(screen.getByText(/fireball/i)).toBeInTheDocument();
        expect(screen.getByText(/magic missile/i)).toBeInTheDocument();
        expect(screen.getByText(/lightning bolt/i)).toBeInTheDocument();
      });
      
      // Filter by level
      const levelFilter = screen.getByLabelText(/spell level/i);
      await user.selectOptions(levelFilter, '3');
      
      // Should show only 3rd level evocation spells
      await waitFor(() => {
        expect(screen.getByText(/fireball/i)).toBeInTheDocument();
        expect(screen.getByText(/lightning bolt/i)).toBeInTheDocument();
        expect(screen.queryByText(/magic missile/i)).not.toBeInTheDocument(); // 1st level
      });
      
      // View spell details
      const fireballButton = screen.getByRole('button', { name: /fireball details/i });
      await user.click(fireballButton);
      
      // Full spell description should be displayed
      expect(screen.getByText(/3rd-level evocation/i)).toBeInTheDocument();
      expect(screen.getByText(/casting time: 1 action/i)).toBeInTheDocument();
      expect(screen.getByText(/range: 150 feet/i)).toBeInTheDocument();
      expect(screen.getByText(/20-foot-radius sphere/i)).toBeInTheDocument();
      expect(screen.getByText(/8d6 fire damage/i)).toBeInTheDocument();
      expect(screen.getByText(/dexterity saving throw/i)).toBeInTheDocument();
    });

    it('should provide monster stat blocks for DM reference', async () => {
      const user = userEvent.setup();
      render(<CompendiumPanel userInfo={mockUserInfo} category="monsters" />);
      
      // Search for monsters by challenge rating
      const crFilter = screen.getByLabelText(/challenge rating/i);
      await user.selectOptions(crFilter, '5');
      
      await waitFor(() => {
        expect(screen.getByText(/hill giant/i)).toBeInTheDocument();
        expect(screen.getByText(/flesh golem/i)).toBeInTheDocument();
      });
      
      // View monster details
      const giantButton = screen.getByRole('button', { name: /hill giant details/i });
      await user.click(giantButton);
      
      // Complete stat block should be shown
      expect(screen.getByText(/huge giant, chaotic evil/i)).toBeInTheDocument();
      expect(screen.getByText(/armor class 13/i)).toBeInTheDocument();
      expect(screen.getByText(/hit points 105/i)).toBeInTheDocument();
      expect(screen.getByText(/speed 40 ft/i)).toBeInTheDocument();
      
      // Ability scores
      expect(screen.getByText(/str 21 \(\+5\)/i)).toBeInTheDocument();
      expect(screen.getByText(/con 19 \(\+4\)/i)).toBeInTheDocument();
      
      // Actions
      expect(screen.getByText(/multiattack/i)).toBeInTheDocument();
      expect(screen.getByText(/greatclub/i)).toBeInTheDocument();
      expect(screen.getByText(/rock/i)).toBeInTheDocument();
    });
  });
});