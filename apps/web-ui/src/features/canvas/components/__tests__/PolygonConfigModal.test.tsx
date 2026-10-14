import { useGameStore } from '@/store';
import type { SessionRole } from '@features/session/types/roles';
import { MessageType, type Message } from '@lib/websocket';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PolygonConfigModal } from '../PolygonConfigModal';

const h = vi.hoisted(() => {
  const handlers = new Map<string, Set<(message: Message) => void>>();
  return { handlers, engine: { cancel_current_operation: vi.fn(), add_sprite_to_layer: vi.fn() }, protocol: {
    isConnected: vi.fn(() => true), sendMessage: vi.fn(),
    registerHandler: vi.fn((type: string, handler: (message: Message) => void) => {
      const set = handlers.get(type) ?? new Set(); set.add(handler); handlers.set(type, set);
    }),
    unregisterHandler: vi.fn((type: string, handler: (message: Message) => void) => handlers.get(type)?.delete(handler)),
  } };
});
vi.mock('@/store', () => ({ useGameStore: vi.fn() }));
vi.mock('@lib/api', () => ({ useProtocol: () => ({ protocol: h.protocol }) }));
vi.mock('@lib/wasm/runtime', async importOriginal => ({ ...await importOriginal<object>(), useRenderEngine: () => h.engine }));

function setupStore(tableId: string | null = 'table-1', role: SessionRole = 'owner') {
  vi.mocked(useGameStore).mockImplementation(((select: (state: unknown) => unknown) =>
    select({ activeTableId: tableId, userId: 1, sessionRole: role })) as typeof useGameStore);
}
function dispatchPolygonCreated(vertices = [{ x: 10, y: 20 }, { x: 110, y: 20 }, { x: 60, y: 120 }]) {
  act(() => window.dispatchEvent(new CustomEvent('polygonCreated', { detail: { vertices } })));
}
function submit() { fireEvent.click(screen.getByRole('button', { name: 'Create Obstacle' })); }
function sent(): Message { return h.protocol.sendMessage.mock.calls.at(-1)![0] as Message; }
function subscriptions() { return [...h.handlers.values()].reduce((total, set) => total + set.size, 0); }
async function reply(type: MessageType, correlation = sent().message_id!, data: Record<string, unknown> = {}) {
  await act(async () => h.handlers.get(type)?.forEach(handler => handler({ type, correlation_id: correlation, data } as Message)));
}

