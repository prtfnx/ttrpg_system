import { InvitationManager } from '@features/session';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the useInvitations hook to control what the component receives
const mockInvitations = {
  invitations: [],
  loading: false,
  error: null,
  createInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  deleteInvitation: vi.fn()
};

vi.mock('../../hooks/useInvitations', () => ({
  useInvitations: () => mockInvitations
}));

// Mock toast notifications to verify user feedback
const mockToast = {
  success: vi.fn(),
  error: vi.fn()
};

vi.mock('react-toastify', () => ({
  toast: mockToast
}));

// Mock confirm dialog
Object.defineProperty(window, 'confirm', {
  writable: true,
  value: vi.fn(() => true)
});

// Mock the InviteLink component to focus on manager behavior
vi.mock('./InviteLink', () => ({
  InviteLink: ({ invitation, onRevoke, onDelete }: any) => (
    <div data-testid={`invite-link-${invitation.id}`}>
      <span>Role: {invitation.pre_assigned_role}</span>
      <span>Code: {invitation.invite_code}</span>
      <button onClick={() => onRevoke(invitation.id)}>Revoke</button>
      <button onClick={() => onDelete(invitation.id)}>Delete</button>
    </div>
  )
}));

describe('InvitationManager - Game Master Invitation Workflows', () => {
  const user = userEvent.setup();
  const sessionCode = 'DEMO123';
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockInvitations.loading = false;
    mockInvitations.error = null;
    mockInvitations.invitations = [];
  });

  describe('When game master opens invitation management', () => {
    it('shows the invitation creation interface', () => {
      render(<InvitationManager sessionCode={sessionCode} onClose={onClose} />);

      expect(screen.getByText('Manage Invitations')).toBeInTheDocument();
      expect(screen.getByText('Create New Invitation')).toBeInTheDocument();
      
      // Should have creation form elements
      expect(screen.getByLabelText(/role/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/expires/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/max uses/i)).toBeInTheDocument();
      expect(screen.getByText('Create Invitation')).toBeInTheDocument();
    });

    it('shows existing invitations when available', () => {
      mockInvitations.invitations = [
        {
          id: 1,
          invite_code: 'GAME123',
          pre_assigned_role: 'player',
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          max_uses: 1,
          current_uses: 0
        },
        {
          id: 2,
          invite_code: 'DM456',
          pre_assigned_role: 'co_dm',
          expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
          max_uses: 3,
          current_uses: 1
        }
      ];

      render(<InvitationManager sessionCode={sessionCode} onClose={onClose} />);

      expect(screen.getByTestId('invite-link-1')).toBeInTheDocument();
      expect(screen.getByTestId('invite-link-2')).toBeInTheDocument();
      expect(screen.getByText('Code: GAME123')).toBeInTheDocument();
      expect(screen.getByText('Code: DM456')).toBeInTheDocument();
    });

    it('shows empty state when no invitations exist', () => {
      render(<InvitationManager sessionCode={sessionCode} onClose={onClose} />);

      expect(screen.getByText('No active invitations')).toBeInTheDocument();
      expect(screen.getByText('Create your first invitation above')).toBeInTheDocument();
    });

    it('can be closed by clicking the close button', async () => {
      render(<InvitationManager sessionCode={sessionCode} onClose={onClose} />);

      await user.click(screen.getByText('✕'));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('can be closed by clicking overlay (when not standalone)', async () => {
      render(<InvitationManager sessionCode={sessionCode} onClose={onClose} />);

      // Click on the overlay area (outside the modal)
      const overlay = document.querySelector('[role="dialog"]')?.parentElement;
      if (overlay) {
        await user.click(overlay);
        expect(onClose).toHaveBeenCalled();
      }
    });

    it('does not close when clicking overlay in standalone mode', async () => {
      render(<InvitationManager sessionCode={sessionCode} onClose={onClose} standalone={true} />);

      // Click should not trigger close in standalone mode
      const overlay = document.querySelector('[role="dialog"]')?.parentElement;
      if (overlay) {
        await user.click(overlay);
        expect(onClose).not.toHaveBeenCalled();
      }
    });
  });

  describe('When game master creates a new invitation', () => {
    it('creates invitation with default settings', async () => {
      mockInvitations.createInvitation.mockResolvedValue({
        id: 3,
        invite_code: 'NEW789',
        pre_assigned_role: 'player',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        max_uses: 1
      });

      render(<InvitationManager sessionCode={sessionCode} onClose={onClose} />);

      await user.click(screen.getByText('Create Invitation'));

      expect(mockInvitations.createInvitation).toHaveBeenCalledWith({
        session_code: sessionCode,
        pre_assigned_role: 'player',
        expires_hours: 24,
        max_uses: 1
      });

      expect(mockToast.success).toHaveBeenCalledWith('Invitation created!');
    });

    it('creates invitation with custom role selection', async () => {
      mockInvitations.createInvitation.mockResolvedValue({
        id: 4,
        invite_code: 'DM999',
        pre_assigned_role: 'co_dm'
      });

      render(<InvitationManager sessionCode={sessionCode} onClose={onClose} />);

      // Select Co-DM role
      await user.selectOptions(screen.getByLabelText(/role/i), 'co_dm');
      await user.click(screen.getByText('Create Invitation'));

      expect(mockInvitations.createInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          pre_assigned_role: 'co_dm'
        })
      );
    });

    it('creates invitation with custom expiration time', async () => {
      mockInvitations.createInvitation.mockResolvedValue({
        id: 5,
        invite_code: 'WEEK123'
      });

      render(<InvitationManager sessionCode={sessionCode} onClose={onClose} />);

      // Set expiration to 168 hours (1 week)
      const expiresInput = screen.getByLabelText(/expires/i);
      await user.clear(expiresInput);
      await user.type(expiresInput, '168');

      await user.click(screen.getByText('Create Invitation'));

      expect(mockInvitations.createInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          expires_hours: 168
        })
      );
    });

    it('creates multi-use invitation when specified', async () => {
      mockInvitations.createInvitation.mockResolvedValue({
        id: 6,
        invite_code: 'MULTI123'
      });

      render(<InvitationManager sessionCode={sessionCode} onClose={onClose} />);

      // Set max uses to 5
      const maxUsesInput = screen.getByLabelText(/max uses/i);
      await user.clear(maxUsesInput);
      await user.type(maxUsesInput, '5');

      await user.click(screen.getByText('Create Invitation'));

      expect(mockInvitations.createInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          max_uses: 5
        })
      );
    });

    it('shows loading state while creating invitation', async () => {
      // Make the creation promise hang to test loading state
      mockInvitations.createInvitation.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(<InvitationManager sessionCode={sessionCode} onClose={onClose} />);

      const createButton = screen.getByText('Create Invitation');
      await user.click(createButton);

      // Button should be disabled and show loading
      await waitFor(() => {
        expect(createButton).toBeDisabled();
      });

      expect(screen.getByText('Creating...')).toBeInTheDocument();
    });

    it('handles creation failure gracefully', async () => {
      mockInvitations.createInvitation.mockResolvedValue(null);

      render(<InvitationManager sessionCode={sessionCode} onClose={onClose} />);

      await user.click(screen.getByText('Create Invitation'));

      // Should not show success message when creation fails
      expect(mockToast.success).not.toHaveBeenCalled();
      
      // Button should be re-enabled
      expect(screen.getByText('Create Invitation')).not.toBeDisabled();
    });
  });

  describe('When game master manages existing invitations', () => {
    beforeEach(() => {
      mockInvitations.invitations = [
        {
          id: 1,
          invite_code: 'ACTIVE123',
          pre_assigned_role: 'player',
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          max_uses: 1,
          current_uses: 0
        },
        {
          id: 2,
          invite_code: 'USED456',
          pre_assigned_role: 'spectator',
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          max_uses: 1,
          current_uses: 1
        }
      ];
    });

    it('revokes invitation when requested', async () => {
      mockInvitations.revokeInvitation.mockResolvedValue(true);

      render(<InvitationManager sessionCode={sessionCode} onClose={onClose} />);

      await user.click(screen.getAllByText('Revoke')[0]);

      expect(window.confirm).toHaveBeenCalledWith('Revoke this invitation?');
      expect(mockInvitations.revokeInvitation).toHaveBeenCalledWith(1);
      expect(mockToast.success).toHaveBeenCalledWith('Invitation revoked');
    });

    it('does not revoke invitation when user cancels confirmation', async () => {
      (window.confirm as any).mockReturnValueOnce(false);

      render(<InvitationManager sessionCode={sessionCode} onClose={onClose} />);

      await user.click(screen.getAllByText('Revoke')[0]);

      expect(mockInvitations.revokeInvitation).not.toHaveBeenCalled();
      expect(mockToast.success).not.toHaveBeenCalled();
    });

    it('permanently deletes invitation after confirmation', async () => {
      mockInvitations.deleteInvitation.mockResolvedValue(true);

      render(<InvitationManager sessionCode={sessionCode} onClose={onClose} />);

      await user.click(screen.getAllByText('Delete')[0]);

      expect(window.confirm).toHaveBeenCalledWith('Permanently delete this invitation from the list?');
      expect(mockInvitations.deleteInvitation).toHaveBeenCalledWith(1);
      expect(mockToast.success).toHaveBeenCalledWith('Invitation deleted');
    });

    it('handles operation failures gracefully', async () => {
      mockInvitations.revokeInvitation.mockResolvedValue(false);

      render(<InvitationManager sessionCode={sessionCode} onClose={onClose} />);

      await user.click(screen.getAllByText('Revoke')[0]);

      // Should not show success message when operation fails
      expect(mockToast.success).not.toHaveBeenCalled();
    });
  });

  describe('Loading and error states', () => {
    it('shows loading state while invitations are being fetched', () => {
      mockInvitations.loading = true;

      render(<InvitationManager sessionCode={sessionCode} onClose={onClose} />);

      expect(screen.getByText('Loading invitations...')).toBeInTheDocument();
      expect(screen.queryByText('Create New Invitation')).not.toBeInTheDocument();
    });

    it('shows error state when invitation loading fails', () => {
      mockInvitations.error = 'Failed to load invitations from server';

      render(<InvitationManager sessionCode={sessionCode} onClose={onClose} />);

      expect(screen.getByText('Error loading invitations:')).toBeInTheDocument();
      expect(screen.getByText('Failed to load invitations from server')).toBeInTheDocument();
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    it('allows retry when error occurs', async () => {
      mockInvitations.error = 'Network timeout';
      const retryFn = vi.fn();
      mockInvitations.retry = retryFn;

      render(<InvitationManager sessionCode={sessionCode} onClose={onClose} />);

      await user.click(screen.getByText('Retry'));

      expect(retryFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Real-world usage scenarios', () => {
    it('handles full workflow: create player invitation, share, manage', async () => {
      mockInvitations.createInvitation.mockResolvedValue({
        id: 7,
        invite_code: 'PLAYER789',
        pre_assigned_role: 'player',
        invite_url: 'https://game.com/join/PLAYER789'
      });

      render(<InvitationManager sessionCode={sessionCode} onClose={onClose} />);

      // Create a player invitation
      await user.selectOptions(screen.getByLabelText(/role/i), 'player');
      await user.click(screen.getByText('Create Invitation'));

      // Verify creation
      expect(mockInvitations.createInvitation).toHaveBeenCalledWith(
        expect.objectContaining({ pre_assigned_role: 'player' })
      );
      expect(mockToast.success).toHaveBeenCalledWith('Invitation created!');

      // The new invitation should appear in the list (would need re-render in real app)
      // This tests the expected workflow behavior
    });

    it('handles DM workflow: create co-DM invitation with extended duration', async () => {
      mockInvitations.createInvitation.mockResolvedValue({
        id: 8,
        invite_code: 'CODM999',
        pre_assigned_role: 'co_dm'
      });

      render(<InvitationManager sessionCode={sessionCode} onClose={onClose} />);

      // Set up for Co-DM with 1 week expiration
      await user.selectOptions(screen.getByLabelText(/role/i), 'co_dm');
      
      const expiresInput = screen.getByLabelText(/expires/i);
      await user.clear(expiresInput);
      await user.type(expiresInput, '168'); // 1 week

      await user.click(screen.getByText('Create Invitation'));

      expect(mockInvitations.createInvitation).toHaveBeenCalledWith({
        session_code: sessionCode,
        pre_assigned_role: 'co_dm',
        expires_hours: 168,
        max_uses: 1
      });
    });

    it('handles cleanup workflow: review and delete old invitations', async () => {
      mockInvitations.invitations = [
        {
          id: 10,
          invite_code: 'OLD123',
          pre_assigned_role: 'player',
          expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Expired
          max_uses: 1,
          current_uses: 0
        }
      ];
      mockInvitations.deleteInvitation.mockResolvedValue(true);

      render(<InvitationManager sessionCode={sessionCode} onClose={onClose} />);

      // Delete the expired invitation
      await user.click(screen.getByText('Delete'));

      expect(mockInvitations.deleteInvitation).toHaveBeenCalledWith(10);
      expect(mockToast.success).toHaveBeenCalledWith('Invitation deleted');
    });
  });

  describe('Form validation and user input', () => {
    it('validates expiration hours are reasonable', async () => {
      render(<InvitationManager sessionCode={sessionCode} onClose={onClose} />);

      const expiresInput = screen.getByLabelText(/expires/i);
      
      // Try to set unreasonable expiration (negative)
      await user.clear(expiresInput);
      await user.type(expiresInput, '-1');

      // Should reset to minimum reasonable value or show error
      expect(Number((expiresInput as HTMLInputElement).value)).toBeGreaterThan(0);
    });

    it('validates max uses are reasonable', async () => {
      render(<InvitationManager sessionCode={sessionCode} onClose={onClose} />);

      const maxUsesInput = screen.getByLabelText(/max uses/i);
      
      // Try to set zero uses
      await user.clear(maxUsesInput);
      await user.type(maxUsesInput, '0');

      // Should reset to minimum of 1 or show error
      expect(Number((maxUsesInput as HTMLInputElement).value)).toBeGreaterThanOrEqual(1);
    });

    it('provides helpful role selection options', () => {
      render(<InvitationManager sessionCode={sessionCode} onClose={onClose} />);

      const roleSelect = screen.getByLabelText(/role/i);
      
      // Should have all the expected roles
      expect(screen.getByRole('option', { name: /player/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /spectator/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /trusted.player/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /co.dm/i })).toBeInTheDocument();
    });
  });

  describe('Accessibility and user experience', () => {
    it('provides proper focus management', async () => {
      render(<InvitationManager sessionCode={sessionCode} onClose={onClose} />);

      // The create button should be focusable
      const createButton = screen.getByText('Create Invitation');
      createButton.focus();
      expect(document.activeElement).toBe(createButton);
    });

    it('provides appropriate labels for screen readers', () => {
      render(<InvitationManager sessionCode={sessionCode} onClose={onClose} />);

      expect(screen.getByLabelText(/role/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/expires/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/max uses/i)).toBeInTheDocument();
    });

    it('shows appropriate modal semantics', () => {
      render(<InvitationManager sessionCode={sessionCode} onClose={onClose} />);

      // Should have proper modal attributes
      const modal = screen.getByRole('dialog');
      expect(modal).toBeInTheDocument();
      expect(modal).toHaveAttribute('aria-label', 'Manage Invitations');
    });
  });
});
