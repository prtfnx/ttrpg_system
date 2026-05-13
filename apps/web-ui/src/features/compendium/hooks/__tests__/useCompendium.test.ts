import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useClasses, useRaces, useClassSpells, useBackgrounds, useCompendiumStatus } from '../useCompendium';

vi.mock('../../services/compendiumService', () => ({
  compendiumService: {
    getClasses: vi.fn(),
    getRaces: vi.fn(),
    getSpells: vi.fn(),
    getBackgrounds: vi.fn(),
    getStatus: vi.fn(),
    getRacesForFrontend: vi.fn().mockResolvedValue({}),
    getAdvancement: vi.fn().mockResolvedValue({}),
    getAllMulticlassData: vi.fn().mockResolvedValue({}),
  },
}));

import { compendiumService } from '../../services/compendiumService';
const svc = compendiumService as Record<string, ReturnType<typeof vi.fn>>;

const mockClasses = [{ name: 'Fighter', hit_die: 10 }];
const mockRaces = [{ name: 'Human', speed: 30 }];

beforeEach(() => {
  vi.clearAllMocks();
})

describe('useClasses', () => {
  it('starts in loading state', () => {
    svc.getClasses.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useClasses());
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
  });

  it('returns data on success', async () => {
    svc.getClasses.mockResolvedValue({ classes: mockClasses });
    const { result } = renderHook(() => useClasses());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(mockClasses);
    expect(result.current.error).toBeNull();
  });

  it('sets error on failure', async () => {
    svc.getClasses.mockRejectedValue(new Error('Server down'));
    const { result } = renderHook(() => useClasses());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Server down');
    expect(result.current.data).toBeNull();
  });

  it('uses "Unknown error" for non-Error rejections', async () => {
    svc.getClasses.mockRejectedValue('string error');
    const { result } = renderHook(() => useClasses());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Unknown error');
  });

  it('refetch re-fetches data', async () => {
    svc.getClasses.mockResolvedValue({ classes: mockClasses });
    const { result } = renderHook(() => useClasses());
    await waitFor(() => expect(result.current.loading).toBe(false));
    svc.getClasses.mockResolvedValue({ classes: [{ name: 'Wizard', hit_die: 6 }] });
    await result.current.refetch();
    expect(svc.getClasses).toHaveBeenCalledTimes(2);
  });
});

describe('useRaces', () => {
  it('returns races data on success', async () => {
    svc.getRaces.mockResolvedValue({ races: mockRaces });
    const { result } = renderHook(() => useRaces());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(mockRaces);
  });

  it('sets error on failure', async () => {
    svc.getRaces.mockRejectedValue(new Error('timeout'));
    const { result } = renderHook(() => useRaces());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('timeout');
  });
});

describe('useBackgrounds', () => {
  it('returns backgrounds data on success', async () => {
    svc.getBackgrounds.mockResolvedValue({ backgrounds: [{ name: 'Soldier' }] });
    const { result } = renderHook(() => useBackgrounds());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([{ name: 'Soldier' }]);
  });
});

describe('useCompendiumStatus', () => {
  it('returns status on success', async () => {
    svc.getStatus.mockResolvedValue({ available: true });
    const { result } = renderHook(() => useCompendiumStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ available: true });
  });

  it('sets error on failure', async () => {
    svc.getStatus.mockRejectedValue(new Error('unreachable'));
    const { result } = renderHook(() => useCompendiumStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('unreachable');
  });
});

describe('useClassSpells', () => {
  it('returns empty array immediately when className is empty', async () => {
    const { result } = renderHook(() => useClassSpells(''));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([]);
  });

  it('fetches spells for given class', async () => {
    const spells = { 'fireball': { name: 'Fireball', level: 3 } };
    svc.getSpells.mockResolvedValue({ spells });
    const { result } = renderHook(() => useClassSpells('Wizard'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toHaveLength(1);
  });

  it('sets error when spell fetch fails', async () => {
    svc.getSpells.mockRejectedValue(new Error('fetch failed'));
    const { result } = renderHook(() => useClassSpells('Fighter'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('fetch failed');
  });
});
