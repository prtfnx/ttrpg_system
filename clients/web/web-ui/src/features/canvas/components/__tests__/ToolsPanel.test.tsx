import { useGameStore } from '@/store';
import type { UserInfo } from '@features/auth';
import { ToolsPanel } from '@features/canvas';
import { ProtocolService } from '@lib/api';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock ProtocolService
vi.mock('@lib/api', () => ({
  ProtocolService: {
    hasProtocol: vi.fn(),
    getProtocol: vi.fn(),
  },
}));

describe('ToolsPanel - User Behavior Tests', () => {
  const mockUserInfo: UserInfo = { 
    id: 123, 
    username: 'testuser', 
    role: 'player', 
    permissions: [] 
  };

  beforeEach(() => {
    // Reset store
    useGameStore.setState({
      sprites: [],
      characters: [],
      user: { id: 123, username: 'testuser', email: 'test@example.com' },
    });

    // Mock protocol with basic ping functionality
    const mockProtocol = {
      startPing: vi.fn(),
      stopPing: vi.fn(),
      isPingEnabled: vi.fn(() => false),
    };

    vi.mocked(ProtocolService.hasProtocol).mockReturnValue(true);
    vi.mocked(ProtocolService.getProtocol).mockReturnValue(mockProtocol as any);
  });

  describe('Heartbeat Monitor Display', () => {
    it('should show heartbeat monitor checkbox with proper label', () => {
      render(<ToolsPanel userInfo={mockUserInfo} />);

      // User should see the heartbeat monitor option
      const checkbox = screen.getByRole('checkbox', { name: /heartbeat monitor/i });
      expect(checkbox).toBeInTheDocument();
    });

    it('should display inactive status by default', () => {
      render(<ToolsPanel userInfo={mockUserInfo} />);

      // User should see that heartbeat is inactive
      expect(screen.getByText(/○ inactive/i)).toBeInTheDocument();
    });

    it('should show network settings description', () => {
      render(<ToolsPanel userInfo={mockUserInfo} />);

      // User should see helpful description
      expect(screen.getByText(/sends ping every 30s/i)).toBeInTheDocument();
      expect(screen.getByText(/timeout: 5s/i)).toBeInTheDocument();
    });
  });

  describe('Heartbeat Monitor Interaction', () => {
    it('should update visual status when user enables heartbeat', async () => {
      const user = userEvent.setup();
      render(<ToolsPanel userInfo={mockUserInfo} />);

      const checkbox = screen.getByRole('checkbox', { name: /heartbeat monitor/i });
      
      // Initially shows inactive
      expect(screen.getByText(/○ inactive/i)).toBeInTheDocument();
      expect(screen.queryByText(/● active/i)).not.toBeInTheDocument();

      // User clicks to enable
      await user.click(checkbox);

      // Status should change to active
      expect(screen.getByText(/● active/i)).toBeInTheDocument();
      expect(screen.queryByText(/○ inactive/i)).not.toBeInTheDocument();
    });

    it('should toggle status back to inactive when clicked again', async () => {
      const user = userEvent.setup();
      render(<ToolsPanel userInfo={mockUserInfo} />);

      const checkbox = screen.getByRole('checkbox', { name: /heartbeat monitor/i });
      
      // Enable first
      await user.click(checkbox);
      expect(screen.getByText(/● active/i)).toBeInTheDocument();

      // Disable
      await user.click(checkbox);
      expect(screen.getByText(/○ inactive/i)).toBeInTheDocument();
    });

    it('should work when protocol is not available', async () => {
      const user = userEvent.setup();
      
      // Simulate no protocol available
      vi.mocked(ProtocolService.hasProtocol).mockReturnValue(false);
      
      render(<ToolsPanel userInfo={mockUserInfo} />);

      const checkbox = screen.getByRole('checkbox', { name: /heartbeat monitor/i });
      
      // User can still interact with checkbox
      await user.click(checkbox);
      
      // Visual feedback still works
      expect(screen.getByText(/● active/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper checkbox role', () => {
      render(<ToolsPanel userInfo={mockUserInfo} />);

      const checkbox = screen.getByRole('checkbox', { name: /heartbeat monitor/i });
      expect(checkbox).toHaveAttribute('type', 'checkbox');
    });

    it('should have proper id for label association', () => {
      render(<ToolsPanel userInfo={mockUserInfo} />);

      const checkbox = screen.getByRole('checkbox', { name: /heartbeat monitor/i });
      expect(checkbox).toHaveAttribute('id', 'ping-toggle');
    });

    it('should be keyboard accessible', async () => {
      const user = userEvent.setup();
      render(<ToolsPanel userInfo={mockUserInfo} />);

      const checkbox = screen.getByRole('checkbox', { name: /heartbeat monitor/i });
      
      // Focus the checkbox
      checkbox.focus();
      expect(checkbox).toHaveFocus();

      // Press space to toggle
      await user.keyboard(' ');
      
      // Status should change
      expect(screen.getByText(/● active/i)).toBeInTheDocument();
    });
  });

  describe('Tool Panel Structure', () => {
    it('should render network settings section', () => {
      render(<ToolsPanel userInfo={mockUserInfo} />);

      // User should see the network settings heading
      expect(screen.getByRole('heading', { name: /network settings/i })).toBeInTheDocument();
    });
  });
});
