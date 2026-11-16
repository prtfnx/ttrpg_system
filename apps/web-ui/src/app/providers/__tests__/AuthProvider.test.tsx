import { act, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuthService = vi.hoisted(() => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  getUserInfo: vi.fn().mockReturnValue(null),
  isAuthenticated: vi.fn().mockReturnValue(false),
  logout: vi.fn(),
  login: vi.fn(),
}));

vi.mock('@features/auth/services/auth.service', () => ({
  authService: mockAuthService,
}));

import { useGameStore } from '@/store';
import { AuthProvider, useAuth } from '../AuthProvider';

// Helper: consumer component that captures auth context via useAuth
type AuthCtx = ReturnType<typeof useAuth>;
function Consumer({ onCtx }: { onCtx: (ctx: AuthCtx) => void }) {
  const ctx = useAuth();
  onCtx(ctx);
  return null;
}

function wrap(onCtx: (ctx: AuthCtx) => void, children?: React.ReactNode) {
  return (
    <AuthProvider>
      <Consumer onCtx={onCtx} />
      {children}
    </AuthProvider>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthService.initialize.mockResolvedValue(undefined);
    mockAuthService.getUserInfo.mockReturnValue(null);
    mockAuthService.isAuthenticated.mockReturnValue(false);
    mockAuthService.login.mockResolvedValue({ success: false, message: 'Login failed' });
    useGameStore.setState({ permissions: [] });
  });

  it('renders children', async () => {
    render(
      <AuthProvider>
        <div data-testid="child">hello</div>
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('child')).toBeInTheDocument());
  });

  it('calls authService.initialize on mount', async () => {
    render(<AuthProvider><div /></AuthProvider>);
    await waitFor(() => expect(mockAuthService.initialize).toHaveBeenCalled());
  });

  it('sets authenticated state when service returns user', async () => {
    const user = { id: 1, username: 'alice', permissions: [] };
    mockAuthService.getUserInfo.mockReturnValue(user);
    mockAuthService.isAuthenticated.mockReturnValue(true);

    let ctx!: AuthCtx;
    render(wrap(c => { ctx = c; }));
    await waitFor(() => expect(ctx?.isAuthenticated).toBe(true));
    expect(ctx.user).toEqual(user);
  });

  it('initial state: loading true then resolves', async () => {
    let ctx!: AuthCtx;
    render(wrap(c => { ctx = c; }));
    await waitFor(() => expect(ctx?.loading).toBe(false));
  });

  it('login uses the shared service and publishes only a confirmed identity', async () => {
    mockAuthService.login.mockImplementation(async () => {
      mockAuthService.getUserInfo.mockReturnValue({ id: 1, username: 'alice' });
      mockAuthService.isAuthenticated.mockReturnValue(true);
      return { success: true };
    });

    let ctx!: AuthCtx;
    render(wrap(c => { ctx = c; }));
    await waitFor(() => expect(mockAuthService.initialize).toHaveBeenCalledTimes(1));

    await act(async () => { await ctx.login('alice', 'pass'); });

    expect(mockAuthService.login).toHaveBeenCalledWith('alice', 'pass');
    expect(ctx.isAuthenticated).toBe(true);
    expect(ctx.user?.id).toBe(1);
  });

  it('login returns false on failed fetch', async () => {
    mockAuthService.login.mockResolvedValue({ success: false, message: 'Incorrect password' });

    let ctx!: AuthCtx;
    render(wrap(c => { ctx = c; }));
    await waitFor(() => expect(ctx?.loading).toBe(false));

    let result!: boolean;
    await act(async () => { result = await ctx.login('alice', 'wrong'); });
    expect(result).toBe(false);
    expect(ctx.error).toBe('Incorrect password');
  });

  it('login returns false on network error', async () => {
    mockAuthService.login.mockRejectedValue(new Error('net error'));

    let ctx!: AuthCtx;
    render(wrap(c => { ctx = c; }));
    await waitFor(() => expect(ctx?.loading).toBe(false));

    let result!: boolean;
    await act(async () => { result = await ctx.login('alice', 'pass'); });
    expect(result).toBe(false);
    expect(ctx.isAuthenticated).toBe(false);
  });

  it('does not authenticate from a successful response without a validated cookie identity', async () => {
    mockAuthService.login.mockResolvedValue({ success: true });
    let ctx!: AuthCtx;
    render(wrap(c => { ctx = c; }));
    await waitFor(() => expect(ctx?.loading).toBe(false));
    let result!: boolean;
    await act(async () => { result = await ctx.login('alice', 'pass'); });
    expect(result).toBe(false);
    expect(ctx.isAuthenticated).toBe(false);
    expect(ctx.user).toBeNull();
  });

  it('logout calls authService.logout', async () => {
    let ctx!: AuthCtx;
    render(wrap(c => { ctx = c; }));
    await waitFor(() => expect(ctx?.loading).toBe(false));
    act(() => ctx.logout());
    expect(mockAuthService.logout).toHaveBeenCalled();
  });

  it('hasPermission returns false when not authenticated', async () => {
    let ctx!: AuthCtx;
    render(wrap(c => { ctx = c; }));
    await waitFor(() => expect(ctx?.loading).toBe(false));
    expect(ctx.hasPermission('admin')).toBe(false);
  });

  it('hasPermission returns true when user has permission', async () => {
    const user = { id: 1, username: 'bob', permissions: ['admin'] };
    mockAuthService.getUserInfo.mockReturnValue(user);
    mockAuthService.isAuthenticated.mockReturnValue(true);

    let ctx!: AuthCtx;
    render(wrap(c => { ctx = c; }));
    await waitFor(() => expect(ctx?.isAuthenticated).toBe(true));
    expect(ctx.hasPermission('admin')).toBe(true);
    expect(ctx.hasPermission('superuser')).toBe(false);
  });

  it('hasPermission includes realtime session permissions', async () => {
    const user = { id: 1, username: 'bob', permissions: [] };
    mockAuthService.getUserInfo.mockReturnValue(user);
    mockAuthService.isAuthenticated.mockReturnValue(true);
    useGameStore.setState({ permissions: ['compendium:read'] });

    let ctx!: AuthCtx;
    render(wrap(c => { ctx = c; }));
    await waitFor(() => expect(ctx?.isAuthenticated).toBe(true));

    expect(ctx.permissions).toContain('compendium:read');
    expect(ctx.hasPermission('compendium:read')).toBe(true);
  });

  it('requireAuth throws when not authenticated', async () => {
    let ctx!: AuthCtx;
    render(wrap(c => { ctx = c; }));
    await waitFor(() => expect(ctx?.loading).toBe(false));
    expect(() => ctx.requireAuth(() => 'x')).toThrow('Authentication required');
  });

  it('requireAuth returns operation result when authenticated', async () => {
    mockAuthService.getUserInfo.mockReturnValue({ id: 1, username: 'alice', permissions: [] });
    mockAuthService.isAuthenticated.mockReturnValue(true);

    let ctx!: AuthCtx;
    render(wrap(c => { ctx = c; }));
    await waitFor(() => expect(ctx?.isAuthenticated).toBe(true));
    expect(ctx.requireAuth(() => 42)).toBe(42);
  });

  it('updateUser merges user data', async () => {
    const user = { id: 1, username: 'alice', permissions: [] };
    mockAuthService.getUserInfo.mockReturnValue(user);
    mockAuthService.isAuthenticated.mockReturnValue(true);

    let ctx!: AuthCtx;
    render(wrap(c => { ctx = c; }));
    await waitFor(() => expect(ctx?.isAuthenticated).toBe(true));
    act(() => ctx.updateUser({ username: 'alice2' }));
    await waitFor(() => expect(ctx.user?.username).toBe('alice2'));
  });
});
