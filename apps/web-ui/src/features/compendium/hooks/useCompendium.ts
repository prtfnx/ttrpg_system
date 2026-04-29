/**
 * React hooks for D&D 5e Compendium data
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { compendiumService, type AdvancementConfig, type Background, type CharacterClass, type ClassMulticlassData, type CompendiumStatus, type Feat, type Race, type Spell, type Subclass } from '../services/compendiumService';

export interface UseCompendiumDataState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to get compendium status
 */
export function useCompendiumStatus(): UseCompendiumDataState<CompendiumStatus> {
  const [state, setState] = useState<UseCompendiumDataState<CompendiumStatus>>({
    data: null,
    loading: true,
    error: null,
    refetch: async () => {}
  });

  const fetchStatus = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const status = await compendiumService.getStatus();
      setState(prev => ({ ...prev, data: status, loading: false }));
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        error: error instanceof Error ? error.message : 'Unknown error',
        loading: false 
      }));
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Return state with refetch function using useMemo to avoid infinite re-renders
  return useMemo(() => ({ ...state, refetch: fetchStatus }), [state, fetchStatus]);
}

/**
 * Hook to get all races
 */
export function useRaces(): UseCompendiumDataState<Race[]> {
  const [state, setState] = useState<UseCompendiumDataState<Race[]>>({
    data: null,
    loading: true,
    error: null,
    refetch: async () => {}
  });

  const fetchRaces = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const response = await compendiumService.getRaces();
      setState(prev => ({ ...prev, data: response.races, loading: false }));
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        error: error instanceof Error ? error.message : 'Unknown error',
        loading: false 
      }));
    }
  }, []);

  useEffect(() => {
    fetchRaces();
  }, [fetchRaces]);

  // Return state with refetch function using useMemo to avoid infinite re-renders
  return useMemo(() => ({ ...state, refetch: fetchRaces }), [state, fetchRaces]);
}

/**
 * Hook to get races in frontend format (compatible with existing character wizard)
 */
export function useRacesForCharacterWizard(): UseCompendiumDataState<Record<string, unknown>> {
  const [state, setState] = useState<UseCompendiumDataState<Record<string, unknown>>>({
    data: null,
    loading: true,
    error: null,
    refetch: async () => {}
  });

  const fetchRaces = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const races = await compendiumService.getRacesForFrontend();
      setState(prev => ({ ...prev, data: races, loading: false }));
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        error: error instanceof Error ? error.message : 'Unknown error',
        loading: false 
      }));
    }
  }, []);

  useEffect(() => {
    fetchRaces();
  }, [fetchRaces]);

  // Return state with refetch function using useMemo to avoid infinite re-renders
  return useMemo(() => ({ ...state, refetch: fetchRaces }), [state, fetchRaces]);
}

/**
 * Hook to get all classes
 */
export function useClasses(): UseCompendiumDataState<CharacterClass[]> {
  const [state, setState] = useState<UseCompendiumDataState<CharacterClass[]>>({
    data: null,
    loading: true,
    error: null,
    refetch: async () => {}
  });

  const fetchClasses = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const response = await compendiumService.getClasses();
      setState(prev => ({ ...prev, data: response.classes, loading: false }));
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        error: error instanceof Error ? error.message : 'Unknown error',
        loading: false 
      }));
    }
  }, []);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  // Return state with refetch function using useMemo to avoid infinite re-renders
  return useMemo(() => ({ ...state, refetch: fetchClasses }), [state, fetchClasses]);
}

/**
 * Hook to get all backgrounds
 */
export function useBackgrounds(): UseCompendiumDataState<Background[]> {
  const [state, setState] = useState<UseCompendiumDataState<Background[]>>({
    data: null,
    loading: true,
    error: null,
    refetch: async () => {}
  });

  const fetchBackgrounds = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const response = await compendiumService.getBackgrounds();
      setState(prev => ({ ...prev, data: response.backgrounds, loading: false }));
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        error: error instanceof Error ? error.message : 'Unknown error',
        loading: false 
      }));
    }
  }, []);

  useEffect(() => {
    fetchBackgrounds();
  }, [fetchBackgrounds]);

  // Return state with refetch function using useMemo to avoid infinite re-renders
  return useMemo(() => ({ ...state, refetch: fetchBackgrounds }), [state, fetchBackgrounds]);
}

