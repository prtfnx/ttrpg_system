import { render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fetch BEFORE the singleton initialises (vi.hoisted runs before imports)
const mockFetch = vi.hoisted(() => {
  const fn = vi.fn().mockResolvedValue({
    ok: false,
    status: 401,
    json: () => Promise.resolve({ detail: 'Unauthorized' }),
  });
  globalThis.fetch = fn as typeof fetch;
  return fn;
});

import type { AuthState, Permission, UserRole } from '../enhancedAuth.service';
import { enhancedAuthService, withAuth, withPermission, withRole } from '../enhancedAuth.service';

// Direct state manipulation helpers (bypass async network calls in tests)
function setState(updates: Partial<AuthState>) {
  (enhancedAuthService as unknown as { authState: AuthState }).authState = {
    ...(enhancedAuthService as unknown as { authState: AuthState }).authState,
    ...updates,
  };
}

function makeUser(role: UserRole = 'player', permissions: Permission[] = []) {
  return {
    id: 1,
    username: 'alice',
    email: 'alice@test.com',
    role,
    permissions,
    isEmailVerified: true,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    preferences: {
      theme: 'dark' as const,
      language: 'en',
      timezone: 'UTC',
      notifications: { email: true, push: true, gameInvites: true, systemUpdates: true },
    },
  };
}

function makeTokens() {
  return {
    accessToken: 'access-tok',
    refreshToken: 'refresh-tok',
    expiresAt: Date.now() + 3_600_000,
    tokenType: 'Bearer' as const,
  };
}

function resetState() {
  setState({ isAuthenticated: false, isLoading: false, user: null, tokens: null, lastError: null });
  // Clear listeners to avoid cross-test leakage
  (enhancedAuthService as unknown as { listeners: unknown[] }).listeners.length = 0;
  // Clear rate-limit map
  (enhancedAuthService as unknown as { rateLimitMap: Map<unknown, unknown> }).rateLimitMap.clear();
}

beforeEach(() => {
  vi.clearAllMocks();
  resetState();
  mockFetch.mockResolvedValue({
    ok: false,
    status: 401,
    json: () => Promise.resolve({ detail: 'Unauthorized' }),
  });
});

afterEach(resetState);

// ── State getters ─────────────────────────────────────────────────────────────
describe('state getters', () => {
  it('isAuthenticated returns false by default', () => {
    expect(enhancedAuthService.isAuthenticated()).toBe(false);
  });

  it('getAuthState returns current state snapshot', () => {
    const s = enhancedAuthService.getAuthState();
    expect(s.isAuthenticated).toBe(false);
    expect(s.user).toBeNull();
  });

  it('getCurrentUser returns null when not authenticated', () => {
    expect(enhancedAuthService.getCurrentUser()).toBeNull();
  });

  it('getCurrentUser returns the user when authenticated', () => {
    setState({ isAuthenticated: true, user: makeUser('gm'), tokens: makeTokens() });
    expect(enhancedAuthService.getCurrentUser()?.username).toBe('alice');
  });
});

// ── Permission / role checks ──────────────────────────────────────────────────
describe('permission and role checks', () => {
  it('hasPermission returns false when not authenticated', () => {
    expect(enhancedAuthService.hasPermission('game.read')).toBe(false);
  });

  it('hasPermission returns true when user has the permission', () => {
    setState({ isAuthenticated: true, user: makeUser('player', ['game.read', 'character.read']), tokens: makeTokens() });
    expect(enhancedAuthService.hasPermission('game.read')).toBe(true);
  });

  it('hasPermission returns false for a missing permission', () => {
    setState({ isAuthenticated: true, user: makeUser('player', ['game.read']), tokens: makeTokens() });
    expect(enhancedAuthService.hasPermission('system.admin')).toBe(false);
  });

  it('hasRole returns false when not authenticated', () => {
    expect(enhancedAuthService.hasRole('player')).toBe(false);
  });

  it('hasRole returns true for matching role', () => {
    setState({ isAuthenticated: true, user: makeUser('gm'), tokens: makeTokens() });
    expect(enhancedAuthService.hasRole('gm')).toBe(true);
  });

  it('hasRole returns false for a different role', () => {
    setState({ isAuthenticated: true, user: makeUser('player'), tokens: makeTokens() });
    expect(enhancedAuthService.hasRole('admin')).toBe(false);
  });

  it('hasAnyRole returns true when one of the roles matches', () => {
    setState({ isAuthenticated: true, user: makeUser('gm'), tokens: makeTokens() });
    expect(enhancedAuthService.hasAnyRole(['admin', 'gm'])).toBe(true);
  });

  it('hasAnyRole returns false when none match', () => {
    setState({ isAuthenticated: true, user: makeUser('player'), tokens: makeTokens() });
    expect(enhancedAuthService.hasAnyRole(['admin', 'gm'])).toBe(false);
  });
});

// ── Subscribe / unsubscribe ───────────────────────────────────────────────────
describe('subscribe / unsubscribe', () => {
  it('listener is called when state changes', () => {
    const listener = vi.fn();
    enhancedAuthService.subscribe(listener);
    setState({ isLoading: true });
    // Trigger notify manually via private method
    (enhancedAuthService as unknown as { notifyListeners: () => void }).notifyListeners();
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ isLoading: true }));
  });

  it('unsubscribe prevents future calls', () => {
    const listener = vi.fn();
    const unsub = enhancedAuthService.subscribe(listener);
    unsub();
    (enhancedAuthService as unknown as { notifyListeners: () => void }).notifyListeners();
    expect(listener).not.toHaveBeenCalled();
  });

  it('multiple listeners can be registered independently', () => {
    const a = vi.fn();
    const b = vi.fn();
    enhancedAuthService.subscribe(a);
    enhancedAuthService.subscribe(b);
    (enhancedAuthService as unknown as { notifyListeners: () => void }).notifyListeners();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});

