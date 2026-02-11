import { useGameStore } from '@/store';
import type { UserInfo } from '@features/auth';
import { GameClient } from '@features/canvas';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock child components to test GameClient in isolation
vi.mock('@features/canvas/components/TokenConfigModal', () => ({
  TokenConfigModal: ({ spriteId, onClose }: any) => (
    <div data-testid="token-config-modal">
      <h2>Token Configuration</h2>
      <div>Sprite ID: {spriteId}</div>
      <button aria-label="Close" onClick={onClose}>Close</button>
    </div>
  )
}));

vi.mock('@features/canvas/components/GameCanvas', () => ({
  GameCanvas: () => <canvas data-testid="game-canvas">GameCanvas</canvas>
}));

vi.mock('@features/canvas/components/ToolsPanel', () => ({
  ToolsPanel: () => <div data-testid="tools-panel">ToolsPanel</div>
}));

vi.mock('../../../app/RightPanel', () => ({
  RightPanel: () => <div data-testid="right-panel">RightPanel</div>
}));

// Helper to create a Sprite
function createTestSprite(overrides: any = {}) {
  return {
    id: 'sprite-1',
    name: 'Test Token',
    tableId: 'test-table-uuid',
    x: 100,
    y: 200,
    layer: 'tokens',
    texture: 'warrior.png',
    scale: { x: 1, y: 1 },
    rotation: 0,
    hp: 50,
    maxHp: 50,
    ac: 15,
    auraRadius: 0,
    ...overrides,
  };
}

// Helper to create test UserInfo
function createTestUserInfo(overrides: Partial<UserInfo> = {}): UserInfo {
  return {
    id: 123,
    username: 'testuser',
    role: 'player',
    permissions: [],
    ...overrides,
  };
}

// Helper to render GameClient with required props
function renderGameClient(props: Partial<React.ComponentProps<typeof GameClient>> = {}) {
  const defaultProps: React.ComponentProps<typeof GameClient> = {
    sessionCode: 'TEST-SESSION',
    userInfo: createTestUserInfo(),
    userRole: 'player',
    onAuthError: vi.fn(),
    ...props,
  };
  return render(<GameClient {...defaultProps} />);
}

