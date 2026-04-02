import { useGameStore } from '@/store';
import type { Character } from '@/types';
import { CharacterSheet } from './CharacterSheetNew';
import { useCharacterPanel } from './CharacterPanel/useCharacterPanel';

interface CharacterSheetWindowProps {
  characterId: string;
  onClose?: () => void;
}

// Wrapper that runs inside a FloatingWindow — fetches char from store, renders CharacterSheet
export function CharacterSheetWindow({ characterId }: CharacterSheetWindowProps) {
  const character = useGameStore(s => s.characters.find(c => c.id === characterId) ?? null);
  const { updateCharacter, protocol, isConnected } = useCharacterPanel();

  const handleSave = (updates: Partial<Character>) => {
    updateCharacter(characterId, updates);
    if (protocol && isConnected && character) {
      updateCharacter(characterId, { syncStatus: 'syncing' });
      protocol.updateCharacter(characterId, updates, character.version);
    }
  };

  return <CharacterSheet character={character} onSave={handleSave} />;
}