// ── login ─────────────────────────────────────────────────────────────────────
describe('login', () => {
  it('returns success and marks user authenticated on 200', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        user: makeUser('player', ['game.read']),
        tokens: makeTokens(),
      }),
    });
    const result = await enhancedAuthService.login({ username: 'alice', password: 'ValidPass1!' });
    expect(result.success).toBe(true);
    expect(enhancedAuthService.isAuthenticated()).toBe(true);
    expect(enhancedAuthService.getCurrentUser()?.username).toBe('alice');
  });

  it('returns error on 401', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ detail: 'Invalid credentials' }),
    });
    const result = await enhancedAuthService.login({ username: 'alice', password: 'wrong' });
    expect(result.success).toBe(false);
    expect(result.error?.message).toMatch(/invalid credentials/i);
  });

  it('returns error on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const result = await enhancedAuthService.login({ username: 'alice', password: 'pass' });
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('Network error');
  });

  it('blocks login after rate-limit exceeded', async () => {
    const rl = (enhancedAuthService as unknown as { rateLimitMap: Map<string, { count: number; resetTime: number }> }).rateLimitMap;
    rl.set('login:alice', { count: 5, resetTime: Date.now() + 100_000 });
    const result = await enhancedAuthService.login({ username: 'alice', password: 'ValidPass1!' });
    expect(result.success).toBe(false);
    expect(result.error?.message).toMatch(/too many/i);
  });

  it('stores refresh token when rememberMe is true', async () => {
    localStorage.removeItem('auth_refresh_token');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ user: makeUser(), tokens: makeTokens() }),
    });
    await enhancedAuthService.login({ username: 'alice', password: 'ValidPass1!', rememberMe: true });
    expect(localStorage.getItem('auth_refresh_token')).toBe('refresh-tok');
  });
});

// ── register ──────────────────────────────────────────────────────────────────
describe('register', () => {
  it('rejects password shorter than 8 characters', async () => {
    const result = await enhancedAuthService.register({
      username: 'bob', email: 'b@b.com', password: 'abc', acceptTerms: true,
    });
    expect(result.success).toBe(false);
    expect(result.error?.message).toMatch(/at least 8/i);
  });

  it('rejects password without uppercase letter', async () => {
    const result = await enhancedAuthService.register({
      username: 'bob', email: 'b@b.com', password: 'password1!', acceptTerms: true,
    });
    expect(result.success).toBe(false);
    expect(result.error?.message).toMatch(/uppercase/i);
  });

  it('rejects password containing personal info (username)', async () => {
    // 'Alice!Pass1' contains username 'alice'
    const result = await enhancedAuthService.register({
      username: 'alice', email: 'a@a.com', password: 'Alice!Pass1', acceptTerms: true,
    });
    expect(result.success).toBe(false);
    expect(result.error?.message).toMatch(/personal information/i);
  });

  it('returns success on valid credentials', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    const result = await enhancedAuthService.register({
      username: 'bob', email: 'b@b.com', password: 'ValidPass1!', acceptTerms: true,
    });
    expect(result.success).toBe(true);
  });

  it('returns error on server failure during register', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 400,
      json: () => Promise.resolve({ detail: 'Username taken' }),
    });
    const result = await enhancedAuthService.register({
      username: 'bob', email: 'b@b.com', password: 'ValidPass1!', acceptTerms: true,
    });
    expect(result.success).toBe(false);
    expect(result.error?.message).toMatch(/username taken/i);
  });
});

