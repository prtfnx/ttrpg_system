import { useGameStore } from '@/store';
import type { Character } from '@/types';
import { useProtocol } from '@lib/api';
import { applyJsonMergePatch } from '@shared/utils/jsonMergePatch';
import { useCallback } from 'react';

export type CharacterUpdateDisposition = 'sent' | 'queued' | 'local' | 'rejected';

/**
 * The single edit command shared by the panel and modeless character sheets.
 * The protocol owns correlation, reconnect queuing, acknowledgement, and the
 * one conflict retry; UI surfaces only stage optimistic state.
 */
export function useCharacterUpdateCommand() {
  const { protocol, isConnected, connectionState, connectionError } = useProtocol();

  const submitCharacterUpdate = useCallback((
    characterId: string,
    updates: Partial<Character>,
  ): CharacterUpdateDisposition => {
    const store = useGameStore.getState();
    const character = store.characters.find(candidate => candidate.id === characterId);
    if (!character) return 'rejected';
    const optimistic = applyJsonMergePatch(character, updates) as Character;

    if (!protocol) {
      store.updateCharacter(characterId, { ...optimistic, syncStatus: 'local' });
      return 'local';
    }

    store.updateCharacter(characterId, { ...optimistic, syncStatus: 'syncing' });
    const accepted = protocol.updateCharacter(
      characterId,
      updates as Record<string, unknown>,
      character.version,
    );
    if (!accepted) {
      store.updateCharacter(characterId, { syncStatus: 'error' });
      return 'rejected';
    }

    return isConnected ? 'sent' : 'queued';
  }, [isConnected, protocol]);

  return {
    submitCharacterUpdate,
    connectionState,
    connectionError,
    isConnected,
  };
}
