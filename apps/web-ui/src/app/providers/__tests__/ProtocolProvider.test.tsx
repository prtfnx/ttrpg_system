import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  let stateListener:
    | ((state: 'connected' | 'disconnected' | 'timeout') => void)
    | null = null;
  const unsubscribe = vi.fn();
  const protocol = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    onConnectionStateChange: vi.fn((listener) => {
      stateListener = listener;
      return unsubscribe;
    }),
  };
  return {
    protocol,
    unsubscribe,
    getStateListener: () => stateListener,
    resetStateListener: () => {
      stateListener = null;
    },
    setProtocol: vi.fn(),
    clearProtocol: vi.fn(),
  };
});

vi.mock('@features/auth', () => ({
  authService: {
    getUserSessions: vi.fn().mockResolvedValue([]),
    getUserInfo: vi.fn(() => ({ id: 7 })),
  },
}));

vi.mock('@lib/api/ProtocolService', () => ({
  ProtocolService: {
    setProtocol: mocks.setProtocol,
    clearProtocol: mocks.clearProtocol,
  },
}));

vi.mock('@lib/websocket', () => ({
  WebClientProtocol: vi.fn(function() {
    return mocks.protocol;
  }),
}));

vi.mock('@shared/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import { ProtocolProvider, useProtocol } from '../ProtocolProvider';

function ConnectionState() {
  const { connectionState } = useProtocol();
  return <output>{connectionState}</output>;
}

describe('ProtocolProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetStateListener();
    mocks.protocol.connect.mockResolvedValue(undefined);
  });

  it('reflects automatic protocol recovery and cleans up its subscription', async () => {
    const view = render(
      <ProtocolProvider sessionCode="ROOM">
        <ConnectionState />
      </ProtocolProvider>,
    );
    await waitFor(() => expect(screen.getByText('connected')).toBeInTheDocument());
    const listener = mocks.getStateListener();
    expect(listener).not.toBeNull();

    act(() => listener?.('disconnected'));
    expect(screen.getByText('disconnected')).toBeInTheDocument();

    act(() => listener?.('timeout'));
    expect(screen.getByText('error')).toBeInTheDocument();

    act(() => listener?.('connected'));
    expect(screen.getByText('connected')).toBeInTheDocument();

    view.unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    expect(mocks.protocol.disconnect).toHaveBeenCalledOnce();
    expect(mocks.clearProtocol).toHaveBeenCalledOnce();
  });
});
