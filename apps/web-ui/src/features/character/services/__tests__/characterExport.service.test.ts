import { CharacterExportService } from '../characterExport.service';
import type { WizardFormData } from '@features/character/components/CharacterWizard/WizardFormData';

const baseChar: WizardFormData = {
  name: 'Thalindra',
  race: 'Elf',
  class: 'Wizard',
  background: 'Sage',
  strength: 8,
  dexterity: 16,
  constitution: 12,
  intelligence: 18,
  wisdom: 14,
  charisma: 10,
  skills: ['Arcana', 'History'],
  spells: { cantrips: ['firebolt'], knownSpells: ['magic-missile'], preparedSpells: [] },
  equipment: {
    items: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 25, pp: 0 },
    carrying_capacity: { current_weight: 0, max_weight: 120, encumbered_at: 40, heavily_encumbered_at: 80 },
  },
  advancement: { experiencePoints: 0, currentLevel: 5, levelHistory: [] },
};

describe('CharacterExportService', () => {
  describe('exportToD5e', () => {
    it('has source: TTRPG_System_Web', () => {
      const result = CharacterExportService.exportToD5e(baseChar, { level: 5 });
      expect(result.source).toBe('TTRPG_System_Web');
    });

    it('character name matches input', () => {
      const result = CharacterExportService.exportToD5e(baseChar, { level: 5 });
      expect(result.character.name).toBe('Thalindra');
    });

    it('intelligence score equals 18', () => {
      const result = CharacterExportService.exportToD5e(baseChar, { level: 5 });
      expect(result.character.abilities.intelligence).toBe(18);
    });

    it('intelligence modifier = +4 (for score 18)', () => {
      const result = CharacterExportService.exportToD5e(baseChar, { level: 5 });
      expect(result.character.calculated.abilityModifiers.intelligence).toBe(4);
    });

    it('proficiency bonus = 3 at level 5', () => {
      const result = CharacterExportService.exportToD5e(baseChar, { level: 5 });
      expect(result.character.calculated.proficiencyBonus).toBe(3);
    });

    it('cantrips include firebolt', () => {
      const result = CharacterExportService.exportToD5e(baseChar, { level: 5 });
      expect(result.character.spells?.cantrips).toContain('firebolt');
    });

    it('includes exportedBy when provided', () => {
      const result = CharacterExportService.exportToD5e(baseChar, { level: 1, exportedBy: 'DM' });
      expect(result.exportedBy).toBe('DM');
    });

    it('wizard is proficient in INT and WIS saves', () => {
      const result = CharacterExportService.exportToD5e(baseChar, { level: 5 });
      expect(result.character.calculated.savingThrows.intelligence.proficient).toBe(true);
      expect(result.character.calculated.savingThrows.wisdom.proficient).toBe(true);
      expect(result.character.calculated.savingThrows.strength.proficient).toBe(false);
    });
  });

  describe('exportToDNDBeyond', () => {
    it('character name matches', () => {
      const result = CharacterExportService.exportToDNDBeyond(baseChar, { level: 5 });
      expect(result.character.name).toBe('Thalindra');
    });

    it('stats array has 6 entries', () => {
      const result = CharacterExportService.exportToDNDBeyond(baseChar, { level: 5 });
      expect(result.character.stats).toHaveLength(6);
    });

    it('INT stat (id: 4) has value 18', () => {
      const result = CharacterExportService.exportToDNDBeyond(baseChar, { level: 5 });
      const intStat = result.character.stats.find(s => s.id === 4);
      expect(intStat?.value).toBe(18);
    });

    it('class name is Wizard', () => {
      const result = CharacterExportService.exportToDNDBeyond(baseChar, { level: 5 });
      expect(result.character.classes[0].definition.name).toBe('Wizard');
    });

    it('background name is Sage', () => {
      const result = CharacterExportService.exportToDNDBeyond(baseChar, { level: 5 });
      expect(result.character.background.definition.name).toBe('Sage');
    });

    it('stats IDs 1-6 are STR/DEX/CON/INT/WIS/CHA order', () => {
      const result = CharacterExportService.exportToDNDBeyond(baseChar, { level: 5 });
      const ids = result.character.stats.map(s => s.id);
      expect(ids).toEqual([1, 2, 3, 4, 5, 6]);
    });
  });

  describe('exportToCharacterSheet', () => {
    it('classAndLevel contains class and level', () => {
      const result = CharacterExportService.exportToCharacterSheet(baseChar, { level: 5 });
      expect(result.character.classAndLevel).toContain('Wizard');
      expect(result.character.classAndLevel).toContain('5');
    });

    it('abilityScores.intelligence equals 18', () => {
      const result = CharacterExportService.exportToCharacterSheet(baseChar, { level: 5 });
      expect(result.character.abilityScores.intelligence).toBe(18);
    });

    it('skills array contains proficient skills', () => {
      const result = CharacterExportService.exportToCharacterSheet(baseChar, { level: 5 });
      const arcana = result.character.skills.find(s => s.name === 'Arcana');
      expect(arcana?.proficient).toBe(true);
    });

    it('armorClass is a number >= 10', () => {
      const result = CharacterExportService.exportToCharacterSheet(baseChar, { level: 5 });
      expect(result.character.armorClass).toBeGreaterThanOrEqual(10);
    });

    it('hitPoints is a positive number', () => {
      const result = CharacterExportService.exportToCharacterSheet(baseChar, { level: 5 });
      expect(result.character.hitPoints).toBeGreaterThan(0);
    });

    it('spells data present for wizard', () => {
      const result = CharacterExportService.exportToCharacterSheet(baseChar, { level: 5 });
      expect(result.character.spells).toBeDefined();
      expect(result.character.spells?.spellcastingAbility).toMatch(/intelligence/i);
    });
  });

  describe('generateFilename', () => {
    it('replaces spaces and special chars with underscores', () => {
      const filename = CharacterExportService.generateFilename('John Doe!', 'd5e');
      expect(filename).toMatch(/John_Doe__d5e/);
    });

    it('includes format in filename', () => {
      const filename = CharacterExportService.generateFilename('TestChar', 'json');
      expect(filename).toContain('json');
    });
  });

  describe('downloadAsJSON', () => {
    it('triggers download anchor click', () => {
      const mockAnchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
      const createSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLElement);
      const appendSpy = vi.spyOn(document.body, 'appendChild').mockReturnValue(mockAnchor as unknown as HTMLElement);
      const removeSpy = vi.spyOn(document.body, 'removeChild').mockReturnValue(mockAnchor as unknown as HTMLElement);
      vi.stubGlobal('URL', {
        createObjectURL: vi.fn(() => 'blob:test'),
        revokeObjectURL: vi.fn(),
      });

      CharacterExportService.downloadAsJSON({ foo: 'bar' }, 'test-character');

      expect(createSpy).toHaveBeenCalledWith('a');
      expect(mockAnchor.click).toHaveBeenCalled();
      expect(mockAnchor.download).toContain('test-character');

      createSpy.mockRestore();
      appendSpy.mockRestore();
      removeSpy.mockRestore();
      vi.unstubAllGlobals();
    });
  });
});
