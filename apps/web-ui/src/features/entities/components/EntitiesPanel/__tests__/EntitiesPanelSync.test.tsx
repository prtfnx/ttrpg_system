import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useGameStore } from '@/store';
import { createMockWasmRuntime, renderWithWasmRuntime } from '@test/utils/wasmRuntimeTestUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EntitiesPanel } from '@features/canvas';

// Mock sprites that will be returned from WASM and stored in the store
const mockSprites = [
  { id: 's1', name: 'Goblin', x: 100, y: 150, layer: 'tokens', visible: true },
  { id: 's2', name: 'Orc', x: 200, y: 50, layer: 'tokens', visible: true }
];

describe('EntitiesPanel sprite sync', () => {
  beforeEach(() => {
    useGameStore.setState({
      sprites: [],
      selectedSprites: [],
      sessionRole: null,
      visibleLayers: [],
    });
  });

  it('syncs sprites from table sync and displays them', async () => {
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

    const goblinButton = screen.getByRole('button', { name: /Goblin/ });
    expect(goblinButton).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(goblinButton);
    expect(useGameStore.getState().selectedSprites).toEqual(['s1']);
  });

  it('debounces sprite events and cancels pending sync on unmount', () => {
    vi.useFakeTimers();
    const getSprites = vi.fn(() => mockSprites);
    const { unmount } = renderWithWasmRuntime(
      <EntitiesPanel />,
      createMockWasmRuntime({
        getTableSync: vi.fn(() => ({ get_sprites: getSprites }) as never),
      }),
    );
    expect(getSprites).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new CustomEvent('spriteAdded'));
      window.dispatchEvent(new CustomEvent('spriteAdded'));
      window.dispatchEvent(new CustomEvent('spriteAdded'));
      vi.advanceTimersByTime(499);
    });
    expect(getSprites).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(1));
    expect(getSprites).toHaveBeenCalledTimes(2);

    act(() => window.dispatchEvent(new CustomEvent('spriteAdded')));
    unmount();
    act(() => vi.advanceTimersByTime(500));
    expect(getSprites).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
