import { describe, expect, it, vi } from 'vitest';
import { emitProtocolEvent, onProtocolEvent } from '../protocolEvents';

describe('protocolEvents', () => {
  it('emits typed protocol events through the window bridge', () => {
    const handler = vi.fn();
    const cleanup = onProtocolEvent('sprite-created', handler);

    emitProtocolEvent('sprite-created', { sprite_id: 's1' });

    cleanup();
    expect(handler).toHaveBeenCalledWith({ sprite_id: 's1' });
  });

  it('removes listeners through the returned cleanup', () => {
    const handler = vi.fn();
    const cleanup = onProtocolEvent('table-updated', handler);

    cleanup();
    emitProtocolEvent('table-updated', { table_id: 't1' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('emits detail-less protocol events', () => {
    const handler = vi.fn();
    window.addEventListener('protocol-connected', handler);

    emitProtocolEvent('protocol-connected');

    window.removeEventListener('protocol-connected', handler);
    expect(handler).toHaveBeenCalledOnce();
  });
});
