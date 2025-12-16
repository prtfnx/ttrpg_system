import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToolsPanel } from '../ToolsPanel';
import { ProtocolService } from '../../services/ProtocolService';
import { useGameStore } from '../../stores/gameStore';

// Mock ProtocolService only (WASM is auto-mocked via vitest.config.ts)
vi.mock('../../services/ProtocolService', () => ({
  ProtocolService: {
    hasProtocol: vi.fn(),
    getProtocol: vi.fn(),
  },
}));

describe('ToolsPanel - Ping Toggle Tests', () => {
  let mockStartPing: ReturnType<typeof vi.fn>;
  let mockStopPing: ReturnType<typeof vi.fn>;
  const mockUserInfo = { id: 123, username: 'testuser', role: 'player' as const, permissions: [] };

  beforeEach(() => {
    // Reset store
    useGameStore.setState({
      sprites: [],
      characters: [],
      user: { id: 123, username: 'testuser', email: 'test@example.com' },
    });

    // Create mock protocol methods
    mockStartPing = vi.fn();
    mockStopPing = vi.fn();

    // Setup ProtocolService mocks
    vi.mocked(ProtocolService.hasProtocol).mockReturnValue(true);
    vi.mocked(ProtocolService.getProtocol).mockReturnValue({
      startPing: mockStartPing,
      stopPing: mockStopPing,
    } as any);

    vi.clearAllMocks();
  });

  describe('Ping Toggle Interaction', () => {
    it('should render ping toggle checkbox in inactive state by default', () => {
      render(<ToolsPanel userInfo={mockUserInfo} />);

      const pingCheckbox = screen.getByLabelText(/keep-alive ping/i);
      expect(pingCheckbox).toBeDefined();
      expect((pingCheckbox as HTMLInputElement).checked).toBe(false);

      const statusText = screen.getByText(/inactive/i);
      expect(statusText).toBeDefined();
    });

    it('should call startPing when toggle is enabled', async () => {
      const user = userEvent.setup();
      render(<ToolsPanel />);

      const pingCheckbox = screen.getByLabelText(/keep-alive ping/i);
      await user.click(pingCheckbox);

      expect(ProtocolService.hasProtocol).toHaveBeenCalled();
      expect(ProtocolService.getProtocol).toHaveBeenCalled();
      expect(mockStartPing).toHaveBeenCalledTimes(1);
      expect(mockStopPing).not.toHaveBeenCalled();
    });

    it('should call stopPing when toggle is disabled', async () => {
      const user = userEvent.setup();
      render(<ToolsPanel />);

      const pingCheckbox = screen.getByLabelText(/keep-alive ping/i);
      
      // Enable ping first
      await user.click(pingCheckbox);
      expect(mockStartPing).toHaveBeenCalledTimes(1);
      
      // Disable ping
      await user.click(pingCheckbox);
      expect(mockStopPing).toHaveBeenCalledTimes(1);
    });

    it('should update visual status indicator when toggle changes', async () => {
      const user = userEvent.setup();
      render(<ToolsPanel />);

      const pingCheckbox = screen.getByLabelText(/keep-alive ping/i);
      
      // Initial state - inactive
      let statusText = screen.getByText(/inactive/i);
      expect(statusText).toBeDefined();

      // Enable ping
      await user.click(pingCheckbox);
      statusText = screen.getByText(/active/i);
      expect(statusText).toBeDefined();

      // Disable ping
      await user.click(pingCheckbox);
      statusText = screen.getByText(/inactive/i);
      expect(statusText).toBeDefined();
    });

    it('should not call protocol methods when protocol is not available', async () => {
      const user = userEvent.setup();
      
      // Mock protocol not available
      vi.mocked(ProtocolService.hasProtocol).mockReturnValue(false);
      
      render(<ToolsPanel />);

      const pingCheckbox = screen.getByLabelText(/keep-alive ping/i);
      await user.click(pingCheckbox);

      expect(ProtocolService.hasProtocol).toHaveBeenCalled();
      expect(ProtocolService.getProtocol).not.toHaveBeenCalled();
      expect(mockStartPing).not.toHaveBeenCalled();
    });

    it('should toggle ping multiple times correctly', async () => {
      const user = userEvent.setup();
      render(<ToolsPanel />);

      const pingCheckbox = screen.getByLabelText(/keep-alive ping/i);
      
      // Toggle on
      await user.click(pingCheckbox);
      expect(mockStartPing).toHaveBeenCalledTimes(1);
      expect(mockStopPing).toHaveBeenCalledTimes(0);

      // Toggle off
      await user.click(pingCheckbox);
      expect(mockStartPing).toHaveBeenCalledTimes(1);
      expect(mockStopPing).toHaveBeenCalledTimes(1);

      // Toggle on again
      await user.click(pingCheckbox);
      expect(mockStartPing).toHaveBeenCalledTimes(2);
      expect(mockStopPing).toHaveBeenCalledTimes(1);

      // Toggle off again
      await user.click(pingCheckbox);
      expect(mockStartPing).toHaveBeenCalledTimes(2);
      expect(mockStopPing).toHaveBeenCalledTimes(2);
    });

    it('should maintain checkbox state across re-renders', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<ToolsPanel />);

      const pingCheckbox = screen.getByLabelText(/keep-alive ping/i) as HTMLInputElement;
      
      // Enable ping
      await user.click(pingCheckbox);
      expect(pingCheckbox.checked).toBe(true);

      // Force re-render
      rerender(<ToolsPanel />);
      
      const pingCheckboxAfterRerender = screen.getByLabelText(/keep-alive ping/i) as HTMLInputElement;
      expect(pingCheckboxAfterRerender.checked).toBe(true);
    });

    it('should display correct 30s interval label', () => {
      render(<ToolsPanel />);

      const label = screen.getByText(/keep-alive ping \(30s\)/i);
      expect(label).toBeDefined();
    });
  });

  describe('Ping Toggle Accessibility', () => {
    it('should have proper label association with input', () => {
      render(<ToolsPanel />);

      const pingCheckbox = screen.getByLabelText(/keep-alive ping/i);
      expect((pingCheckbox as HTMLInputElement).id).toBe('ping-toggle');
    });

    it('should be keyboard accessible', async () => {
      const user = userEvent.setup();
      render(<ToolsPanel />);

      const pingCheckbox = screen.getByLabelText(/keep-alive ping/i);
      
      // Focus and press space to toggle
      pingCheckbox.focus();
      await user.keyboard(' ');

      expect(mockStartPing).toHaveBeenCalledTimes(1);
    });
  });
});
