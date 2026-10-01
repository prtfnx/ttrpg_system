import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaintControllerProvider, usePaintController } from '../PaintControllerProvider';

const mocks = vi.hoisted(() => ({
  activeTableId: 'table-1' as string | null,
  activeTool: 'paint',
  actorId: 42,
  sessionRole: 'owner',
  protocol: {},
  runtime: {},
  runtimeStatus: { isCanvasAttached: false, isContextLost: false },
  controller: {
    connectEvents: vi.fn(() => vi.fn()),
    subscribe: vi.fn((listener: (state: object) => void) => {
      listener({ tableId: 'table-1', revision: 3, committed: [] });
      return vi.fn();
    }),
    selectTable: vi.fn(),
    tick: vi.fn(),
    restoreRenderer: vi.fn(),
    dispose: vi.fn(),
  },
  constructor: vi.fn(),
  interaction: {
    subscribe: vi.fn((listener: (state: object) => void) => {
      listener({ enabled: true, tool: 'draw', selected: null });
      return vi.fn();
    }),
    setActor: vi.fn(),
    setEnabled: vi.fn(),
    dispose: vi.fn(),
  },
  interactionConstructor: vi.fn(),
}));

vi.mock('@app/providers', () => ({
  useOptionalProtocol: () => ({ protocol: mocks.protocol }),
}));

vi.mock('@/store', () => ({
  useGameStore: (selector: (state: object) => unknown) => (
    selector({
      activeTableId: mocks.activeTableId,
      activeTool: mocks.activeTool,
      userId: mocks.actorId,
      sessionRole: mocks.sessionRole,
    })
  ),
}));

vi.mock('@lib/wasm/runtime', () => ({
  useWasmRuntime: () => mocks.runtime,
  useWasmStatus: () => mocks.runtimeStatus,
}));

vi.mock('../PaintController', () => ({
  PaintController: vi.fn(function () {
    mocks.constructor();
    return mocks.controller;
  }),
}));

vi.mock('../PaintInteractionController', () => ({
  PaintInteractionController: vi.fn(function () {
    mocks.interactionConstructor();
    return mocks.interaction;
  }),
}));

vi.mock('react-toastify', () => ({ toast: { error: vi.fn() } }));

function Consumer() {
  const { controller, state } = usePaintController();
  return <output>{controller ? `${state.tableId}:${state.revision}` : 'offline'}</output>;
}

describe('PaintControllerProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mocks.activeTableId = 'table-1';
    mocks.runtimeStatus = { isCanvasAttached: false, isContextLost: false };
  });

  it('owns one controller, selects the active table, and advances expiry checks', () => {
    const { unmount } = render(
      <PaintControllerProvider><Consumer /></PaintControllerProvider>,
    );

    expect(screen.getByText('table-1:3')).toBeInTheDocument();
    expect(mocks.constructor).toHaveBeenCalledOnce();
    expect(mocks.controller.connectEvents).toHaveBeenCalledOnce();
    expect(mocks.controller.selectTable).toHaveBeenCalledWith('table-1');
    expect(mocks.interaction.setActor).toHaveBeenCalledWith(42, true);
    expect(mocks.interaction.setEnabled).toHaveBeenCalledWith(true);

    act(() => vi.advanceTimersByTime(500));
    expect(mocks.controller.tick).toHaveBeenCalledTimes(2);

    unmount();
    expect(mocks.controller.dispose).toHaveBeenCalledOnce();
    expect(mocks.interaction.dispose).toHaveBeenCalledOnce();
  });

  it('restores confirmed objects after a canvas is attached', () => {
    mocks.runtimeStatus = { isCanvasAttached: true, isContextLost: false };
    render(<PaintControllerProvider><Consumer /></PaintControllerProvider>);
    expect(mocks.controller.restoreRenderer).toHaveBeenCalledOnce();
  });
});
