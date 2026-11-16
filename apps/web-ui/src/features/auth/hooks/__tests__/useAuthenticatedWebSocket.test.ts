import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ConnectionListener = (state: 'connected' | 'connecting' | 'reconnecting' | 'disconnected' | 'timeout') => void;

// mockProtocol must be defined via vi.hoisted so vi.mock closures can reference it
const mockProtocol = vi.hoisted(() => ({
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn(),
  isConnected: vi.fn(() => false),
  getConnectionDiagnostics: vi.fn(() => ({ state: 'disconnected', lastCloseCode: null as number | null,
    lastCloseReason: null as string | null })),
  listener: null as ConnectionListener | null,
  onConnectionStateChange: vi.fn((_listener: ConnectionListener) => vi.fn()),
}));

vi.mock('@lib/api', () => ({ useOptionalProtocol: vi.fn(() => null) }));
vi.mock('@lib/websocket', () => ({
  // Vitest 4.1+ requires a class when the mock is used with `new`
  WebClientProtocol: vi.fn(class {
    connect = mockProtocol.connect;
    disconnect = mockProtocol.disconnect;
    isConnected = mockProtocol.isConnected;
    getConnectionDiagnostics = mockProtocol.getConnectionDiagnostics;
    onConnectionStateChange = mockProtocol.onConnectionStateChange;
  }),
}));
vi.mock('../../services/auth.service', () => ({
  authService: { getUserSessions: vi.fn().mockResolvedValue([]) },
}));

import { useOptionalProtocol } from '@lib/api';
import { WebClientProtocol } from '@lib/websocket';
import { authService } from '../../services/auth.service';
import { useAuthenticatedWebSocket } from '../useAuthenticatedWebSocket';

const user = { id: 1, username: 'alice' };
const props = { sessionCode: 'TEST-CODE', userInfo: user as Parameters<typeof useAuthenticatedWebSocket>[0]['userInfo'] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useOptionalProtocol).mockReturnValue(null);
  mockProtocol.connect.mockImplementation(async () => {
    mockProtocol.isConnected.mockReturnValue(true);
  });
  mockProtocol.disconnect.mockReset();
  mockProtocol.isConnected.mockReturnValue(false);
  mockProtocol.getConnectionDiagnostics.mockReturnValue({ state: 'disconnected', lastCloseCode: null, lastCloseReason: null });
  mockProtocol.listener = null;
  mockProtocol.onConnectionStateChange.mockImplementation(listener => {
    mockProtocol.listener = listener;
    return vi.fn();
  });
  vi.mocked(authService.getUserSessions).mockResolvedValue([]);
});

afterEach(() => vi.useRealTimers());

