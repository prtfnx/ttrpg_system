import { useGameStore } from '@/store';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CharacterSheetWindow } from '../CharacterSheetWindow';

vi.mock('@/store', () => ({
  useGameStore: vi.fn(),
}));

vi.mock('../CharacterPanel/useCharacterPanel', () => ({
  useCharacterPanel: vi.fn(() => ({
    updateCharacter: vi.fn(),
    protocol: null,
    isConnected: false,
  })),
}));

vi.mock('../CharacterSheetNew', () => ({
  CharacterSheet: ({ character }: { character: { name: string } | null }) => (
    <div data-testid="char-sheet">{character ? character.name : 'no character'}</div>
  ),
}));

const mockChar = {
  id: 'c1',
  name: 'Thorin',
  version: 1,
  syncStatus: 'synced',
};

describe('CharacterSheetWindow', () => {
  it('passes found character to CharacterSheet', () => {
    vi.mocked(useGameStore).mockImplementation((sel: (s: ReturnType<typeof useGameStore.getState>) => unknown) =>
      sel({ characters: [mockChar] } as unknown as ReturnType<typeof useGameStore.getState>)
    );
    render(<CharacterSheetWindow characterId="c1" />);
    expect(screen.getByTestId('char-sheet')).toHaveTextContent('Thorin');
  });

  it('passes null when character not found', () => {
    vi.mocked(useGameStore).mockImplementation((sel: (s: ReturnType<typeof useGameStore.getState>) => unknown) =>
      sel({ characters: [] } as unknown as ReturnType<typeof useGameStore.getState>)
    );
    render(<CharacterSheetWindow characterId="unknown" />);
    expect(screen.getByTestId('char-sheet')).toHaveTextContent('no character');
  });
});
