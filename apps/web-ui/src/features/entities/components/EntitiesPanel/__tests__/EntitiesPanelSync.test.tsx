import { useGameStore } from '@/store';
import { EntitiesPanel } from '@features/canvas';
import { createMockWasmRuntime, renderWithWasmRuntime } from '@test/utils/wasmRuntimeTestUtils';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

const TABLE_ID = '550e8400-e29b-41d4-a716-446655440000';

const sprites = [
  {
    id: 's1', name: 'Goblin', tableId: TABLE_ID, x: 100, y: 150,
    layer: 'tokens', texture: '', scale: { x: 1, y: 1 }, rotation: 0,
  },
  {
    id: 's2', name: 'Orc', tableId: TABLE_ID, x: 200, y: 50,
    layer: 'tokens', texture: '', scale: { x: 1, y: 1 }, rotation: 0,
  },
];

describe('EntitiesPanel authoritative synchronization', () => {
  beforeEach(() => {
    useGameStore.setState({
      sprites,
      selectedSprites: [],
      activeTableId: TABLE_ID,
      sessionRole: null,
      visibleLayers: [],
    });
  });

  it('renders the store snapshot after the same table is hydrated', async () => {
    const runtime = createMockWasmRuntime();
    runtime.store.setSnapshot({ hydratedTableId: TABLE_ID, frameTableId: TABLE_ID });
    renderWithWasmRuntime(<EntitiesPanel />, runtime);

    expect(screen.getByText('Synchronized')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /entities \(2\)/i })).toBeInTheDocument();
    const goblinButton = screen.getByRole('button', { name: /Goblin/ });
    await userEvent.click(goblinButton);
    expect(useGameStore.getState().selectedSprites).toEqual(['s1']);
  });

  it('never reads or deletes entities from the disconnected standalone TableSync', () => {
    const runtime = createMockWasmRuntime();
    renderWithWasmRuntime(<EntitiesPanel />, runtime);

    expect(runtime.getTableSync).not.toHaveBeenCalled();
    expect(useGameStore.getState().sprites).toHaveLength(2);
    expect(screen.getByText('Loading table…')).toBeInTheDocument();

    act(() => runtime.store.setSnapshot({
      hydratedTableId: TABLE_ID,
      tableHydrationError: null,
    }));
    expect(useGameStore.getState().sprites).toHaveLength(2);
    expect(screen.getByText('Synchronized')).toBeInTheDocument();
  });
});
