/**
 * React hooks for D&D 5e Compendium data
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { compendiumService, type CharacterClass, type CompendiumStatus, type Race, type Spell } from '../services/compendiumService';

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
export function useRacesForCharacterWizard(): UseCompendiumDataState<Record<string, any>> {
  const [state, setState] = useState<UseCompendiumDataState<Record<string, any>>>({
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