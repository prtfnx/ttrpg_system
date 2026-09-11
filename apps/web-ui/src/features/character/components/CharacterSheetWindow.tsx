import { useGameStore } from '@/store';
import type { Character } from '@/types';
import { useCharacterUpdateCommand } from '@features/character/hooks/useCharacterUpdateCommand';
import { CharacterSheet } from './CharacterSheetNew';

interface CharacterSheetWindowProps {
  characterId: string;
  onClose?: () => void;
}

// Wrapper that runs inside a FloatingWindow — fetches char from store, renders CharacterSheet
export function CharacterSheetWindow({ characterId }: CharacterSheetWindowProps) {
  const character = useGameStore(s => s.characters.find(c => c.id === characterId) ?? null);
  const { submitCharacterUpdate } = useCharacterUpdateCommand();

  const handleSave = (updates: Partial<Character>) => {
    submitCharacterUpdate(characterId, updates);
  };

  return <CharacterSheet character={character} onSave={handleSave} />;
}
