import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { InviteLink } from '@features/session/components/Invitations/InviteLink';
import type { SessionInvitation } from '@features/session/types/invitations';

function makeInvitation(overrides: Partial<SessionInvitation> = {}): SessionInvitation {
  return {
    id: 1,
    session_id: 10,
    invite_code: 'abc123',
    invite_url: '/join/abc123',
    pre_assigned_role: 'player',
    is_active: true,
    is_valid: true,
    uses_count: 0,
    max_uses: 5,
    expires_at: null,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  } as SessionInvitation;
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe('InviteLink', () => {
  it('renders the role and Active status', () => {
    render(<InviteLink invitation={makeInvitation()} onRevoke={vi.fn()} />);
    expect(screen.getByText('player')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows Revoked when is_active is false', () => {
    render(<InviteLink invitation={makeInvitation({ is_active: false })} onRevoke={vi.fn()} />);
    expect(screen.getByText('Revoked')).toBeInTheDocument();
  });

  it('shows Expired for past expires_at', () => {
    render(<InviteLink invitation={makeInvitation({ expires_at: '2000-01-01T00:00:00Z' })} onRevoke={vi.fn()} />);
    expect(screen.getByText(/Expired/)).toBeInTheDocument();
  });

  it('shows Used when max_uses reached', () => {
    render(<InviteLink invitation={makeInvitation({ max_uses: 2, uses_count: 2 })} onRevoke={vi.fn()} />);
    expect(screen.getByText('Used')).toBeInTheDocument();
  });

  it('shows unlimited uses (∞) when max_uses is 0', () => {
    render(<InviteLink invitation={makeInvitation({ max_uses: 0, uses_count: 1 })} onRevoke={vi.fn()} />);
    expect(screen.getByText(/∞/)).toBeInTheDocument();
  });

  it('uses full URL as-is when invite_url starts with https://', () => {
    render(<InviteLink invitation={makeInvitation({ invite_url: 'https://example.com/join/abc' })} onRevoke={vi.fn()} />);
    expect(screen.getByDisplayValue('https://example.com/join/abc')).toBeInTheDocument();
  });

  it('prepends window.location.origin for relative invite_url', () => {
    render(<InviteLink invitation={makeInvitation({ invite_url: '/join/xyz' })} onRevoke={vi.fn()} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe(`${window.location.origin}/join/xyz`);
  });

  it('Copy button copies to clipboard and shows Copied', async () => {
    render(<InviteLink invitation={makeInvitation()} onRevoke={vi.fn()} />);
    fireEvent.click(screen.getByText('Copy'));
    await waitFor(() => expect(screen.getByText('Copied')).toBeInTheDocument());
  });

  it('shows Revoke button for valid invitations and calls onRevoke', () => {
    const onRevoke = vi.fn();
    render(<InviteLink invitation={makeInvitation()} onRevoke={onRevoke} />);
    fireEvent.click(screen.getByText('Revoke'));
    expect(onRevoke).toHaveBeenCalledWith(1);
  });

  it('hides Revoke button for invalid invitations', () => {
    render(<InviteLink invitation={makeInvitation({ is_valid: false })} onRevoke={vi.fn()} />);
    expect(screen.queryByText('Revoke')).not.toBeInTheDocument();
  });

  it('shows Delete button when onDelete is provided', () => {
    const onDelete = vi.fn();
    render(<InviteLink invitation={makeInvitation()} onRevoke={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByText('Delete'));
    expect(onDelete).toHaveBeenCalledWith(1);
  });

  it('shows expires date when expires_at is provided', () => {
    render(<InviteLink invitation={makeInvitation({ expires_at: '2099-12-31T12:00:00Z' })} onRevoke={vi.fn()} />);
    expect(screen.getByText(/Expires/)).toBeInTheDocument();
  });

  it('Copy button is disabled when invitation is invalid', () => {
    render(<InviteLink invitation={makeInvitation({ is_valid: false })} onRevoke={vi.fn()} />);
    expect(screen.getByText('Copy')).toBeDisabled();
  });
});
