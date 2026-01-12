import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionInvitation } from '../../types/invitations';
import { useInvitations } from '../../hooks/useInvitations';
import { InvitationManager } from './InvitationManager';

vi.mock('../../hooks/useInvitations');
vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

global.confirm = vi.fn(() => true);

describe('InvitationManager', () => {
  const mockOnClose = vi.fn();
  const mockCreateInvitation = vi.fn();
  const mockRevokeInvitation = vi.fn();
  const mockRefetch = vi.fn();
  
  const mockInvitations: SessionInvitation[] = [
    {
      id: 1,
      invite_code: 'CODE123',
      session_code: 'TEST123',
      pre_assigned_role: 'player',
      created_at: '2026-01-01T00:00:00Z',
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      max_uses: 5,
      uses_count: 2,
      is_active: true,
      is_valid: true,
      invite_url: '/join/CODE123',
    },
    {
      id: 2,
      invite_code: 'CODE456',
      session_code: 'TEST123',
      pre_assigned_role: 'spectator',
      created_at: '2026-01-01T00:00:00Z',
      expires_at: null,
      max_uses: 0,
      uses_count: 0,
      is_active: true,
      is_valid: true,
      invite_url: '/join/CODE456',
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
      refetch: mockRefetch,
    });
    mockCreateInvitation.mockResolvedValue(mockInvitations[0]);
    mockRevokeInvitation.mockResolvedValue(true);
  });

  it('renders modal with title', () => {
    render(<InvitationManager sessionCode="TEST123" onClose={mockOnClose} />);
    expect(screen.getByText('Manage Invitations')).toBeInTheDocument();
  });

  it('shows create invitation form', () => {
    render(<InvitationManager sessionCode="TEST123" onClose={mockOnClose} />);
    expect(screen.getByLabelText(/Role/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Expires in/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Max uses/i)).toBeInTheDocument();
  });

  it('displays existing invitations', () => {
    render(<InvitationManager sessionCode="TEST123" onClose={mockOnClose} />);
    expect(screen.getByText('player')).toBeInTheDocument();
    expect(screen.getByText('spectator')).toBeInTheDocument();
  });

  it('creates invitation on form submit', async () => {
    render(<InvitationManager sessionCode="TEST123" onClose={mockOnClose} />);
    
    const roleSelect = screen.getByLabelText(/Role/i);
    fireEvent.change(roleSelect, { target: { value: 'player' } });
    
    const createButton = screen.getByText('Create Invitation');
    fireEvent.click(createButton);
    
    await waitFor(() => {
      expect(mockCreateInvitation).toHaveBeenCalledWith(expect.objectContaining({
        session_code: 'TEST123',
        pre_assigned_role: 'player',
      }));
    });
  });

  it('handles creation with custom max uses', async () => {
    render(<InvitationManager sessionCode="TEST123" onClose={mockOnClose} />);
    
    const maxUsesInput = screen.getByLabelText(/Max uses/i);
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
    render(<InvitationManager sessionCode="TEST123" onClose={mockOnClose} />);
    
    const durationInput = screen.getByLabelText(/Expires in/i);
    fireEvent.change(durationInput, { target: { value: '48' } });
    
    const createButton = screen.getByText('Create Invitation');
    fireEvent.click(createButton);
    
    await waitFor(() => {
      expect(mockCreateInvitation).toHaveBeenCalledWith(expect.objectContaining({
        expires_hours: 48,
      }));
    });
  });

  it('closes modal on close button click', () => {
    render(<InvitationManager sessionCode="TEST123" onClose={mockOnClose} />);
    const closeButton = screen.getByText('✕');
    fireEvent.click(closeButton);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('closes modal on overlay click', () => {
    const { container } = render(<InvitationManager sessionCode="TEST123" onClose={mockOnClose} />);
    const overlay = container.querySelector(`.${styles.overlay}`) || container.firstChild;
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
      refetch: mockRefetch,
    });
    render(<InvitationManager sessionCode="TEST123" onClose={mockOnClose} />);
    const buttons = screen.getAllByRole('button');
    const createButton = buttons.find(b => b.textContent?.includes('Create'));
    expect(createButton).toBeDisabled();
  });

  it('shows empty state', () => {
    (useInvitations as any).mockReturnValue({
      invitations: [],
      loading: false,
      error: null,
      createInvitation: mockCreateInvitation,
      revokeInvitation: mockRevokeInvitation,
      refetch: mockRefetch,
    });
    render(<InvitationManager sessionCode="TEST123" onClose={mockOnClose} />);
    expect(screen.getByText('Create New Invitation')).toBeInTheDocument();
  });
});