describe('authoritative polygon creation', () => {
  beforeEach(() => {
    vi.clearAllMocks(); h.handlers.clear(); h.protocol.isConnected.mockReturnValue(true); setupStore();
  });
  afterEach(() => vi.useRealTimers());

  it('renders nothing before an eligible polygon event', () => {
    const { container } = render(<PolygonConfigModal />);
    expect(container).toBeEmptyDOMElement();
  });
  it('shows the captured draft and closes on Cancel or Escape', () => {
    render(<PolygonConfigModal />); dispatchPolygonCreated();
    expect(screen.getByText(/3 vertices/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel')); expect(screen.queryByRole('dialog')).toBeNull();
    dispatchPolygonCreated(); fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('sends canonical dimensions, world vertices and the chosen name and layer', () => {
    const { unmount } = render(<PolygonConfigModal />); dispatchPolygonCreated();
    fireEvent.change(screen.getByLabelText('Label (optional)'), { target: { value: 'Wall' } });
    fireEvent.change(screen.getByLabelText('Layer'), { target: { value: 'map' } }); submit();
    expect(h.protocol.sendMessage).toHaveBeenCalledOnce();
    expect(h.engine.add_sprite_to_layer).not.toHaveBeenCalled();
    expect(sent().data).toMatchObject({ table_id: 'table-1', sprite_data: {
      table_id: 'table-1', name: 'Wall', layer: 'map', obstacle_type: 'polygon', x: 10, y: 20,
      width: 100, height: 100, obstacle_data: { vertices: [[10, 20], [110, 20], [60, 120]] },
    } });
    expect((sent().data?.sprite_data as { sprite_id: string }).sprite_id).toMatch(/^[0-9a-f-]{36}$/i);
    unmount();
  });
  it('waits for its correlated acknowledgement and prevents duplicate submissions', async () => {
    render(<PolygonConfigModal />); dispatchPolygonCreated(); submit();
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Saving…' }));
    await reply(MessageType.SUCCESS, 'unrelated'); expect(screen.getByRole('dialog')).toBeInTheDocument();
    await reply(MessageType.SPRITE_RESPONSE);
    expect(screen.queryByRole('dialog')).toBeNull(); expect(subscriptions()).toBe(0);
    expect(h.engine.cancel_current_operation).toHaveBeenCalled();
    expect(h.protocol.sendMessage).toHaveBeenCalledOnce();
  });
  it('retains rejected drafts and reuses sprite identity on an explicit retry', async () => {
    const { unmount } = render(<PolygonConfigModal />); dispatchPolygonCreated(); submit();
    const original = sent(); await reply(MessageType.ERROR, original.message_id!, { error: 'Save denied' });
    expect(screen.getByRole('alert')).toHaveTextContent('Save denied'); expect(subscriptions()).toBe(0);
    submit();
    expect(sent().data).toEqual(original.data); expect(sent().message_id).not.toBe(original.message_id);
    unmount();
  });
  it('times out without automatically retrying an uncertain write', async () => {
    vi.useFakeTimers(); render(<PolygonConfigModal />); dispatchPolygonCreated(); submit();
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(screen.getByRole('alert')).toHaveTextContent('Check the saved table before retrying');
    expect(h.protocol.sendMessage).toHaveBeenCalledOnce(); expect(subscriptions()).toBe(0);
  });
  it('clears pending saves on table changes and ignores late confirmations', async () => {
    const view = render(<PolygonConfigModal />); dispatchPolygonCreated(); submit();
    const original = sent(); setupStore('table-2'); view.rerender(<PolygonConfigModal />);
    expect(screen.queryByRole('dialog')).toBeNull(); expect(subscriptions()).toBe(0);
    dispatchPolygonCreated(); await reply(MessageType.SPRITE_RESPONSE, original.message_id!);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  it('cancels pending observation on unmount without resending', () => {
    const { unmount } = render(<PolygonConfigModal />); dispatchPolygonCreated(); submit(); unmount();
    expect(subscriptions()).toBe(0); expect(h.protocol.sendMessage).toHaveBeenCalledOnce();
  });
  it('keeps disconnected saves local to the dialog, not the renderer or transport', async () => {
    h.protocol.isConnected.mockReturnValue(false);
    render(<PolygonConfigModal />); dispatchPolygonCreated(); submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Connect to the session');
    expect(h.protocol.sendMessage).not.toHaveBeenCalled(); expect(subscriptions()).toBe(0);
  });
  it.each(['player', 'spectator'] as const)('ignores the DM polygon tool for %s', role => {
    setupStore('table-1', role); render(<PolygonConfigModal />); dispatchPolygonCreated();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('cancels drafts when authority is revoked', () => {
    const view = render(<PolygonConfigModal />); dispatchPolygonCreated(); submit();
    setupStore('table-1', 'spectator'); view.rerender(<PolygonConfigModal />);
    expect(screen.queryByRole('dialog')).toBeNull(); expect(subscriptions()).toBe(0);
  });
  it('ignores incomplete and non-finite geometry', () => {
    render(<PolygonConfigModal />);
    dispatchPolygonCreated([{ x: 1, y: 1 }]); dispatchPolygonCreated([{ x: NaN, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }]);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('Polygon geometry is invalid');
    expect(h.protocol.sendMessage).not.toHaveBeenCalled();
  });
  it('reports an oversized draft instead of silently discarding or truncating it', () => {
    render(<PolygonConfigModal />);
    dispatchPolygonCreated(Array.from({ length: 1001 }, (_, x) => ({ x, y: x % 2 })));
    expect(screen.getByRole('alert')).toHaveTextContent('1,000-vertex limit');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(h.protocol.sendMessage).not.toHaveBeenCalled(); expect(h.engine.add_sprite_to_layer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).toBeNull();
    dispatchPolygonCreated(); expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