// ── logout ────────────────────────────────────────────────────────────────────
describe('logout', () => {
  it('clears auth state on successful logout', async () => {
    setState({ isAuthenticated: true, user: makeUser(), tokens: makeTokens() });
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    await enhancedAuthService.logout();
    expect(enhancedAuthService.isAuthenticated()).toBe(false);
    expect(enhancedAuthService.getCurrentUser()).toBeNull();
  });

  it('clears state even if logout request fails', async () => {
    setState({ isAuthenticated: true, user: makeUser(), tokens: makeTokens() });
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    await enhancedAuthService.logout();
    expect(enhancedAuthService.isAuthenticated()).toBe(false);
  });

  it('clears auth state when no tokens (cookie-based)', async () => {
    setState({ isAuthenticated: true, user: makeUser(), tokens: null });
    await enhancedAuthService.logout();
    expect(enhancedAuthService.isAuthenticated()).toBe(false);
  });
});

// ── requestPasswordReset ──────────────────────────────────────────────────────
describe('requestPasswordReset', () => {
  it('returns success on 200', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    const result = await enhancedAuthService.requestPasswordReset({ email: 'a@a.com' });
    expect(result.success).toBe(true);
  });

  it('returns error on server failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ detail: 'Email not found' })
    });
    const result = await enhancedAuthService.requestPasswordReset({ email: 'x@x.com' });
    expect(result.success).toBe(false);
    expect(result.error?.message).toMatch(/email not found/i);
  });

  it('returns error on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('timeout'));
    const result = await enhancedAuthService.requestPasswordReset({ email: 'a@a.com' });
    expect(result.success).toBe(false);
  });
});

// ── confirmPasswordReset ──────────────────────────────────────────────────────
describe('confirmPasswordReset', () => {
  it('rejects weak password', async () => {
    const result = await enhancedAuthService.confirmPasswordReset({ token: 'tok', newPassword: 'weak' });
    expect(result.success).toBe(false);
  });

  it('returns success on 200 with strong password', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    const result = await enhancedAuthService.confirmPasswordReset({ token: 'tok', newPassword: 'StrongPass1!' });
    expect(result.success).toBe(true);
  });

  it('returns error on server failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ detail: 'Token expired' })
    });
    const result = await enhancedAuthService.confirmPasswordReset({ token: 'bad', newPassword: 'StrongPass1!' });
    expect(result.success).toBe(false);
    expect(result.error?.message).toMatch(/token expired/i);
  });
});

// ── changePassword ────────────────────────────────────────────────────────────
describe('changePassword', () => {
  it('rejects weak new password', async () => {
    setState({ isAuthenticated: true, user: makeUser(), tokens: makeTokens() });
    const result = await enhancedAuthService.changePassword({ currentPassword: 'OldPass1!', newPassword: 'weak' });
    expect(result.success).toBe(false);
  });

  it('returns success on 200', async () => {
    setState({ isAuthenticated: true, user: makeUser(), tokens: makeTokens() });
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    const result = await enhancedAuthService.changePassword({ currentPassword: 'OldPass1!', newPassword: 'NewPass1!' });
    expect(result.success).toBe(true);
  });

  it('returns error on server failure', async () => {
    setState({ isAuthenticated: true, user: makeUser(), tokens: makeTokens() });
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ detail: 'Current password wrong' })
    });
    const result = await enhancedAuthService.changePassword({ currentPassword: 'Bad1!', newPassword: 'NewPass1!' });
    expect(result.success).toBe(false);
  });
});

// ── getSessions ───────────────────────────────────────────────────────────────
describe('getSessions', () => {
  it('returns sessions array on 200', async () => {
    setState({ isAuthenticated: true, user: makeUser(), tokens: makeTokens() });
    const sessions = [{ id: 's1', userId: 1, deviceInfo: {}, createdAt: '', lastActivity: '', isCurrentSession: true }];
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(sessions) });
    const result = await enhancedAuthService.getSessions();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('s1');
  });

  it('returns empty array on failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network'));
    const result = await enhancedAuthService.getSessions();
    expect(result).toEqual([]);
  });

  it('returns empty array on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({}) });
    const result = await enhancedAuthService.getSessions();
    expect(result).toEqual([]);
  });
});

// ── revokeSession ─────────────────────────────────────────────────────────────
describe('revokeSession', () => {
  it('returns success on 200', async () => {
    setState({ isAuthenticated: true, user: makeUser(), tokens: makeTokens() });
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    const result = await enhancedAuthService.revokeSession('s1');
    expect(result.success).toBe(true);
  });

  it('returns error on failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ detail: 'Not found' })
    });
    const result = await enhancedAuthService.revokeSession('bad');
    expect(result.success).toBe(false);
    expect(result.error?.message).toMatch(/not found/i);
  });
});

