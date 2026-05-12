import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LoginModal from '../LoginModal';

vi.mock('@app/providers', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('@shared/components', () => ({
  Modal: ({ isOpen, children, title }: { isOpen: boolean; children: React.ReactNode; title?: string }) =>
    isOpen ? <div role="dialog"><h2>{title}</h2>{children}</div> : null,
}));

let mockAuth: {
  login: ReturnType<typeof vi.fn>;
  loading: boolean;
  error: string;
};

beforeEach(() => {
  mockAuth = { login: vi.fn(() => Promise.resolve(true)), loading: false, error: '' };
});

describe('LoginModal', () => {
  it('renders nothing when isOpen=false', () => {
    render(<LoginModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders form when isOpen=true', () => {
    render(<LoginModal isOpen onClose={vi.fn()} />);
    expect(screen.getByLabelText(/username/i)).toBeTruthy();
    expect(screen.getByLabelText(/password/i)).toBeTruthy();
  });

  it('submit button is disabled when username is empty', () => {
    render(<LoginModal isOpen onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /login/i })).toBeDisabled();
  });

  it('submit button is disabled when password is empty', async () => {
    render(<LoginModal isOpen onClose={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/username/i), 'john');
    expect(screen.getByRole('button', { name: /login/i })).toBeDisabled();
  });

  it('shows error when username too short', async () => {
    render(<LoginModal isOpen onClose={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/username/i), 'jo');
    await userEvent.type(screen.getByLabelText(/password/i), 'pass');
    await userEvent.click(screen.getByRole('button', { name: /login/i }));
    expect(screen.getByText(/at least 4 characters/i)).toBeTruthy();
  });

  it('shows error when password too short', async () => {
    render(<LoginModal isOpen onClose={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/username/i), 'john');
    await userEvent.type(screen.getByLabelText(/password/i), 'pas');
    await userEvent.click(screen.getByRole('button', { name: /login/i }));
    expect(screen.getByText(/at least 4 characters/i)).toBeTruthy();
  });

  it('calls login and closes on successful submit', async () => {
    const onClose = vi.fn();
    render(<LoginModal isOpen onClose={onClose} />);
    await userEvent.type(screen.getByLabelText(/username/i), 'john');
    await userEvent.type(screen.getByLabelText(/password/i), 'secret');
    await userEvent.click(screen.getByRole('button', { name: /login/i }));
    await waitFor(() => expect(mockAuth.login).toHaveBeenCalledWith('john', 'secret'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('does not close on failed login', async () => {
    mockAuth.login = vi.fn(() => Promise.resolve(false));
    const onClose = vi.fn();
    render(<LoginModal isOpen onClose={onClose} />);
    await userEvent.type(screen.getByLabelText(/username/i), 'john');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /login/i }));
    await waitFor(() => expect(mockAuth.login).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });
});
