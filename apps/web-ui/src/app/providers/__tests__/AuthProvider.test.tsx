import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import React from 'react';

const mockAuthService = vi.hoisted(() => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  getUserInfo: vi.fn().mockReturnValue(null),
  isAuthenticated: vi.fn().mockReturnValue(false),
  logout: vi.fn(),
}));

vi.mock('@features/auth/services/auth.service', () => ({
  authService: mockAuthService,
}));

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
    const user = { id: 1, username: 'alice', role: 'dm' as const, permissions: [] };
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

  it('login calls fetch and re-initializes on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    let ctx!: AuthCtx;
    render(wrap(c => { ctx = c; }));
    await waitFor(() => expect(mockAuthService.initialize).toHaveBeenCalledTimes(1));

    await act(async () => { await ctx.login('alice', 'pass'); });

    expect(fetchMock).toHaveBeenCalledWith('/users/login', expect.objectContaining({ method: 'POST' }));
    expect(mockAuthService.initialize).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it('login returns false on failed fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, text: vi.fn().mockResolvedValue('error') }));

    let ctx!: AuthCtx;
    render(wrap(c => { ctx = c; }));
    await waitFor(() => expect(ctx?.loading).toBe(false));

    let result!: boolean;
    await act(async () => { result = await ctx.login('alice', 'wrong'); });
    expect(result).toBe(false);
    vi.unstubAllGlobals();
  });

  it('login returns false on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('net error')));

    let ctx!: AuthCtx;
    render(wrap(c => { ctx = c; }));
    await waitFor(() => expect(ctx?.loading).toBe(false));

    let result!: boolean;
    await act(async () => { result = await ctx.login('alice', 'pass'); });
    expect(result).toBe(false);
    vi.unstubAllGlobals();
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
    const user = { id: 1, username: 'bob', role: 'dm' as const, permissions: ['admin'] };
    mockAuthService.getUserInfo.mockReturnValue(user);
    mockAuthService.isAuthenticated.mockReturnValue(true);

    let ctx!: AuthCtx;
    render(wrap(c => { ctx = c; }));
    await waitFor(() => expect(ctx?.isAuthenticated).toBe(true));
    expect(ctx.hasPermission('admin')).toBe(true);
    expect(ctx.hasPermission('superuser')).toBe(false);
  });

  it('requireAuth throws when not authenticated', async () => {
    let ctx!: AuthCtx;
    render(wrap(c => { ctx = c; }));
    await waitFor(() => expect(ctx?.loading).toBe(false));
    expect(() => ctx.requireAuth(() => 'x')).toThrow('Authentication required');
  });

  it('requireAuth returns operation result when authenticated', async () => {
    mockAuthService.getUserInfo.mockReturnValue({ id: 1, username: 'alice', role: 'dm' as const, permissions: [] });
    mockAuthService.isAuthenticated.mockReturnValue(true);

    let ctx!: AuthCtx;
    render(wrap(c => { ctx = c; }));
    await waitFor(() => expect(ctx?.isAuthenticated).toBe(true));
    expect(ctx.requireAuth(() => 42)).toBe(42);
  });

  it('updateUser merges user data', async () => {
    const user = { id: 1, username: 'alice', role: 'dm' as const, permissions: [] };
    mockAuthService.getUserInfo.mockReturnValue(user);
    mockAuthService.isAuthenticated.mockReturnValue(true);

    let ctx!: AuthCtx;
    render(wrap(c => { ctx = c; }));
    await waitFor(() => expect(ctx?.isAuthenticated).toBe(true));
    act(() => ctx.updateUser({ username: 'alice2' }));
    await waitFor(() => expect(ctx.user?.username).toBe('alice2'));
  });
});
