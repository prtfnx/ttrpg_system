import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const character = {
    id: 'character-1',
    sessionId: 'ROOM',
    name: 'Hero',
    ownerId: 1,
    controlledBy: [],
    data: { stats: { hp: 10 } },
    version: 4,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    syncStatus: 'synced' as const,
  };
  const state = {
    characters: [character],
    updateCharacter: vi.fn((id: string, updates: Record<string, unknown>) => {
      const index = state.characters.findIndex(candidate => candidate.id === id);
      if (index >= 0) state.characters[index] = { ...state.characters[index], ...updates } as typeof character;
    }),
  };
  return {
    state,
    protocol: { updateCharacter: vi.fn(() => true) },
    context: {
      protocol: null as { updateCharacter: ReturnType<typeof vi.fn> } | null,
      isConnected: false,
      connectionState: 'disconnected',
      connectionError: null as string | null,
    },
  };
});

vi.mock('@/store', () => ({
  useGameStore: { getState: () => mocks.state },
}));

vi.mock('@lib/api', () => ({ useProtocol: () => mocks.context }));

import { useCharacterUpdateCommand } from '../useCharacterUpdateCommand';

describe('useCharacterUpdateCommand', () => {
  beforeEach(() => {
    mocks.state.characters[0] = {
      ...mocks.state.characters[0],
      name: 'Hero',
      version: 4,
      syncStatus: 'synced',
    };
    mocks.state.updateCharacter.mockClear();
    mocks.protocol.updateCharacter.mockClear();
    mocks.protocol.updateCharacter.mockReturnValue(true);
    mocks.context.protocol = null;
    mocks.context.isConnected = false;
    mocks.context.connectionState = 'disconnected';
  });

  it('queues an edit through the existing protocol while reconnecting', () => {
    mocks.context.protocol = mocks.protocol;
    mocks.context.connectionState = 'reconnecting';
    const { result } = renderHook(() => useCharacterUpdateCommand());

    let disposition: string | undefined;
    act(() => {
      disposition = result.current.submitCharacterUpdate('character-1', { name: 'Edited' });
    });

    expect(disposition).toBe('queued');
    expect(mocks.protocol.updateCharacter).toHaveBeenCalledWith(
      'character-1',
      { name: 'Edited' },
      4,
    );
    expect(mocks.state.characters[0]).toMatchObject({ name: 'Edited', syncStatus: 'syncing' });
  });

  it('marks an edit as page-local when no protocol exists', () => {
    const { result } = renderHook(() => useCharacterUpdateCommand());

    let disposition: string | undefined;
    act(() => {
      disposition = result.current.submitCharacterUpdate('character-1', { name: 'Local edit' });
    });

    expect(disposition).toBe('local');
    expect(mocks.protocol.updateCharacter).not.toHaveBeenCalled();
    expect(mocks.state.characters[0]).toMatchObject({ name: 'Local edit', syncStatus: 'local' });
  });
});
