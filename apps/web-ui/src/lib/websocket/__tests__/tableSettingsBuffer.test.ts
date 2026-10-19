import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMessage, MessageType, type Message } from '../message';
import { TableSettingsBuffer } from '../tableSettingsBuffer';

function harness() {
  vi.useFakeTimers();
  const apply = vi.fn();
  const send = vi.fn((_message: Message) => true);
  const buffer = new TableSettingsBuffer({ read: () => ({ grid_cell_px: 50, cell_distance: 5 }),
    apply, send, connected: () => true });
  const reply = (request: Message, size: number) => ({ ...createMessage(MessageType.TABLE_SETTINGS_CHANGED,
    { table_id: 't1', grid_cell_px: size, cell_distance: 5 }), causation_id: request.message_id });
  return { buffer, apply, send, reply };
}
afterEach(() => vi.useRealTimers());

describe('table settings buffer', () => {
  it('previews twenty changes immediately and persists only their final value', () => {
    const { buffer, apply, send } = harness();
    for (let size = 55; size <= 150; size += 5) buffer.stage('t1', { grid_cell_px: size });
    expect(apply).toHaveBeenLastCalledWith('t1', expect.objectContaining({ grid_cell_px: 150 }));
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0].data?.grid_cell_px).toBe(150);
    buffer.dispose();
  });

  it('keeps newer intent visible when an earlier save is acknowledged or denied', () => {
    const { buffer, apply, send, reply } = harness();
    buffer.stage('t1', { grid_cell_px: 60 }); buffer.flush();
    const first = send.mock.calls[0][0];
    buffer.stage('t1', { grid_cell_px: 80 }); buffer.flush();
    const second = send.mock.calls[1][0];
    buffer.accept(reply(first, 60));
    expect(apply).toHaveBeenLastCalledWith('t1', expect.objectContaining({ grid_cell_px: 80 }));
    expect(buffer.reject(reply(second, 80))).toBe(true);
    expect(apply).toHaveBeenLastCalledWith('t1', expect.objectContaining({ grid_cell_px: 60 }));
    buffer.dispose();
  });

  it('bounds continuous dragging with a maximum flush interval and fences disposed scopes', () => {
    const { buffer, send } = harness();
    for (let i = 0; i < 6; i++) { buffer.stage('t1', { grid_cell_px: 60 + i }); vi.advanceTimersByTime(100); }
    expect(send).toHaveBeenCalledOnce();
    buffer.dispose();
    vi.advanceTimersByTime(1000);
    expect(send).toHaveBeenCalledOnce();
  });
});
