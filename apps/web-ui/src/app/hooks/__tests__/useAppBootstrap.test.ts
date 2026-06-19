import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authService } from '@features/auth';
import { useAppBootstrap } from '../useAppBootstrap';

const mocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  getUserInfo: vi.fn(),
  getUserSessions: vi.fn(),
  logout: vi.fn(),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@features/auth', () => ({
  authService: {
    initialize: mocks.initialize,
    getUserInfo: mocks.getUserInfo,
    getUserSessions: mocks.getUserSessions,
    logout: mocks.logout,
  },
}));

vi.mock('@shared/utils/logger', () => ({
  logger: mocks.logger,
}));

const userInfo = {
  id: 1,
  username: 'ash',
  role: 'player' as const,
  permissions: [],
};

describe('useAppBootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.initialize.mockResolvedValue(true);
    mocks.getUserInfo.mockReturnValue(userInfo);
    mocks.getUserSessions.mockResolvedValue([]);
    (window as Window & { __INITIAL_DATA__?: unknown }).__INITIAL_DATA__ = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
    (window as Window & { __INITIAL_DATA__?: unknown }).__INITIAL_DATA__ = undefined;
  });

  it('initializes authenticated user state without an injected session', async () => {
    const { result } = renderHook(() => useAppBootstrap());

    await waitFor(() => expect(result.current.state.loading).toBe(false));

    expect(authService.initialize).toHaveBeenCalledTimes(1);
    expect(result.current.state).toMatchObject({
      isAuthenticated: true,
      userInfo,
      selectedSession: null,
      userRole: null,
      error: null,
    });
  });

  it('resolves an injected session name to its session code', async () => {
    (window as Window & { __INITIAL_DATA__?: unknown }).__INITIAL_DATA__ = {
      sessionCode: 'Friday Game',
      userRole: 'owner',
    };
    mocks.getUserSessions.mockResolvedValue([
      { session_code: 'abc123', session_name: 'Friday Game', role: 'owner', created_at: '' },
    ]);

    const { result } = renderHook(() => useAppBootstrap());

    await waitFor(() => expect(result.current.state.loading).toBe(false));

    expect(result.current.state).toMatchObject({
      isAuthenticated: true,
      selectedSession: 'abc123',
      userRole: 'owner',
    });
  });

  it('marks auth error and schedules logout on auth failure callback', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useAppBootstrap());

    act(() => {
      result.current.handleAuthError();
    });

    expect(result.current.state).toMatchObject({
      isAuthenticated: false,
      userInfo: null,
      error: 'Authentication expired. Please login again.',
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(authService.logout).toHaveBeenCalledTimes(1);
  });
});
