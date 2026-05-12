import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import UserMenu from '../UserMenu';

vi.mock('@app/providers', () => ({
  useAuth: () => mockAuth,
}));

let mockAuth: { user: { username: string; role: string } | null; logout: ReturnType<typeof vi.fn> };

beforeEach(() => {
  mockAuth = {
    user: { username: 'testuser', role: 'player' },
    logout: vi.fn(),
  };
});

describe('UserMenu', () => {
  it('renders null when user is absent', () => {
    mockAuth.user = null;
    const { container } = render(<UserMenu />);
    expect(container.firstChild).toBeNull();
  });

  it('shows username', () => {
    render(<UserMenu />);
    expect(screen.getByText('testuser')).toBeTruthy();
  });

  it('shows role', () => {
    render(<UserMenu />);
    expect(screen.getByText('player')).toBeTruthy();
  });

  it('shows role data attribute on root element', () => {
    const { container } = render(<UserMenu />);
    expect(container.firstChild).toHaveAttribute('data-user-role', 'player');
  });

  it('calls logout when button clicked', async () => {
    render(<UserMenu />);
    await userEvent.click(screen.getByRole('button', { name: /logout/i }));
    expect(mockAuth.logout).toHaveBeenCalledOnce();
  });
});
