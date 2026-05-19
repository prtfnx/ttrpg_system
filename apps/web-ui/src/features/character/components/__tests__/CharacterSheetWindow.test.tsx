import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CharacterSheetWindow } from '../CharacterSheetWindow';
import { useGameStore } from '@/store';

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
  CharacterSheet: ({ character }: any) => (
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
    vi.mocked(useGameStore).mockImplementation((sel: any) =>
      sel({ characters: [mockChar] })
    );
    render(<CharacterSheetWindow characterId="c1" />);
    expect(screen.getByTestId('char-sheet')).toHaveTextContent('Thorin');
  });

  it('passes null when character not found', () => {
    vi.mocked(useGameStore).mockImplementation((sel: any) =>
      sel({ characters: [] })
    );
    render(<CharacterSheetWindow characterId="unknown" />);
    expect(screen.getByTestId('char-sheet')).toHaveTextContent('no character');
  });
});
