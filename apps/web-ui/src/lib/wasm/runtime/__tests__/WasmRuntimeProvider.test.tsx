import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WasmRuntimeProvider } from '../WasmRuntimeProvider';

const mocks = vi.hoisted(() => {
  const runtime = {
    setProtocol: vi.fn(),
    dispose: vi.fn(),
  };

  return {
    runtime,
    useOptionalProtocol: vi.fn(),
    WasmRuntime: vi.fn(function () {
      return runtime;
    }),
  };
});

vi.mock('@lib/api', () => ({
  useOptionalProtocol: mocks.useOptionalProtocol,
}));

vi.mock('../WasmRuntime', () => ({
  WasmRuntime: mocks.WasmRuntime,
}));

describe('WasmRuntimeProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useOptionalProtocol.mockReturnValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates one runtime and reconnects it when the active protocol changes', async () => {
    const protocolA = { id: 'protocol-a' };
    const protocolB = { id: 'protocol-b' };

    mocks.useOptionalProtocol.mockReturnValue({ protocol: protocolA });
    const { rerender } = render(
      <WasmRuntimeProvider>
        <div />
      </WasmRuntimeProvider>,
    );

    await waitFor(() => expect(mocks.runtime.setProtocol).toHaveBeenCalledWith(protocolA));

    mocks.useOptionalProtocol.mockReturnValue({ protocol: protocolB });
    rerender(
      <WasmRuntimeProvider>
        <div />
      </WasmRuntimeProvider>,
    );

    await waitFor(() => expect(mocks.runtime.setProtocol).toHaveBeenCalledWith(protocolB));
    expect(mocks.WasmRuntime).toHaveBeenCalledTimes(1);
  });

  it('clears and disposes the runtime on provider unmount', async () => {
    const protocol = { id: 'protocol' };
    mocks.useOptionalProtocol.mockReturnValue({ protocol });

    const { unmount } = render(
      <WasmRuntimeProvider>
        <div />
      </WasmRuntimeProvider>,
    );

    await waitFor(() => expect(mocks.runtime.setProtocol).toHaveBeenCalledWith(protocol));

    unmount();

    expect(mocks.runtime.dispose).toHaveBeenCalledOnce();
  });
});
