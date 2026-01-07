/**
 * CharacterSheetContext - Global state for character sheet modal
 * Persists across tab changes in RightPanel
 */

import React, { createContext, useContext, useState } from 'react';

interface CharacterSheetContextValue {
  viewSheetCharId: string | null;
  setViewSheetCharId: (charId: string | null) => void;
}

const CharacterSheetContext = createContext<CharacterSheetContextValue | undefined>(undefined);

export function CharacterSheetProvider({ children }: { children: React.ReactNode }) {
  const [viewSheetCharId, setViewSheetCharId] = useState<string | null>(null);

  return (
    <CharacterSheetContext.Provider value={{ viewSheetCharId, setViewSheetCharId }}>
      {children}
    </CharacterSheetContext.Provider>
  );
}

export function useCharacterSheet() {
  const context = useContext(CharacterSheetContext);
  if (!context) {
    throw new Error('useCharacterSheet must be used within CharacterSheetProvider');
  }
  return context;
}
