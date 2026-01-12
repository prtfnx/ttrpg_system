import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionInvitation } from '../../types/invitations';
import { InviteLink } from './InviteLink';

describe('InviteLink', () => {
  const mockOnRevoke = vi.fn();
  const baseInvite: SessionInvitation = {
    id: 1,
    invite_code: 'test-code-123',
    session_code: 'TEST123',
    pre_assigned_role: 'player',
    created_at: '2026-01-01T00:00:00Z',
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    max_uses: 5,
    uses_count: 2,
    is_active: true,
    is_valid: true,
    invite_url: '/join/test-code-123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    Object.defineProperty(window, 'location', {
      value: { origin: 'http://localhost:3000' },
      writable: true,
    });
  });

  it('renders invitation details', () => {
    render(<InviteLink invitation={baseInvite} onRevoke={mockOnRevoke} />);
    expect(screen.getByText('player')).toBeInTheDocument();
    expect(screen.getByText(/2\/5/i)).toBeInTheDocument();
  });

  it('displays unlimited uses correctly', () => {
    const invite = { ...baseInvite, max_uses: 0, uses_count: 2 };
    render(<InviteLink invitation={invite} onRevoke={mockOnRevoke} />);
    expect(screen.getByText(/2\/∞/i)).toBeInTheDocument();
  });

  it('shows expiration time', () => {
    render(<InviteLink invitation={baseInvite} onRevoke={mockOnRevoke} />);
    expect(screen.getByText(/Expires:/i)).toBeInTheDocument();
  });

  it('shows never expires for null expiration', () => {
    const invite = { ...baseInvite, expires_at: undefined };
    const { container } = render(<InviteLink invitation={invite} onRevoke={mockOnRevoke} />);
    const detailsSection = container.querySelector('.details');
    expect(detailsSection).toBeInTheDocument();
  });

  it('generates correct invite URL', () => {
    render(<InviteLink invitation={baseInvite} onRevoke={mockOnRevoke} />);
    const input = screen.getByDisplayValue(/test-code-123/);
    expect(input).toHaveValue('http://localhost:3000/join/test-code-123');
  });

  it('copies link to clipboard', async () => {
    render(<InviteLink invitation={baseInvite} onRevoke={mockOnRevoke} />);
    const copyButton = screen.getByText('📋');
    fireEvent.click(copyButton);
    
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://localhost:3000/join/test-code-123');
    });
  });

  it('shows copied confirmation', async () => {
    render(<InviteLink invitation={baseInvite} onRevoke={mockOnRevoke} />);
    const copyButton = screen.getByText('📋');
    fireEvent.click(copyButton);
    
    await waitFor(() => {
      expect(screen.getByText('✓')).toBeInTheDocument();
    });
  });

  it('calls onRevoke when revoke clicked', () => {
    render(<InviteLink invitation={baseInvite} onRevoke={mockOnRevoke} />);
    const revokeButton = screen.getByText('Revoke');
    fireEvent.click(revokeButton);
    expect(mockOnRevoke).toHaveBeenCalledWith(1);
  });

  it('marks inactive invitations', () => {
    const invite = { ...baseInvite, is_active: false, is_valid: false };
    const { container } = render(<InviteLink invitation={invite} onRevoke={mockOnRevoke} />);
    expect(container.querySelector('.invalid')).toBeInTheDocument();
    expect(screen.getByText(/Revoked/i)).toBeInTheDocument();
  });

  it('marks expired invitations', () => {
    const invite = { ...baseInvite, expires_at: new Date(Date.now() - 1000).toISOString() };
    render(<InviteLink invitation={invite} onRevoke={mockOnRevoke} />);
    expect(screen.getByText(/Expired/i)).toBeInTheDocument();
  });

  it('marks fully used invitations', () => {
    const invite = { ...baseInvite, uses_count: 5, max_uses: 5 };
    render(<InviteLink invitation={invite} onRevoke={mockOnRevoke} />);
    expect(screen.getByText(/Used up/i)).toBeInTheDocument();
  });

  it('disables revoke for inactive invitations', () => {
    const invite = { ...baseInvite, is_active: false, is_valid: false };
    render(<InviteLink invitation={invite} onRevoke={mockOnRevoke} />);
    expect(screen.queryByText('Revoke')).not.toBeInTheDocument();
  });
});
