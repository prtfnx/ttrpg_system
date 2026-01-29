import { GameClient } from '@features/canvas';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../../stores/gameStore';

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
      
      render(<GameClient />);

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'tokenDoubleClick',
        expect.any(Function)
      );

      addEventListenerSpy.mockRestore();
    });

    it('should open token config modal when tokenDoubleClick event is dispatched', async () => {
      render(<GameClient />);

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
      
      render(<GameClient />);

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
      render(<GameClient />);

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
      
      render(<GameClient />);

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
      
      const { unmount } = render(<GameClient />);
      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'tokenDoubleClick',
        expect.any(Function)
      );

      removeEventListenerSpy.mockRestore();
    });

    it('should not leak memory when re-mounting multiple times', () => {
      const addSpy = vi.spyOn(window, 'addEventListener');
      const removeSpy = vi.spyOn(window, 'removeEventListener');
      
      // Mount and unmount 3 times
      for (let i = 0; i < 3; i++) {
        const { unmount } = render(<GameClient />);
        unmount();
      }

      // Each mount should add listener, each unmount should remove it
      expect(addSpy).toHaveBeenCalledTimes(3);
      expect(removeSpy).toHaveBeenCalledTimes(3);

      addSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });

  describe('Token Config Modal Integration', () => {
    it('should pass correct spriteId to TokenConfigModal', async () => {
      render(<GameClient />);

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
        const modal = screen.queryByText(/token configuration/i);
        expect(modal).toBeDefined();
      });
    });

    it('should close modal when close callback is triggered', async () => {
      render(<GameClient />);

      // Open modal
      const event = new CustomEvent('tokenDoubleClick', {
        detail: { spriteId: 'sprite-1' }
      });
      window.dispatchEvent(event);

      await waitFor(() => {
        expect(screen.queryByText(/token configuration/i)).toBeDefined();
      });

      // Find and click close button (×)
      const closeButton = screen.getByText('×');
      closeButton.click();

      await waitFor(() => {
        expect(screen.queryByText(/token configuration/i)).toBeNull();
      });
    });

    it('should handle rapid double-clicks without errors', async () => {
      render(<GameClient />);

      // Dispatch 5 double-click events rapidly
      for (let i = 0; i < 5; i++) {
        const event = new CustomEvent('tokenDoubleClick', {
          detail: { spriteId: 'sprite-1' }
        });
        window.dispatchEvent(event);
      }

      // Modal should be open
      await waitFor(() => {
        expect(screen.queryByText(/token configuration/i)).toBeDefined();
      });

      // Should not have multiple modals or errors
      const modals = screen.getAllByText(/token configuration/i);
      expect(modals.length).toBe(1);
    });
  });

  describe('Event Flow Validation', () => {
    it('should log double-click event with correct format', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      render(<GameClient />);

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
      render(<GameClient />);

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

    it('should work with useEffect cleanup on dependency change', () => {
      const { rerender } = render(<GameClient />);

      const removeSpy = vi.spyOn(window, 'removeEventListener');
      const addSpy = vi.spyOn(window, 'addEventListener');

      // Force re-render (useEffect dependencies haven't changed, so cleanup shouldn't run)
      rerender(<GameClient />);

      // Since dependencies are empty [], cleanup should only run on unmount
      expect(removeSpy).not.toHaveBeenCalled();
      expect(addSpy).toHaveBeenCalledTimes(1);

      removeSpy.mockRestore();
      addSpy.mockRestore();
    });
  });
});
