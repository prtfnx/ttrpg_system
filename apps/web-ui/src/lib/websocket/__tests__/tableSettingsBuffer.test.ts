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
  it('never replaces a newer revision with an older receipt or unversioned snapshot', () => {
    const { buffer, apply, send, reply } = harness();
    buffer.stage('t1', { grid_cell_px: 60 }); buffer.flush();
    const original = send.mock.calls[0][0];
    buffer.accept({ ...reply(original, 90), data: { table_id: 't1', grid_cell_px: 90, settings_revision: 2 } });
    buffer.accept({ ...reply(original, 60), data: { table_id: 't1', grid_cell_px: 60, settings_revision: 1 } });
    buffer.seed('t1', { grid_cell_px: 50 }); buffer.reapply('t1');
    expect(apply).toHaveBeenLastCalledWith('t1', expect.objectContaining({ grid_cell_px: 90 }));
    buffer.dispose();
  });

  it('retains an unknown original through snapshot reconciliation and retries it once before sending newer intent', () => {
    const { buffer, send, reply } = harness();
    buffer.stage('t1', { grid_cell_px: 60 }); buffer.flush();
    const original = send.mock.calls[0][0];
    const encoded = JSON.stringify(original);
    buffer.reject({ ...reply(original, 60), data: { outcome: 'unknown' } });
    buffer.stage('t1', { grid_cell_px: 90 });
    vi.advanceTimersByTime(1000);
    expect(send).toHaveBeenCalledOnce();
    buffer.resolveSnapshot([original.message_id!]);
    buffer.retryUnknown('t1'); buffer.retryUnknown('t1');
    expect(send).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(send.mock.calls[1][0])).toBe(encoded);
    buffer.accept({ ...reply(original, 60), data: { table_id: 't1', grid_cell_px: 60, settings_revision: 1 } });
    expect(buffer.hasUncertain('t1')).toBe(false);
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[2][0].message_id).not.toBe(original.message_id);
    expect(send.mock.calls[2][0].data?.grid_cell_px).toBe(90);
    buffer.dispose();
  });

  it('allows one original retry after another connection loss while retaining the exact body', () => {
    const { buffer, send } = harness();
    buffer.stage('t1', { grid_cell_px: 60 }); buffer.flush();
    const original = send.mock.calls[0][0];
    buffer.connectionLost(); buffer.retryUnknown('t1'); buffer.retryUnknown('t1');
    expect(send).toHaveBeenCalledTimes(2);
    buffer.connectionLost(); buffer.retryUnknown('t1');
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[2][0]).toBe(original);
    buffer.dispose();
  });
  it('discards a retired table draft without dropping another table draft', () => {
    const { buffer, send } = harness();
    buffer.stage('deleted', { grid_cell_px: 60 });
    buffer.stage('kept', { grid_cell_px: 80 });
    buffer.forgetTable('deleted');
    vi.advanceTimersByTime(1000);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0].data?.table_id).toBe('kept');
    buffer.dispose();
  });
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
