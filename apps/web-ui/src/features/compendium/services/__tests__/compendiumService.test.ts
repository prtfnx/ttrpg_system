import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CompendiumService } from '../compendiumService';

let mockFetch: ReturnType<typeof vi.fn>;
let service: CompendiumService;

beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
  service = new CompendiumService();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function ok(data: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(data),
  } as Response);
}

function fail(status = 500) {
  return Promise.resolve({
    ok: false,
    status,
    statusText: 'Error',
  } as Response);
}

describe('CompendiumService', () => {
  describe('getStatus', () => {
    it('returns status from API', async () => {
      mockFetch.mockReturnValue(ok({ available: true }));
      const result = await service.getStatus();
      expect(result).toEqual({ available: true });
      expect(mockFetch).toHaveBeenCalledWith('/api/compendium/status', expect.any(Object));
    });

    it('caches results on second call', async () => {
      mockFetch.mockReturnValue(ok({ available: true }));
      await service.getStatus();
      await service.getStatus();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('throws on non-ok response', async () => {
      mockFetch.mockReturnValue(fail(503));
      await expect(service.getStatus()).rejects.toThrow();
    });

    it('clears cache and re-fetches after clearCache()', async () => {
      mockFetch.mockReturnValue(ok({ available: true }));
      await service.getStatus();
      service.clearCache();
      await service.getStatus();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('getRaces', () => {
    it('returns races response', async () => {
      const races = [{ name: 'Human' }];
      mockFetch.mockReturnValue(ok({ races }));
      const result = await service.getRaces();
      expect(result.races).toEqual(races);
    });
  });

  describe('getClasses', () => {
    it('returns classes response', async () => {
      const classes = [{ name: 'Fighter', hit_die: 10 }];
      mockFetch.mockReturnValue(ok({ classes }));
      const result = await service.getClasses();
      expect(result.classes).toEqual(classes);
    });
  });

  describe('getSpells', () => {
    it('fetches spells with no filters', async () => {
      mockFetch.mockReturnValue(ok({ spells: {} }));
      await service.getSpells();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/compendium/spells'),
        expect.any(Object)
      );
    });

    it('appends query params for filters', async () => {
      mockFetch.mockReturnValue(ok({ spells: {} }));
      await service.getSpells({ level: 3, school: 'evocation', class: 'Wizard', limit: 10 });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('level=3');
      expect(url).toContain('school=evocation');
      expect(url).toContain('class=Wizard');
      expect(url).toContain('limit=10');
    });
  });

  describe('getClass', () => {
    it('encodes class name in URL', async () => {
      mockFetch.mockReturnValue(ok({ name: 'Blood Hunter', hit_die: 10 }));
      await service.getClass('Blood Hunter');
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('Blood%20Hunter');
    });
  });

  describe('getRacesForFrontend', () => {
    it('converts races to frontend format', async () => {
      const race = {
        name: 'Human',
        size: 'Medium',
        speed: 30,
        ability_score_increases: [{ ability: 'STR', increase: 1 }],
        spell_ability: null,
        skill_proficiencies: [],
        traits: [],
        languages: ['Common'],
        source: 'PHB',
        damage_resistances: [],
        damage_immunities: [],
        condition_immunities: [],
      };
      mockFetch.mockReturnValue(ok({ races: [race] }));
      const result = await service.getRacesForFrontend();
      expect(result['Human']).toBeDefined();
      expect(result['Human'].name).toBe('Human');
    });
  });

  describe('getMonsters', () => {
    it('fetches with CR filter', async () => {
      mockFetch.mockReturnValue(ok({ monsters: {}, count: 0, metadata: {} }));
      await service.getMonsters({ cr: '5', limit: 20 });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('cr=5');
      expect(url).toContain('limit=20');
    });
  });

  describe('getAdvancement', () => {
    it('fetches advancement config', async () => {
      const data = { levels: {} };
      mockFetch.mockReturnValue(ok(data));
      const result = await service.getAdvancement();
      expect(result).toEqual(data);
    });
  });

  describe('getAllMulticlassData', () => {
    it('fetches multiclass data', async () => {
      const data = { Fighter: { prerequisites: {}, proficiencies: [] } };
      mockFetch.mockReturnValue(ok(data));
      const result = await service.getAllMulticlassData();
      expect(result).toEqual(data);
    });
  });
});
