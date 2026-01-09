import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useInvitations } from '../../hooks/useInvitations';
import { InvitationManager } from './InvitationManager';

vi.mock('../../hooks/useInvitations');

describe('InvitationManager', () => {
  const mockOnClose = vi.fn();
  const mockCreateInvitation = vi.fn();
  const mockRevokeInvitation = vi.fn();
  const mockInvitations = [
    {
      token: 'token123',
      role: 'player',
      max_uses: 5,
      uses: 2,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      is_active: true,
    },
    {
      token: 'token456',
      role: 'spectator',
      max_uses: null,
      uses: 0,
      expires_at: null,
      is_active: true,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (useInvitations as any).mockReturnValue({
      invitations: mockInvitations,
      loading: false,
      error: null,
      createInvitation: mockCreateInvitation,
      revokeInvitation: mockRevokeInvitation,
    });
  });

  it('renders modal with title', () => {
    render(<InvitationManager onClose={mockOnClose} />);
    expect(screen.getByText('Manage Invitations')).toBeInTheDocument();
  });

  it('shows create invitation form', () => {
    render(<InvitationManager onClose={mockOnClose} />);
    expect(screen.getByLabelText(/Role/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Max Uses/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Duration/i)).toBeInTheDocument();
  });

  it('displays existing invitations', () => {
    render(<InvitationManager onClose={mockOnClose} />);
    expect(screen.getByText(/player/i)).toBeInTheDocument();
    expect(screen.getByText(/spectator/i)).toBeInTheDocument();
  });

  it('creates invitation on form submit', async () => {
    mockCreateInvitation.mockResolvedValueOnce({});
    render(<InvitationManager onClose={mockOnClose} />);
    
    const roleSelect = screen.getByLabelText(/Role/i);
    fireEvent.change(roleSelect, { target: { value: 'player' } });
    
    const createButton = screen.getByText('Create Invitation');
    fireEvent.click(createButton);
    
    await waitFor(() => {
      expect(mockCreateInvitation).toHaveBeenCalledWith(expect.objectContaining({
        role: 'player',
      }));
    });
  });

  it('handles creation with custom max uses', async () => {
    mockCreateInvitation.mockResolvedValueOnce({});
    render(<InvitationManager onClose={mockOnClose} />);
    
    const maxUsesInput = screen.getByLabelText(/Max Uses/i);
    fireEvent.change(maxUsesInput, { target: { value: '10' } });
    
    const createButton = screen.getByText('Create Invitation');
    fireEvent.click(createButton);
    
    await waitFor(() => {
      expect(mockCreateInvitation).toHaveBeenCalledWith(expect.objectContaining({
        max_uses: 10,
      }));
    });
  });

  it('handles creation with duration', async () => {
    mockCreateInvitation.mockResolvedValueOnce({});
    render(<InvitationManager onClose={mockOnClose} />);
    
    const durationSelect = screen.getByLabelText(/Duration/i);
    fireEvent.change(durationSelect, { target: { value: '24' } });
    
    const createButton = screen.getByText('Create Invitation');
    fireEvent.click(createButton);
    
    await waitFor(() => {
      expect(mockCreateInvitation).toHaveBeenCalledWith(expect.objectContaining({
        hours: 24,
      }));
    });
  });

  it('closes modal on close button click', () => {
    render(<InvitationManager onClose={mockOnClose} />);
    const closeButton = screen.getByText('×');
    fireEvent.click(closeButton);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('closes modal on overlay click', () => {
    render(<InvitationManager onClose={mockOnClose} />);
    const overlay = screen.getByTestId('modal-overlay') || document.querySelector('.overlay');
    if (overlay) {
      fireEvent.click(overlay);
      expect(mockOnClose).toHaveBeenCalled();
    }
  });

  it('shows loading state', () => {
    (useInvitations as any).mockReturnValue({
      invitations: [],
      loading: true,
      error: null,
      createInvitation: mockCreateInvitation,
      revokeInvitation: mockRevokeInvitation,
    });
    render(<InvitationManager onClose={mockOnClose} />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  it('shows empty state', () => {
    (useInvitations as any).mockReturnValue({
      invitations: [],
      loading: false,
      error: null,
      createInvitation: mockCreateInvitation,
      revokeInvitation: mockRevokeInvitation,
    });
    render(<InvitationManager onClose={mockOnClose} />);
    expect(screen.getByText(/No active invitations/i)).toBeInTheDocument();
  });
});
