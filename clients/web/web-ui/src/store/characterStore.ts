import { create } from 'zustand';

export interface Character {
  id: string;
  name: string;
  class: string;
  stats: {
    strength: number;
    dexterity: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
  };
  inventory: string[];
  conditions: string[];
}

interface CharacterState {
  characters: Character[];
  addCharacter: (character: Omit<Character, 'id'>) => void;
  removeCharacter: (id: string) => void;
  updateCharacter: (id: string, updates: Partial<Character>) => void;
}

export const useCharacterStore = create<CharacterState>((set, _get) => ({
  characters: [],
  addCharacter: (character) => {
    const id = `char_${Date.now()}`;
    set((state) => ({
      characters: [...state.characters, { ...character, id }],
    }));
  },
  removeCharacter: (id) => {
    set((state) => ({
      characters: state.characters.filter((c) => c.id !== id),
    }));
  },
  updateCharacter: (id, updates) => {
    set((state) => ({
      characters: state.characters.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    }));
  },
}));
