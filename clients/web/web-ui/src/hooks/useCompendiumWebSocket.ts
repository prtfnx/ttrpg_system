/**
 * Compendium WebSocket hooks
 * Uses protocol for all compendium operations (Phase 2.1)
 * 
 * NOTE: These hooks are not currently used by SpellsTab.
 * SpellsTab uses protocol.updateCharacter() directly.
 * This file will be implemented properly in Phase 3.
 */

import { useCallback, useEffect, useState } from 'react';
import { useProtocol } from '../services/ProtocolContext';

interface Spell {
  name: string;
  level: number;
  school: string;
  casting_time: string;
  range: string;
  components: {
    verbal: boolean;
    somatic: boolean;
    material: boolean;
    materials_needed?: string;
  };
  duration: string;
  description: string;
  damage_type?: string;
  is_ritual: boolean;
  requires_concentration: boolean;
}

interface Monster {
  name: string;
  type: string;
  size: string;
  cr: string;
  hp: number;
  ac: number;
  is_legendary: boolean;
}

interface Equipment {
  name: string;
  type: string;
  rarity: string;
  is_magic: boolean;
  requires_attunement: boolean;
  cost?: string;
}

interface CharacterClass {
  name: string;
  hit_die: number;
  primary_ability: string;
  saving_throws: string[];
  spellcasting_ability?: string;
}

interface SearchResults {
  spells: Spell[];
  equipment: Equipment[];
  monsters: Monster[];
  classes: CharacterClass[];
}

interface CompendiumStats {
  total_spells: number;
  total_classes: number;
  total_equipment: number;
  total_monsters: number;
  cantrips: number;
  ritual_spells: number;
  magic_items: number;
  legendary_monsters: number;
}

export function useCompendiumSearch() {
  const { protocol } = useProtocol();
  const [results, setResults] = useState<SearchResults | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (_query: string, _category?: string) => {
    if (!protocol) {
      setError('Protocol not connected');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // TODO: Implement using protocol.sendMessage() and event listeners
      // For now, this is a stub - SpellsTab doesn't use this hook
      console.warn('useCompendiumSearch not yet implemented');
      setResults({ spells: [], monsters: [], equipment: [], classes: [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsLoading(false);
    }
  }, [protocol]);

  return { search, results, isLoading, error };
}

export function useSpellDetail(spellName: string | null) {
  const { protocol } = useProtocol();
  const [spell, setSpell] = useState<Spell | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!protocol || !spellName) return;

    const fetchSpell = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // TODO: Implement using protocol.sendMessage() and event listeners
        console.warn('useSpellDetail not yet implemented');
        setSpell(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch spell');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSpell();
  }, [protocol, spellName]);

  return { spell, isLoading, error };
}

export function useMonsterDetail(monsterName: string | null) {
  const { protocol } = useProtocol();
  const [monster, setMonster] = useState<Monster | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!protocol || !monsterName) return;

    const fetchMonster = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // TODO: Implement using protocol.sendMessage() and event listeners
        console.warn('useMonsterDetail not yet implemented');
        setMonster(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch monster');
      } finally {
        setIsLoading(false);
      }
    };

    fetchMonster();
  }, [protocol, monsterName]);

  return { monster, isLoading, error };
}

export function useCompendiumStats() {
  const { protocol } = useProtocol();
  const [stats, setStats] = useState<CompendiumStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!protocol) {
      setError('Protocol not connected');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // TODO: Implement using protocol.sendMessage() and event listeners
      console.warn('useCompendiumStats not yet implemented');
      setStats(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch stats');
    } finally {
      setIsLoading(false);
    }
  }, [protocol]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { stats, isLoading, error, refetch: fetch };
}

export function useCharacterCreationData() {
  const { protocol } = useProtocol();
  const [data, setData] = useState<{
    classes: CharacterClass[];
    cantrips: Spell[];
    level_1_spells: Spell[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!protocol) {
      setError('Protocol not connected');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // TODO: Implement using protocol.sendMessage() and event listeners
      console.warn('useCharacterCreationData not yet implemented');
      setData(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch character data');
    } finally {
      setIsLoading(false);
    }
  }, [protocol]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, isLoading, error, refetch: fetch };
}
