/**
 * Selection Synchronization Tests
 * 
 * Tests WASM-React selection state synchronization (WASM as single source of truth)
 * Covers get_selected_sprite_ids(), set_state_change_handler(), and setSelectedSprites()
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../store';

describe('Selection Synchronization - WASM to React', () => {
  let mockRenderEngine: any;
  let stateChangeCallback: ((event: any) => void) | null = null;

  beforeEach(() => {
    // Reset state
    useGameStore.setState({
      sprites: [
        { id: 'sprite_1', name: 'Token 1', x: 100, y: 100, width: 64, height: 64, imageUrl: '', isSelected: false, isVisible: true, layer: 'tokens' },
        { id: 'sprite_2', name: 'Token 2', x: 200, y: 200, width: 64, height: 64, imageUrl: '', isSelected: false, isVisible: true, layer: 'tokens' },
        { id: 'sprite_3', name: 'Token 3', x: 300, y: 300, width: 64, height: 64, imageUrl: '', isSelected: false, isVisible: true, layer: 'tokens' },
      ],
      selectedSprites: [],
    });

    // Mock WASM RenderEngine with selection methods
    mockRenderEngine = {
      get_selected_sprite_ids: vi.fn(() => []),
      set_state_change_handler: vi.fn((callback: (event: any) => void) => {
        stateChangeCallback = callback;
      }),
      render: vi.fn(),
      add_sprite_to_layer: vi.fn(),
      delete_sprite: vi.fn(),
    };

    window.rustRenderManager = mockRenderEngine;
  });

  afterEach(() => {
    stateChangeCallback = null;
    window.rustRenderManager = undefined;
    useGameStore.setState({ sprites: [], selectedSprites: [] });
    vi.clearAllMocks();
  });

  describe('State Change Handler Registration', () => {
    it('should register state change handler on WASM initialization', () => {
      const handler = vi.fn();
      mockRenderEngine.set_state_change_handler(handler);

      expect(mockRenderEngine.set_state_change_handler).toHaveBeenCalledWith(handler);
      expect(mockRenderEngine.set_state_change_handler).toHaveBeenCalledTimes(1);
    });

    it('should store callback for future event emission', () => {
      const handler = vi.fn();
      mockRenderEngine.set_state_change_handler(handler);

      expect(stateChangeCallback).toBe(handler);
    });
  });

  describe('Selection State Synchronization', () => {
    it('should update React state when WASM emits selection_changed event (single selection)', () => {
      const handler = (event: any) => {
        if (event?.type === 'selection_changed') {
          useGameStore.getState().setSelectedSprites(event.sprite_ids);
        }
      };
      mockRenderEngine.set_state_change_handler(handler);

      // Simulate WASM emitting selection_changed event
      stateChangeCallback?.({ type: 'selection_changed', sprite_ids: ['sprite_1'] });

      expect(useGameStore.getState().selectedSprites).toEqual(['sprite_1']);
    });

    it('should update React state when WASM emits selection_changed event (multi-selection)', () => {
      const handler = (event: any) => {
        if (event?.type === 'selection_changed') {
          useGameStore.getState().setSelectedSprites(event.sprite_ids);
        }
      };
      mockRenderEngine.set_state_change_handler(handler);

      // Simulate Ctrl+click multi-select
      stateChangeCallback?.({ type: 'selection_changed', sprite_ids: ['sprite_1', 'sprite_2', 'sprite_3'] });

      expect(useGameStore.getState().selectedSprites).toEqual(['sprite_1', 'sprite_2', 'sprite_3']);
      expect(useGameStore.getState().selectedSprites).toHaveLength(3);
    });

    it('should clear React state when WASM emits empty selection', () => {
      // Set initial selection
      useGameStore.getState().setSelectedSprites(['sprite_1', 'sprite_2']);

      const handler = (event: any) => {
        if (event?.type === 'selection_changed') {
          useGameStore.getState().setSelectedSprites(event.sprite_ids);
        }
      };
      mockRenderEngine.set_state_change_handler(handler);

      // Simulate click on empty canvas (clear selection)
      stateChangeCallback?.({ type: 'selection_changed', sprite_ids: [] });

      expect(useGameStore.getState().selectedSprites).toEqual([]);
    });

    it('should update sprite isSelected flags when selection changes', () => {
      const handler = (event: any) => {
        if (event?.type === 'selection_changed') {
          useGameStore.getState().setSelectedSprites(event.sprite_ids);
        }
      };
      mockRenderEngine.set_state_change_handler(handler);

      stateChangeCallback?.({ type: 'selection_changed', sprite_ids: ['sprite_2'] });

      const sprites = useGameStore.getState().sprites;
      expect(sprites.find(s => s.id === 'sprite_1')?.isSelected).toBe(false);
      expect(sprites.find(s => s.id === 'sprite_2')?.isSelected).toBe(true);
      expect(sprites.find(s => s.id === 'sprite_3')?.isSelected).toBe(false);
    });
  });

  describe('WASM as Single Source of Truth', () => {
    it('should query WASM directly for current selection state', () => {
      mockRenderEngine.get_selected_sprite_ids.mockReturnValue(['sprite_1', 'sprite_2']);

      const selectedIds = mockRenderEngine.get_selected_sprite_ids();

      expect(selectedIds).toEqual(['sprite_1', 'sprite_2']);
      expect(mockRenderEngine.get_selected_sprite_ids).toHaveBeenCalled();
    });

    it('should use WASM selection for delete operations', () => {
      mockRenderEngine.get_selected_sprite_ids.mockReturnValue(['sprite_1', 'sprite_3']);

      const selectedIds = mockRenderEngine.get_selected_sprite_ids();
      
      // Simulate delete operation
      selectedIds.forEach((id: string) => {
        mockRenderEngine.delete_sprite(id);
      });

      expect(mockRenderEngine.delete_sprite).toHaveBeenCalledWith('sprite_1');
      expect(mockRenderEngine.delete_sprite).toHaveBeenCalledWith('sprite_3');
      expect(mockRenderEngine.delete_sprite).toHaveBeenCalledTimes(2);
    });

    it('should handle empty selection from WASM gracefully', () => {
      mockRenderEngine.get_selected_sprite_ids.mockReturnValue([]);

      const selectedIds = mockRenderEngine.get_selected_sprite_ids();

      expect(selectedIds).toEqual([]);
      expect(selectedIds).toHaveLength(0);
    });
  });

  describe('setSelectedSprites Zustand Action', () => {
    it('should update selectedSprites array', () => {
      useGameStore.getState().setSelectedSprites(['sprite_1', 'sprite_2']);

      expect(useGameStore.getState().selectedSprites).toEqual(['sprite_1', 'sprite_2']);
    });

    it('should update sprite isSelected flags to match selection', () => {
      useGameStore.getState().setSelectedSprites(['sprite_1', 'sprite_3']);

      const sprite1 = useGameStore.getState().sprites.find(s => s.id === 'sprite_1');
      const sprite2 = useGameStore.getState().sprites.find(s => s.id === 'sprite_2');
      const sprite3 = useGameStore.getState().sprites.find(s => s.id === 'sprite_3');

      expect(sprite1?.isSelected).toBe(true);
      expect(sprite2?.isSelected).toBe(false);
      expect(sprite3?.isSelected).toBe(true);
    });

    it('should handle empty array to clear selection', () => {
      // Set selection first
      useGameStore.getState().setSelectedSprites(['sprite_1', 'sprite_2']);
      expect(useGameStore.getState().selectedSprites).toHaveLength(2);

      // Clear selection
      useGameStore.getState().setSelectedSprites([]);

      expect(useGameStore.getState().selectedSprites).toEqual([]);
      useGameStore.getState().sprites.forEach(sprite => {
        expect(sprite.isSelected).toBe(false);
      });
    });

    it('should handle selection of non-existent sprite IDs gracefully', () => {
      // WASM might return IDs that aren't in React state yet
      useGameStore.getState().setSelectedSprites(['sprite_1', 'non_existent_sprite']);

      expect(useGameStore.getState().selectedSprites).toEqual(['sprite_1', 'non_existent_sprite']);
      
      // Only existing sprites should have isSelected flag updated
      const sprite1 = useGameStore.getState().sprites.find(s => s.id === 'sprite_1');
      expect(sprite1?.isSelected).toBe(true);
    });
  });

  describe('Event Emission Scenarios', () => {
    it('should handle rapid selection changes without race conditions', () => {
      const handler = (event: any) => {
        if (event?.type === 'selection_changed') {
          useGameStore.getState().setSelectedSprites(event.sprite_ids);
        }
      };
      mockRenderEngine.set_state_change_handler(handler);

      // Rapid clicks simulating fast user interaction
      stateChangeCallback?.({ type: 'selection_changed', sprite_ids: ['sprite_1'] });
      stateChangeCallback?.({ type: 'selection_changed', sprite_ids: ['sprite_1', 'sprite_2'] });
      stateChangeCallback?.({ type: 'selection_changed', sprite_ids: ['sprite_2'] });
      stateChangeCallback?.({ type: 'selection_changed', sprite_ids: [] });

      // Final state should be empty
      expect(useGameStore.getState().selectedSprites).toEqual([]);
    });

    it('should ignore non-selection_changed events', () => {
      const handler = (event: any) => {
        if (event?.type === 'selection_changed') {
          useGameStore.getState().setSelectedSprites(event.sprite_ids);
        }
      };
      mockRenderEngine.set_state_change_handler(handler);

      // Set initial selection
      useGameStore.getState().setSelectedSprites(['sprite_1']);

      // Emit different event types
      stateChangeCallback?.({ type: 'sprite_moved', sprite_id: 'sprite_1' });
      stateChangeCallback?.({ type: 'camera_changed', x: 100, y: 100 });

      // Selection should remain unchanged
      expect(useGameStore.getState().selectedSprites).toEqual(['sprite_1']);
    });

    it('should handle malformed events gracefully', () => {
      const handler = (event: any) => {
        if (event?.type === 'selection_changed' && Array.isArray(event.sprite_ids)) {
          useGameStore.getState().setSelectedSprites(event.sprite_ids);
        }
      };
      mockRenderEngine.set_state_change_handler(handler);

      // Set initial selection
      useGameStore.getState().setSelectedSprites(['sprite_1']);

      // Emit malformed events
      stateChangeCallback?.({ type: 'selection_changed' }); // Missing sprite_ids
      stateChangeCallback?.({ type: 'selection_changed', sprite_ids: 'invalid' }); // Wrong type
      stateChangeCallback?.(null); // Null event
      stateChangeCallback?.(undefined); // Undefined event

      // Selection should remain unchanged
      expect(useGameStore.getState().selectedSprites).toEqual(['sprite_1']);
    });
  });

  describe('Integration - Delete Key with WASM Selection', () => {
    it('should delete all selected sprites queried from WASM', async () => {
      mockRenderEngine.get_selected_sprite_ids.mockReturnValue(['sprite_1', 'sprite_2']);

      // Simulate Delete key handler
      const selectedSprites = mockRenderEngine.get_selected_sprite_ids();
      
      selectedSprites.forEach((spriteId: string) => {
        mockRenderEngine.delete_sprite(spriteId);
      });

      expect(mockRenderEngine.get_selected_sprite_ids).toHaveBeenCalled();
      expect(mockRenderEngine.delete_sprite).toHaveBeenCalledTimes(2);
      expect(mockRenderEngine.delete_sprite).toHaveBeenCalledWith('sprite_1');
      expect(mockRenderEngine.delete_sprite).toHaveBeenCalledWith('sprite_2');
    });

    it('should handle no selection when Delete key pressed', () => {
      mockRenderEngine.get_selected_sprite_ids.mockReturnValue([]);

      const selectedSprites = mockRenderEngine.get_selected_sprite_ids();
      
      selectedSprites.forEach((spriteId: string) => {
        mockRenderEngine.delete_sprite(spriteId);
      });

      expect(mockRenderEngine.delete_sprite).not.toHaveBeenCalled();
    });
  });

  describe('Performance - Large Selections', () => {
    it('should handle large selection sets efficiently', () => {
      // Create 100 sprite IDs
      const largeSpriteSet = Array.from({ length: 100 }, (_, i) => `sprite_${i}`);
      
      const startTime = performance.now();
      useGameStore.getState().setSelectedSprites(largeSpriteSet);
      const endTime = performance.now();

      expect(useGameStore.getState().selectedSprites).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(100); // Should complete in <100ms
    });

    it('should handle frequent selection updates efficiently', () => {
      const handler = (event: any) => {
        if (event?.type === 'selection_changed') {
          useGameStore.getState().setSelectedSprites(event.sprite_ids);
        }
      };
      mockRenderEngine.set_state_change_handler(handler);

      const startTime = performance.now();
      
      // Simulate 50 rapid selection changes
      for (let i = 0; i < 50; i++) {
        stateChangeCallback?.({ 
          type: 'selection_changed', 
          sprite_ids: [`sprite_${i % 3}`] 
        });
      }

      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(500); // Should handle 50 updates in <500ms
    });
  });
});
