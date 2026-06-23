import { screen, waitFor } from '@testing-library/react';
import { createMockWasmRuntime, renderWithWasmRuntime } from '@test/utils/wasmRuntimeTestUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EntitiesPanel } from '@features/canvas';

// Mock sprites that will be returned from WASM and stored in the store
const mockSprites = [
  { id: 's1', name: 'Goblin', x: 100, y: 150, layer: 'tokens', visible: true },
  { id: 's2', name: 'Orc', x: 200, y: 50, layer: 'tokens', visible: true }
];

// Mock the game store with sprites
const mockAddSprite = vi.fn();
const mockStore = {
  sprites: [] as unknown[],
  selectedSprites: [],
  selectSprite: vi.fn(),
  addSprite: mockAddSprite,
  removeSprite: vi.fn(),
  updateSprite: vi.fn()
};

vi.mock('../store', () => ({
  useGameStore: vi.fn(() => mockStore)
}));

describe('EntitiesPanel sprite sync', () => {
  beforeEach(() => {
    // Reset sprites before each test
    mockStore.sprites = [];
    mockAddSprite.mockClear();
  });

  it('syncs sprites from table sync and displays them', async () => {
    // Simulate addSprite actually adding to the store
    mockAddSprite.mockImplementation((sprite) => {
      mockStore.sprites.push(sprite);
    });

    renderWithWasmRuntime(
      <EntitiesPanel />,
      createMockWasmRuntime({
        getTableSync: vi.fn(() => ({ get_sprites: () => mockSprites }) as never),
      }),
    );

    // Wait for sync to complete and UI to update
    await waitFor(() => {
      // header includes Entities (N)
      expect(screen.getByRole('heading', { name: /entities \(2\)/i })).toBeInTheDocument();
      expect(screen.getByText(/Goblin/i)).toBeInTheDocument();
      expect(screen.getByText(/Orc/i)).toBeInTheDocument();
    });
  });
});