/**
 * Hook to get spells with optional filtering
 */
export function useSpells(filters: {
  level?: number;
  school?: string;
  class?: string;
  limit?: number;
} = {}): UseCompendiumDataState<Record<string, Spell>> {
  const [state, setState] = useState<UseCompendiumDataState<Record<string, Spell>>>({
    data: null,
    loading: true,
    error: null,
    refetch: async () => {}
  });

  const fetchSpells = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const response = await compendiumService.getSpells(filters);
      setState(prev => ({ ...prev, data: response.spells, loading: false }));
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        error: error instanceof Error ? error.message : 'Unknown error',
        loading: false 
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: filters excluded to prevent re-subscription loop
  }, [filters.level, filters.school, filters.class, filters.limit]);

  useEffect(() => {
    fetchSpells();
  }, [fetchSpells]);

  // Return state with refetch function using useMemo to avoid infinite re-renders
  return useMemo(() => ({ ...state, refetch: fetchSpells }), [state, fetchSpells]);
}

/**
 * Hook to get a specific race by name
 */
export function useRace(raceName: string | null): UseCompendiumDataState<Race> {
  const [state, setState] = useState<UseCompendiumDataState<Race>>({
    data: null,
    loading: !!raceName,
    error: null,
    refetch: async () => {}
  });

  const fetchRace = useCallback(async () => {
    if (!raceName) {
      setState(prev => ({ ...prev, data: null, loading: false }));
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const race = await compendiumService.getRace(raceName);
      setState(prev => ({ ...prev, data: race, loading: false }));
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        error: error instanceof Error ? error.message : 'Unknown error',
        loading: false 
      }));
    }
  }, [raceName]);

  useEffect(() => {
    fetchRace();
  }, [fetchRace]);

  // Return state with refetch function using useMemo to avoid infinite re-renders
  return useMemo(() => ({ ...state, refetch: fetchRace }), [state, fetchRace]);
}

/**
 * Hook to get a specific class by name
 */
export function useClass(className: string | null): UseCompendiumDataState<CharacterClass> {
  const [state, setState] = useState<UseCompendiumDataState<CharacterClass>>({
    data: null,
    loading: !!className,
    error: null,
    refetch: async () => {}
  });

  const fetchClass = useCallback(async () => {
    if (!className) {
      setState(prev => ({ ...prev, data: null, loading: false }));
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const charClass = await compendiumService.getClass(className);
      setState(prev => ({ ...prev, data: charClass, loading: false }));
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        error: error instanceof Error ? error.message : 'Unknown error',
        loading: false 
      }));
    }
  }, [className]);

  useEffect(() => {
    fetchClass();
  }, [fetchClass]);

  // Return state with refetch function using useMemo to avoid infinite re-renders
  return useMemo(() => ({ ...state, refetch: fetchClass }), [state, fetchClass]);
}

/**
 * Hook to get a specific spell by name
 */
export function useSpell(spellName: string | null): UseCompendiumDataState<Spell> {
  const [state, setState] = useState<UseCompendiumDataState<Spell>>({
    data: null,
    loading: !!spellName,
    error: null,
    refetch: async () => {}
  });

  const fetchSpell = useCallback(async () => {
    if (!spellName) {
      setState(prev => ({ ...prev, data: null, loading: false }));
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const spell = await compendiumService.getSpell(spellName);
      setState(prev => ({ ...prev, data: spell, loading: false }));
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        error: error instanceof Error ? error.message : 'Unknown error',
        loading: false 
      }));
    }
  }, [spellName]);

  useEffect(() => {
    fetchSpell();
  }, [fetchSpell]);

  // Return state with refetch function using useMemo to avoid infinite re-renders
  return useMemo(() => ({ ...state, refetch: fetchSpell }), [state, fetchSpell]);
}