// ── getOAuthProviders ─────────────────────────────────────────────────────────
describe('getOAuthProviders', () => {
  it('returns providers on 200', async () => {
    const providers = [{ id: 'google', name: 'Google', icon: '', isEnabled: true }];
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(providers) });
    const result = await enhancedAuthService.getOAuthProviders();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('google');
  });

  it('returns empty array on failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network'));
    const result = await enhancedAuthService.getOAuthProviders();
    expect(result).toEqual([]);
  });
});

// ── cleanup ───────────────────────────────────────────────────────────────────
describe('cleanup', () => {
  it('clears listeners and does not throw', () => {
    const listener = vi.fn();
    enhancedAuthService.subscribe(listener);
    expect(() => enhancedAuthService.cleanup()).not.toThrow();
    (enhancedAuthService as unknown as { notifyListeners: () => void }).notifyListeners();
    expect(listener).not.toHaveBeenCalled();
  });
});

// ── withAuth HOC ──────────────────────────────────────────────────────────────
describe('withAuth HOC', () => {
  const TestComponent = (props: { label: string }) => React.createElement('div', null, props.label);

  it('renders null when not authenticated', () => {
    setState({ isAuthenticated: false, user: null, tokens: null });
    const Protected = withAuth(TestComponent);
    render(React.createElement(Protected, { label: 'hello' }));
    expect(screen.queryByText('hello')).toBeNull();
  });

  it('renders component when authenticated', () => {
    setState({ isAuthenticated: true, user: makeUser(), tokens: makeTokens() });
    const Protected = withAuth(TestComponent);
    render(React.createElement(Protected, { label: 'secret' }));
    expect(screen.getByText('secret')).toBeDefined();
  });
});

// ── withRole HOC ──────────────────────────────────────────────────────────────
describe('withRole HOC', () => {
  const AdminPanel = () => React.createElement('span', null, 'admin-content');

  it('renders null when user has different role', () => {
    setState({ isAuthenticated: true, user: makeUser('player'), tokens: makeTokens() });
    const Protected = withRole(AdminPanel, 'admin');
    render(React.createElement(Protected, {}));
    expect(screen.queryByText('admin-content')).toBeNull();
  });

  it('renders component when user has matching role', () => {
    setState({ isAuthenticated: true, user: makeUser('admin'), tokens: makeTokens() });
    const Protected = withRole(AdminPanel, 'admin');
    render(React.createElement(Protected, {}));
    expect(screen.getByText('admin-content')).toBeDefined();
  });
});

// ── withPermission HOC ────────────────────────────────────────────────────────
describe('withPermission HOC', () => {
  const DeleteBtn = () => React.createElement('button', null, 'delete');

  it('renders null when user lacks permission', () => {
    setState({ isAuthenticated: true, user: makeUser('player', ['game.read']), tokens: makeTokens() });
    const Protected = withPermission(DeleteBtn, 'game.delete');
    render(React.createElement(Protected, {}));
    expect(screen.queryByText('delete')).toBeNull();
  });

  it('renders component when user has required permission', () => {
    setState({ isAuthenticated: true, user: makeUser('gm', ['game.delete']), tokens: makeTokens() });
    const Protected = withPermission(DeleteBtn, 'game.delete');
    render(React.createElement(Protected, {}));
    expect(screen.getByText('delete')).toBeDefined();
  });
});

// ── logout ────────────────────────────────────────────────────────────────────
describe('logout', () => {
  it('clears authenticated state', async () => {
    setState({ isAuthenticated: true, user: makeUser(), tokens: makeTokens() });
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    await enhancedAuthService.logout();
    expect(enhancedAuthService.isAuthenticated()).toBe(false);
    expect(enhancedAuthService.getCurrentUser()).toBeNull();
  });

  it('clears state even if logout request fails', async () => {
    setState({ isAuthenticated: true, user: makeUser(), tokens: makeTokens() });
    mockFetch.mockRejectedValueOnce(new Error('Server down'));
    await enhancedAuthService.logout();
    expect(enhancedAuthService.isAuthenticated()).toBe(false);
  });

  it('clears stored tokens from localStorage', async () => {
    setState({ isAuthenticated: true, user: makeUser(), tokens: makeTokens() });
    localStorage.setItem('auth_refresh_token', 'stored-ref');
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    await enhancedAuthService.logout();
    expect(localStorage.getItem('auth_refresh_token')).toBeNull();
  });
});

// ── cleanup ───────────────────────────────────────────────────────────────────
describe('cleanup', () => {
  it('runs without throwing', () => {
    expect(() => enhancedAuthService.cleanup()).not.toThrow();
  });

  it('clears all listeners', () => {
    enhancedAuthService.subscribe(vi.fn());
    enhancedAuthService.cleanup();
    expect((enhancedAuthService as unknown as { listeners: unknown[] }).listeners).toHaveLength(0);
  });
});
