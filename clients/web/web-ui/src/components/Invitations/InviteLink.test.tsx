import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InviteLink } from './InviteLink';

describe('InviteLink', () => {
  const mockOnRevoke = vi.fn();
  const baseInvite = {
    token: 'test-token-123',
    role: 'player',
    max_uses: 5,
    uses: 2,
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    is_active: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('renders invitation details', () => {
    render(<InviteLink invite={baseInvite} onRevoke={mockOnRevoke} />);
    expect(screen.getByText('player')).toBeInTheDocument();
    expect(screen.getByText(/2 \/ 5 uses/i)).toBeInTheDocument();
  });

  it('displays unlimited uses correctly', () => {
    const invite = { ...baseInvite, max_uses: null };
    render(<InviteLink invite={invite} onRevoke={mockOnRevoke} />);
    expect(screen.getByText(/2 uses/i)).toBeInTheDocument();
  });

  it('shows expiration time', () => {
    render(<InviteLink invite={baseInvite} onRevoke={mockOnRevoke} />);
    expect(screen.getByText(/Expires:/i)).toBeInTheDocument();
  });

  it('shows never expires for null expiration', () => {
    const invite = { ...baseInvite, expires_at: null };
    render(<InviteLink invite={invite} onRevoke={mockOnRevoke} />);
    expect(screen.getByText(/Never/i)).toBeInTheDocument();
  });

  it('generates correct invite URL', () => {
    render(<InviteLink invite={baseInvite} onRevoke={mockOnRevoke} />);
    const input = screen.getByDisplayValue(/test-token-123/);
    expect(input).toHaveValue(expect.stringContaining('test-token-123'));
  });

  it('copies link to clipboard', async () => {
    render(<InviteLink invite={baseInvite} onRevoke={mockOnRevoke} />);
    const copyButton = screen.getByText('Copy');
    fireEvent.click(copyButton);
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });

  it('shows copied confirmation', async () => {
    render(<InviteLink invite={baseInvite} onRevoke={mockOnRevoke} />);
    const copyButton = screen.getByText('Copy');
    fireEvent.click(copyButton);
    expect(await screen.findByText('Copied!')).toBeInTheDocument();
  });

  it('calls onRevoke when revoke clicked', () => {
    render(<InviteLink invite={baseInvite} onRevoke={mockOnRevoke} />);
    const revokeButton = screen.getByText('Revoke');
    fireEvent.click(revokeButton);
    expect(mockOnRevoke).toHaveBeenCalledWith('test-token-123');
  });

  it('marks inactive invitations', () => {
    const invite = { ...baseInvite, is_active: false };
    const { container } = render(<InviteLink invite={invite} onRevoke={mockOnRevoke} />);
    expect(container.querySelector('.invalid')).toBeInTheDocument();
  });

  it('marks expired invitations', () => {
    const invite = { ...baseInvite, expires_at: new Date(Date.now() - 1000).toISOString() };
    render(<InviteLink invite={invite} onRevoke={mockOnRevoke} />);
    expect(screen.getByText(/Expired/i)).toBeInTheDocument();
  });

  it('marks fully used invitations', () => {
    const invite = { ...baseInvite, uses: 5 };
    render(<InviteLink invite={invite} onRevoke={mockOnRevoke} />);
    expect(screen.getByText(/Full/i)).toBeInTheDocument();
  });

  it('disables revoke for inactive invitations', () => {
    const invite = { ...baseInvite, is_active: false };
    render(<InviteLink invite={invite} onRevoke={mockOnRevoke} />);
    const revokeButton = screen.getByText('Revoke');
    expect(revokeButton).toBeDisabled();
  });
});