/**
 * Hook to get all feats with optional filtering
 */
export function useFeats(filters: {
  prerequisite?: string;
  source?: string;
} = {}): UseCompendiumDataState<Feat[]> {
  const [state, setState] = useState<UseCompendiumDataState<Feat[]>>({
    data: null,
    loading: true,
    error: null,
    refetch: async () => {}
  });

  const fetchFeats = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const response = await compendiumService.getFeats(filters);
      setState(prev => ({ ...prev, data: response.feats, loading: false }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Unknown error',
        loading: false
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: filters excluded to prevent re-subscription loop
  }, [filters.prerequisite, filters.source]);

  useEffect(() => { fetchFeats(); }, [fetchFeats]);

  return useMemo(() => ({ ...state, refetch: fetchFeats }), [state, fetchFeats]);
}

/**
 * Hook to get subclasses for a specific class
 */
export function useSubclasses(className: string | null): UseCompendiumDataState<Subclass[]> {
  const [state, setState] = useState<UseCompendiumDataState<Subclass[]>>({
    data: null,
    loading: !!className,
    error: null,
    refetch: async () => {}
  });

  const fetchSubclasses = useCallback(async () => {
    if (!className) {
      setState(prev => ({ ...prev, data: null, loading: false }));
      return;
    }
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const response = await compendiumService.getSubclasses(className);
      setState(prev => ({ ...prev, data: response.subclasses, loading: false }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Unknown error',
        loading: false
      }));
    }
  }, [className]);

  useEffect(() => { fetchSubclasses(); }, [fetchSubclasses]);

  return useMemo(() => ({ ...state, refetch: fetchSubclasses }), [state, fetchSubclasses]);
}

export function useAdvancementData(): UseCompendiumDataState<AdvancementConfig> {
  const [state, setState] = useState<UseCompendiumDataState<AdvancementConfig>>({
    data: null, loading: true, error: null, refetch: async () => {}
  });

  const fetch = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const data = await compendiumService.getAdvancement();
      setState(prev => ({ ...prev, data, loading: false }));
    } catch (error) {
      setState(prev => ({ ...prev, error: error instanceof Error ? error.message : 'Unknown error', loading: false }));
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return useMemo(() => ({ ...state, refetch: fetch }), [state, fetch]);
}

export function useClassPrerequisites(): UseCompendiumDataState<Record<string, ClassMulticlassData>> {
  const [state, setState] = useState<UseCompendiumDataState<Record<string, ClassMulticlassData>>>({
    data: null, loading: true, error: null, refetch: async () => {}
  });

  const fetch = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const data = await compendiumService.getAllMulticlassData();
      setState(prev => ({ ...prev, data, loading: false }));
    } catch (error) {
      setState(prev => ({ ...prev, error: error instanceof Error ? error.message : 'Unknown error', loading: false }));
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return useMemo(() => ({ ...state, refetch: fetch }), [state, fetch]);
}

export function useClassSpells(className: string, level?: number): UseCompendiumDataState<Spell[]> {
  const [state, setState] = useState<UseCompendiumDataState<Spell[]>>({
    data: null, loading: !!className, error: null, refetch: async () => {}
  });

  const fetch = useCallback(async () => {
    if (!className) {
      setState(prev => ({ ...prev, data: [], loading: false }));
      return;
    }
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const response = await compendiumService.getSpells({ class: className, level });
      setState(prev => ({ ...prev, data: Object.values(response.spells), loading: false }));
    } catch (error) {
      setState(prev => ({ ...prev, error: error instanceof Error ? error.message : 'Unknown error', loading: false }));
    }
  }, [className, level]);

  useEffect(() => { fetch(); }, [fetch]);
  return useMemo(() => ({ ...state, refetch: fetch }), [state, fetch]);
}
