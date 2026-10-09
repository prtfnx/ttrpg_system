import { render } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WasmRuntime } from '../WasmRuntime';
import { WasmRuntimeProvider } from '../WasmRuntimeProvider';

vi.mock('@lib/api', () => ({ useOptionalProtocol: () => null }));
vi.mock('@features/assets', () => ({ assetIntegrationService: { dispose: vi.fn() } }));
vi.mock('../../wasmBridge', () => ({ wasmBridgeService: { cleanup: vi.fn(), setProtocol: vi.fn() } }));
vi.mock('../../assetSync.service', () => ({ AssetSyncService: class { dispose() {} } }));
vi.mock('../../spriteSync.service', () => ({ SpriteSyncService: class { dispose() {} } }));
vi.mock('../../remoteSync.service', () => ({ RemoteSyncService: class { dispose() {} } }));

const TABLE_EVENTS = ['table-data-received', 'table-response', 'new-table-response', 'table-updated'];

function trackTableListeners() {
  // Exercise the real runtime, coordinator, TableSyncService and event bus.
  const add = vi.spyOn(window, 'addEventListener');
  const remove = vi.spyOn(window, 'removeEventListener');
  return (name: string) => ({
    added: add.mock.calls.filter(([type]) => type === name).map(([, listener]) => listener),
    removed: remove.mock.calls.filter(([type]) => type === name).map(([, listener]) => listener),
  });
}

afterEach(() => vi.restoreAllMocks());

describe('runtime session subscription ownership', () => {
  it('removes every real table listener at full disposal and installs fresh ones on restart', () => {
    const listeners = trackTableListeners();
    const runtime = new WasmRuntime();
    runtime.start();
    runtime.start();
    runtime.detachCanvas();
    for (const name of TABLE_EVENTS) {
      expect(listeners(name).added).toHaveLength(1);
      expect(listeners(name).removed).toHaveLength(0);
    }
    runtime.dispose();
    for (const name of TABLE_EVENTS) expect(listeners(name).removed).toEqual(listeners(name).added);

    runtime.start();
    for (const name of TABLE_EVENTS) expect(listeners(name).added).toHaveLength(2);
    runtime.dispose();
    for (const name of TABLE_EVENTS) expect(listeners(name).removed).toEqual(listeners(name).added);
  });

  it('retains one current listener per event through StrictMode replay and none after unmount', () => {
    const listeners = trackTableListeners();
    const view = render(<StrictMode><WasmRuntimeProvider><div /></WasmRuntimeProvider></StrictMode>);
    for (const name of TABLE_EVENTS) {
      expect(listeners(name).added.length - listeners(name).removed.length).toBe(1);
    }
    view.unmount();
    for (const name of TABLE_EVENTS) expect(listeners(name).removed).toEqual(listeners(name).added);
  });
});
