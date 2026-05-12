import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AuthGuard from '../AuthGuard';

vi.mock('@app/providers', () => ({
  useAuth: () => mockAuth,
}));

// LoginModal depends on @app/providers and @shared/components — stub it out
vi.mock('../LoginModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="login-modal" /> : null,
}));

let mockAuth: {
  user: { id: number; username: string; role: string } | null;
  isAuthenticated: boolean;
  loading: boolean;
};

beforeEach(() => {
  mockAuth = { user: { id: 1, username: 'u', role: 'player' }, isAuthenticated: true, loading: false };
});

describe('AuthGuard', () => {
  it('shows loading state while authenticating', () => {
    mockAuth.loading = true;
    mockAuth.isAuthenticated = false;
    render(<AuthGuard><div>content</div></AuthGuard>);
    expect(screen.getByText(/authenticating/i)).toBeTruthy();
  });

  it('renders children when authenticated', () => {
    render(<AuthGuard><div>protected content</div></AuthGuard>);
    expect(screen.getByText('protected content')).toBeTruthy();
  });

  it('shows auth required message when not authenticated', () => {
    mockAuth.isAuthenticated = false;
    mockAuth.user = null;
    render(<AuthGuard><div>secret</div></AuthGuard>);
    expect(screen.getByText(/authentication required/i)).toBeTruthy();
  });

  it('shows fallback when not authenticated and fallback provided', () => {
    mockAuth.isAuthenticated = false;
    mockAuth.user = null;
    render(<AuthGuard fallback={<div>fallback-content</div>}><div>secret</div></AuthGuard>);
    expect(screen.getByText('fallback-content')).toBeTruthy();
  });

  it('shows login modal when Login button is clicked', async () => {
    mockAuth.isAuthenticated = false;
    mockAuth.user = null;
    render(<AuthGuard><div>secret</div></AuthGuard>);
    await userEvent.click(screen.getByRole('button', { name: /login/i }));
    expect(screen.getByTestId('login-modal')).toBeTruthy();
  });

  it('shows access denied for wrong role', () => {
    mockAuth.user = { id: 1, username: 'u', role: 'player' };
    render(<AuthGuard requireRole="dm"><div>dm only</div></AuthGuard>);
    expect(screen.getByText(/access denied/i)).toBeTruthy();
  });

  it('renders children when role matches', () => {
    mockAuth.user = { id: 1, username: 'u', role: 'dm' };
    render(<AuthGuard requireRole="dm"><div>dm content</div></AuthGuard>);
    expect(screen.getByText('dm content')).toBeTruthy();
  });
});