describe('useAuthenticatedWebSocket — standalone (no ProtocolProvider)', () => {
  it.each(['Authentication expired', 'Demo expired', 'Kicked from session', 'Account disabled'])(
    'surfaces terminal %s after connecting without starting a new connection', async reason => {
      const { result } = renderHook(() => useAuthenticatedWebSocket(props));
      await waitFor(() => expect(result.current.connectionState).toBe('connected'));
      vi.useFakeTimers();
      mockProtocol.getConnectionDiagnostics.mockReturnValue({ state: 'disconnected', lastCloseCode: 1008,
        lastCloseReason: reason });
      act(() => mockProtocol.listener?.('disconnected'));
      expect(result.current.connectionState).toBe('error');
      expect(result.current.error).toBe(reason === 'Authentication expired'
        ? 'Authentication failed. Sign in again to continue.' : reason);
      await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
      expect(vi.mocked(WebClientProtocol)).toHaveBeenCalledTimes(1);
    },
  );

  it('moves to connected after successful auto-connect', async () => {
    const { result } = renderHook(() => useAuthenticatedWebSocket(props));
    await waitFor(() => expect(result.current.connectionState).toBe('connected'));
    expect(result.current.isConnected).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('creates WebClientProtocol with the session code', async () => {
    renderHook(() => useAuthenticatedWebSocket(props));
    await waitFor(() => expect(vi.mocked(WebClientProtocol)).toHaveBeenCalledWith('TEST-CODE'));
  });

  it('resolves session name to code when found in getUserSessions', async () => {
    vi.mocked(authService.getUserSessions).mockResolvedValueOnce([
      { session_code: 'REAL-CODE', session_name: 'TEST-CODE' } as never,
    ]);
    renderHook(() => useAuthenticatedWebSocket(props));
    await waitFor(() => expect(vi.mocked(WebClientProtocol)).toHaveBeenCalledWith('REAL-CODE'));
  });

  it('moves to error state when connect() rejects', async () => {
    mockProtocol.connect.mockRejectedValueOnce(new Error('Connection refused'));
    const { result } = renderHook(() => useAuthenticatedWebSocket(props));
    await waitFor(() => expect(result.current.connectionState).toBe('error'));
    expect(result.current.error).toContain('Connection refused');
    expect(result.current.isConnected).toBe(false);
  });

  it('skips creating a new protocol when already connected', async () => {
    mockProtocol.isConnected.mockReturnValue(true);
    const { result } = renderHook(() => useAuthenticatedWebSocket(props));
    await waitFor(() => expect(result.current.connectionState).toBe('connected'));
    // A protocol was created, then isConnected() was true → skipped re-connect
    expect(vi.mocked(WebClientProtocol)).toHaveBeenCalledTimes(1);
  });

  it('disconnect() resets state to disconnected', async () => {
    const { result } = renderHook(() => useAuthenticatedWebSocket(props));
    await waitFor(() => expect(result.current.connectionState).toBe('connected'));
    act(() => { result.current.disconnect(); });
    expect(result.current.connectionState).toBe('disconnected');
    expect(result.current.isConnected).toBe(false);
  });

  it('returns a non-null protocol after connecting', async () => {
    const { result } = renderHook(() => useAuthenticatedWebSocket(props));
    await waitFor(() => expect(result.current.connectionState).toBe('connected'));
    expect(result.current.protocol).not.toBeNull();
    expect(result.current.protocol?.connect).toBe(mockProtocol.connect);
  });

  it('getUserSessions failure does not prevent connection', async () => {
    vi.mocked(authService.getUserSessions).mockRejectedValueOnce(new Error('no sessions'));
    const { result } = renderHook(() => useAuthenticatedWebSocket(props));
    // Falls back to original sessionCode
    await waitFor(() => expect(result.current.connectionState).toBe('connected'));
    expect(vi.mocked(WebClientProtocol)).toHaveBeenCalledWith('TEST-CODE');
  });

  it('does not create a connection after unmounting during session resolution', async () => {
    let resolveSessions!: (sessions: never[]) => void;
    vi.mocked(authService.getUserSessions).mockReturnValueOnce(new Promise(resolve => {
      resolveSessions = resolve;
    }));
    const { unmount } = renderHook(() => useAuthenticatedWebSocket(props));

    unmount();
    await act(async () => resolveSessions([]));

    expect(vi.mocked(WebClientProtocol)).not.toHaveBeenCalled();
    expect(mockProtocol.connect).not.toHaveBeenCalled();
  });
});

describe('useAuthenticatedWebSocket — delegating to ProtocolProvider', () => {
  it('returns ctx values directly when context is available', () => {
    const mockCtx = {
      connectionState: 'connected',
      connectionError: null,
      isConnected: true,
      protocol: { connect: vi.fn(), disconnect: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    vi.mocked(useOptionalProtocol).mockReturnValue(mockCtx as never);

    const { result } = renderHook(() => useAuthenticatedWebSocket(props));

    expect(result.current.connectionState).toBe('connected');
    expect(result.current.isConnected).toBe(true);
    expect(result.current.connect).toBe(mockCtx.connect);
    expect(result.current.disconnect).toBe(mockCtx.disconnect);
    expect(result.current.error).toBeNull();
  });

  it('does not call WebClientProtocol when context is present', () => {
    vi.mocked(useOptionalProtocol).mockReturnValue({
      connectionState: 'disconnected',
      connectionError: null,
      isConnected: false,
      protocol: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
    } as never);

    renderHook(() => useAuthenticatedWebSocket(props));
    expect(vi.mocked(WebClientProtocol)).not.toHaveBeenCalled();
  });
});