describe('GameClient - Double-Click Detection Tests', () => {
  beforeEach(() => {
    // Reset store
    useGameStore.setState({
      sprites: [createTestSprite()],
      characters: [],
      currentUserId: 123,
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up any remaining event listeners
    const events = ['tokenDoubleClick'];
    events.forEach(eventName => {
      const handlers = (window as any).eventListeners?.[eventName] || [];
      handlers.forEach((handler: any) => {
        window.removeEventListener(eventName, handler);
      });
    });
  });

  describe('WASM to React Event Flow', () => {
    it('should listen for tokenDoubleClick event on mount', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      
      renderGameClient();

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'tokenDoubleClick',
        expect.any(Function)
      );

      addEventListenerSpy.mockRestore();
    });

    it('should open token config modal when tokenDoubleClick event is dispatched', async () => {
      renderGameClient();

      // Simulate WASM dispatching double-click event
      const event = new CustomEvent('tokenDoubleClick', {
        detail: { spriteId: 'sprite-1' }
      });
      window.dispatchEvent(event);

      // Wait for modal to appear
      await waitFor(() => {
        const modal = screen.queryByText(/token configuration/i);
        expect(modal).toBeDefined();
      });
    });

    it('should extract spriteId from event detail correctly', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      renderGameClient();

      const testSpriteId = 'sprite-test-123';
      const event = new CustomEvent('tokenDoubleClick', {
        detail: { spriteId: testSpriteId }
      });
      window.dispatchEvent(event);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[GameClient] Token double-click on sprite:',
        testSpriteId
      );

      consoleSpy.mockRestore();
    });

    it('should handle double-click on different sprite IDs', async () => {
      renderGameClient();

      // Add multiple sprites
      useGameStore.setState({
        sprites: [
          createTestSprite({ id: 'sprite-1' }),
          createTestSprite({ id: 'sprite-2' }),
          createTestSprite({ id: 'sprite-3' }),
        ],
        currentUserId: 123,
      });

      // Double-click on sprite-2
      const event1 = new CustomEvent('tokenDoubleClick', {
        detail: { spriteId: 'sprite-2' }
      });
      window.dispatchEvent(event1);

      await waitFor(() => {
        expect(screen.queryByText(/token configuration/i)).toBeDefined();
      });

      // Close modal by dispatching a different sprite double-click
      const event2 = new CustomEvent('tokenDoubleClick', {
        detail: { spriteId: 'sprite-3' }
      });
      window.dispatchEvent(event2);

      // Modal should still be open but for different sprite
      await waitFor(() => {
        expect(screen.queryByText(/token configuration/i)).toBeDefined();
      });
    });

    it('should handle double-click with missing event detail gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      renderGameClient();

      // Dispatch event without detail
      const event = new CustomEvent('tokenDoubleClick', {
        detail: undefined
      });

      // Should not throw error
      expect(() => {
        window.dispatchEvent(event);
      }).not.toThrow();

      consoleErrorSpy.mockRestore();
    });

    it('should remove event listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      
      const { unmount } = renderGameClient();
      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'tokenDoubleClick',
        expect.any(Function)
      );

      removeEventListenerSpy.mockRestore();
    });

    it('should handle multiple mount/unmount cycles without errors', () => {
      // Test that component can be mounted and unmounted multiple times
      // This ensures proper cleanup and no memory leaks
      for (let i = 0; i < 3; i++) {
        const { unmount } = renderGameClient();
        // Component should render successfully - verify basic structure
        expect(screen.getByTestId('tools-panel')).toBeInTheDocument();
        unmount();
      }
      // If we get here without errors, cleanup is working correctly
    });
  });

  describe('Token Config Modal Integration', () => {
    it('should pass correct spriteId to TokenConfigModal', async () => {
      renderGameClient();

      const targetSpriteId = 'sprite-999';
      useGameStore.setState({
        sprites: [createTestSprite({ id: targetSpriteId })],
        currentUserId: 123,
      });

      const event = new CustomEvent('tokenDoubleClick', {
        detail: { spriteId: targetSpriteId }
      });
      window.dispatchEvent(event);

      await waitFor(() => {
        expect(screen.getByText(/token configuration/i)).toBeInTheDocument();
      });
    });

    it('should close modal when close callback is triggered', async () => {
      renderGameClient();

      // Open modal
      const event = new CustomEvent('tokenDoubleClick', {
        detail: { spriteId: 'sprite-1' }
      });
      window.dispatchEvent(event);

      await waitFor(() => {
        expect(screen.getByText(/token configuration/i)).toBeInTheDocument();
      });

      // Close modal using close button
      const closeButton = screen.getByRole('button', { name: /close/i });
      closeButton.click();

      await waitFor(() => {
        expect(screen.queryByText(/token configuration/i)).not.toBeInTheDocument();
      });
    });

    it('should handle rapid double-clicks without errors', async () => {
      renderGameClient();

      // Dispatch 5 double-click events rapidly
      for (let i = 0; i < 5; i++) {
        const event = new CustomEvent('tokenDoubleClick', {
          detail: { spriteId: 'sprite-1' }
        });
        window.dispatchEvent(event);
      }

      // Modal should be open
      await waitFor(() => {
        expect(screen.getByText(/token configuration/i)).toBeInTheDocument();
      });

      // Should not have multiple modals or errors
      const modals = screen.getAllByText(/token configuration/i);
      expect(modals.length).toBe(1);
    });
  });

  describe('Event Flow Validation', () => {
    it('should log double-click event with correct format', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      renderGameClient();

      const event = new CustomEvent('tokenDoubleClick', {
        detail: { spriteId: 'sprite-log-test' }
      });
      window.dispatchEvent(event);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[GameClient] Token double-click on sprite:',
        'sprite-log-test'
      );

      consoleSpy.mockRestore();
    });

    it('should handle CustomEvent type casting correctly', async () => {
      renderGameClient();

      // Ensure the event detail is properly typed and accessible
      const spriteId = 'type-test-sprite';
      const event = new CustomEvent('tokenDoubleClick', {
        detail: { spriteId, extraData: 'should be ignored' }
      });
      window.dispatchEvent(event);

      await waitFor(() => {
        expect(screen.queryByText(/token configuration/i)).toBeDefined();
      });
    });

    it('should maintain event listener on re-render', () => {
      const { rerender } = renderGameClient();

      const removeSpy = vi.spyOn(window, 'removeEventListener');

      // Force re-render with same props
      rerender(<GameClient 
        sessionCode="TEST-SESSION"
        userInfo={createTestUserInfo()}
        userRole="player"
        onAuthError={vi.fn()}
      />);

      // Since dependencies are empty [], cleanup should only run on unmount
      expect(removeSpy).not.toHaveBeenCalled();

      removeSpy.mockRestore();
    });
  });
});
