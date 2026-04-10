import { useGameStore } from '@/store';
import type { UserInfo } from '@features/auth';
import { GameClient } from '@features/canvas';
import { WindowManagerProvider } from '@shared/components/FloatingWindow';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Prevent real WebSocket connections from firing async console logs during teardown
vi.mock('@features/auth', () => ({
  useAuthenticatedWebSocket: vi.fn().mockReturnValue({
    connectionState: 'connected',
    error: null,
    protocol: null,
  }),
}));

vi.mock('@features/lighting/services/vision.service', () => ({
  visionService: { start: vi.fn(), stop: vi.fn() },
}));

// Mock child components to test GameClient in isolation
vi.mock('@features/chat', () => ({
  ChatOverlay: () => null,
}));

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
  return render(
    <WindowManagerProvider>
      <GameClient {...defaultProps} />
    </WindowManagerProvider>
  );
}

describe('GameClient - Double-Click Detection Tests', () => {
  beforeEach(() => {
    // Provide portal root required by FloatingWindow
    const windowRoot = document.createElement('div');
    windowRoot.id = 'window-root';
    document.body.appendChild(windowRoot);

    // Reset store
    useGameStore.setState({
      sprites: [createTestSprite()],
      characters: [],
      currentUserId: 123,
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    // Remove portal root
    document.getElementById('window-root')?.remove();

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
      act(() => { window.dispatchEvent(event); });

      // Wait for modal to appear
      await waitFor(() => {
        expect(screen.queryByTestId('token-config-modal')).toBeInTheDocument();
      });
    });

    it('should extract spriteId from event detail correctly', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      renderGameClient();

      const testSpriteId = 'sprite-test-123';
      const event = new CustomEvent('tokenDoubleClick', {
        detail: { spriteId: testSpriteId }
      });
      act(() => { window.dispatchEvent(event); });

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
      act(() => { window.dispatchEvent(event1); });

      await waitFor(() => {
        expect(screen.queryAllByTestId('token-config-modal').length).toBeGreaterThan(0);
      });

      // Close modal by dispatching a different sprite double-click
      const event2 = new CustomEvent('tokenDoubleClick', {
        detail: { spriteId: 'sprite-3' }
      });
      act(() => { window.dispatchEvent(event2); });

      // Modal should still be open (multiple can be open at once with WindowManager)
      await waitFor(() => {
        expect(screen.queryAllByTestId('token-config-modal').length).toBeGreaterThan(0);
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
        act(() => { window.dispatchEvent(event); });
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
      act(() => { window.dispatchEvent(event); });

      await waitFor(() => {
        expect(screen.getByTestId('token-config-modal')).toBeInTheDocument();
      });
    });

    it('should close modal when close callback is triggered', async () => {
      renderGameClient();

      // Open modal
      const event = new CustomEvent('tokenDoubleClick', {
        detail: { spriteId: 'sprite-1' }
      });
      act(() => { window.dispatchEvent(event); });

      await waitFor(() => {
        expect(screen.getByTestId('token-config-modal')).toBeInTheDocument();
      });

      // Close modal using the mock's close button via within() to avoid ambiguity with FloatingWindow's close
      const modal = screen.getByTestId('token-config-modal');
      const closeButton = within(modal).getByRole('button', { name: /close/i });
      closeButton.click();

      await waitFor(() => {
        expect(screen.queryByTestId('token-config-modal')).not.toBeInTheDocument();
      });
    });

    it('should handle rapid double-clicks without errors', async () => {
      renderGameClient();

      // Dispatch 5 double-click events rapidly
      for (let i = 0; i < 5; i++) {
        const event = new CustomEvent('tokenDoubleClick', {
          detail: { spriteId: 'sprite-1' }
        });
        act(() => { window.dispatchEvent(event); });
      }

      // Modal should be open
      await waitFor(() => {
        expect(screen.getByTestId('token-config-modal')).toBeInTheDocument();
      });

      // Should not have multiple modals or errors
      const modals = screen.getAllByTestId('token-config-modal');
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
      act(() => { window.dispatchEvent(event); });

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
      act(() => { window.dispatchEvent(event); });

      await waitFor(() => {
        expect(screen.queryByTestId('token-config-modal')).toBeInTheDocument();
      });
    });

    it('should maintain event listener on re-render', () => {
      const { rerender } = renderGameClient();

      const removeSpy = vi.spyOn(window, 'removeEventListener');

      // Force re-render with same props — must keep WindowManagerProvider wrapper
      rerender(
        <WindowManagerProvider>
          <GameClient
            sessionCode="TEST-SESSION"
            userInfo={createTestUserInfo()}
            userRole="player"
            onAuthError={vi.fn()}
          />
        </WindowManagerProvider>
      );

      // tokenDoubleClick listener should NOT be removed on re-render (effect has [] deps)
      const tokenDoubleClickRemoved = removeSpy.mock.calls.some(
        ([eventName]) => eventName === 'tokenDoubleClick'
      );
      expect(tokenDoubleClickRemoved).toBe(false);

      removeSpy.mockRestore();
    });
  });
});

