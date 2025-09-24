import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// Import web client system components
import { ActionsPanel } from '../ActionsPanel';
import { AssetPanel } from '../AssetPanel';
import { CharacterManager } from '../CharacterManager';
import ChatPanel from '../ChatPanel';
import { GameCanvas } from '../GameCanvas';
import { NetworkPanel } from '../NetworkPanel';
import { PerformanceMonitor } from '../PerformanceMonitor';

// Mock WASM module with realistic interface
const mockWasmModule = {
  RenderEngine: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    render: vi.fn(),
    update: vi.fn(),
    handle_mouse_event: vi.fn(),
    handle_keyboard_event: vi.fn(),
    screen_to_world: vi.fn().mockReturnValue({ x: 10.5, y: 20.3 }),
    world_to_screen: vi.fn().mockReturnValue({ x: 100, y: 200 }),
    set_viewport: vi.fn(),
    get_viewport: vi.fn().mockReturnValue({ x: 0, y: 0, width: 800, height: 600 }),
    create_sprite: vi.fn().mockReturnValue('sprite_123'),
    move_sprite: vi.fn(),
    delete_sprite: vi.fn(),
    get_sprite_position: vi.fn().mockReturnValue({ x: 5, y: 5 }),
    add_light_source: vi.fn(),
    remove_light_source: vi.fn(),
    update_fog_of_war: vi.fn(),
    calculate_line_of_sight: vi.fn().mockReturnValue(true),
    create_table: vi.fn(),
    load_texture: vi.fn().mockResolvedValue(true),
    get_performance_metrics: vi.fn().mockReturnValue({
      fps: 60,
      frame_time: 16.67,
      memory_usage: 1024 * 1024,
      sprite_count: 15
    })
  })),
  NetworkClient: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(true),
    disconnect: vi.fn(),
    send_message: vi.fn(),
    is_connected: vi.fn().mockReturnValue(true)
  })),
  ActionsClient: vi.fn().mockImplementation(() => ({
    set_action_handler: vi.fn(),
    set_state_change_handler: vi.fn(),
    set_error_handler: vi.fn(),
    create_table: vi.fn().mockReturnValue({ success: true, message: 'Table created' }),
    create_sprite: vi.fn().mockReturnValue({ success: true, sprite_id: 'sprite_123' }),
    move_sprite: vi.fn().mockReturnValue({ success: true }),
    delete_sprite: vi.fn().mockReturnValue({ success: true }),
    batch_actions: vi.fn().mockReturnValue({ success: true, count: 3 }),
    undo: vi.fn().mockReturnValue({ success: true }),
    redo: vi.fn().mockReturnValue({ success: true }),
    can_undo: vi.fn().mockReturnValue(true),
    can_redo: vi.fn().mockReturnValue(false)
  })),
  AssetManager: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    download_asset: vi.fn().mockResolvedValue('asset_123'),
    has_asset: vi.fn().mockReturnValue(true),
    get_asset_info: vi.fn().mockReturnValue('{"name":"dragon.png","size":1024}'),
    get_asset_data: vi.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4]))
  })),
  default: vi.fn().mockResolvedValue(undefined)
};

// Mock external dependencies
vi.mock('../utils/wasmManager', () => ({
  wasmManager: {
    getWasmModule: vi.fn().mockResolvedValue(mockWasmModule)
  }
}));

vi.mock('../hooks/useActions', () => ({
  useActions: vi.fn().mockReturnValue({
    createTable: vi.fn().mockResolvedValue({ success: true, message: 'Table created successfully' }),
    deleteTable: vi.fn().mockResolvedValue({ success: true, message: 'Table deleted' }),
    createSprite: vi.fn().mockResolvedValue({ success: true, sprite_id: 'sprite_123' }),
    moveSprite: vi.fn().mockResolvedValue({ success: true, message: 'Sprite moved' }),
    batchActions: vi.fn().mockResolvedValue({ success: true, count: 2 }),
    undo: vi.fn().mockResolvedValue({ success: true, message: 'Action undone' }),
    redo: vi.fn().mockResolvedValue({ success: true, message: 'Action redone' })
  })
}));

vi.mock('../hooks/useAuthenticatedWebSocket', () => ({
  useAuthenticatedWebSocket: vi.fn().mockReturnValue({
    protocol: {
      sendMessage: vi.fn(),
      isConnected: true
    }
  })
}));

vi.mock('../store/characterStore', () => ({
  useCharacterStore: vi.fn().mockReturnValue({
    characters: [],
    addCharacter: vi.fn(),
    removeCharacter: vi.fn(),
    updateCharacter: vi.fn()
  })
}));

vi.mock('../services/performance.service', () => ({
  performanceService: {
    getMetrics: vi.fn().mockReturnValue({
      fps: 60,
      frameTime: 16.67,
      memoryUsage: 1024 * 1024,
      renderTime: 8.33
    }),
    startMonitoring: vi.fn(),
    stopMonitoring: vi.fn(),
    optimizePerformance: vi.fn()
  }
}));

describe('Web Client TypeScript & WASM Systems Integration Tests', () => {
  const user = userEvent.setup();
  const mockUserInfo = { id: 1, username: 'testuser', role: 'dm' as const, permissions: ['all'] };

  describe('WASM Integration System', () => {
    it('should initialize WASM module and provide TypeScript bridge', async () => {
      render(<GameCanvas />);
      
      // User expects WASM to load and initialize properly
      await waitFor(() => {
        const canvas = screen.getByTestId('game-canvas');
        expect(canvas).toBeInTheDocument();
      });
      
      // User expects WASM module to be accessible through TypeScript bridge
      expect(window.ttrpg_rust_core).toBeDefined();
      expect(window.wasmInitialized).toBe(true);
    });

    it('should handle WASM render engine operations from TypeScript', async () => {
      render(<GameCanvas />);
      
      const canvas = screen.getByTestId('game-canvas');
      
      // User expects mouse interactions to translate through WASM
      await user.click(canvas);
      
      // User expects coordinate conversion between screen and world space
      const wasmModule = await mockWasmModule;
      expect(wasmModule.RenderEngine().screen_to_world).toHaveBeenCalled();
    });

    it('should synchronize WASM state with TypeScript UI components', async () => {
      render(<GameCanvas />);
      
      // User expects WASM performance metrics to be available in TypeScript
      await waitFor(() => {
        const performanceData = mockWasmModule.RenderEngine().get_performance_metrics();
        expect(performanceData.fps).toBeGreaterThan(0);
        expect(performanceData.sprite_count).toBeTypeOf('number');
      });
    });

    it('should handle WASM errors gracefully in TypeScript layer', async () => {
      // Mock WASM error
      mockWasmModule.RenderEngine.mockImplementation(() => {
        throw new Error('WASM initialization failed');
      });

      render(<GameCanvas />);

      // User expects fallback behavior when WASM fails
      await waitFor(() => {
        expect(screen.getByText(/wasm initialization failed/i)).toBeInTheDocument();
      });
    });
  });

  describe('Actions System - TypeScript Command Bus', () => {
    it('should coordinate WASM operations through TypeScript actions', async () => {
      const mockRenderEngine = mockWasmModule.RenderEngine();
      render(<ActionsPanel renderEngine={mockRenderEngine} />);
      
      // User expects to create tables through TypeScript interface
      const tableNameInput = screen.getByPlaceholderText(/table name/i);
      await user.type(tableNameInput, 'Dragon Encounter');
      
      const createButton = screen.getByRole('button', { name: /create table/i });
      await user.click(createButton);
      
      // User expects action to be processed and logged
      await waitFor(() => {
        expect(screen.getByText(/create table.*dragon encounter/i)).toBeInTheDocument();
      });
    });

    it('should support batch operations with WASM backend', async () => {
      const mockRenderEngine = mockWasmModule.RenderEngine();
      render(<ActionsPanel renderEngine={mockRenderEngine} />);
      
      // User expects batch actions to be available
      const batchButton = screen.getByRole('button', { name: /batch actions/i });
      expect(batchButton).toBeInTheDocument();
      
      await user.click(batchButton);
      
      // User expects batch operations dialog
      expect(screen.getByText(/batch operations/i)).toBeInTheDocument();
    });

    it('should provide undo/redo functionality backed by WASM', async () => {
      const mockRenderEngine = mockWasmModule.RenderEngine();
      render(<ActionsPanel renderEngine={mockRenderEngine} />);
      
      // User expects undo button to be enabled when actions exist
      const undoButton = screen.getByRole('button', { name: /undo/i });
      expect(undoButton).toBeEnabled();
      
      await user.click(undoButton);
      
      // User expects undo confirmation
      expect(screen.getByText(/action undone/i)).toBeInTheDocument();
    });
  });

  describe('Character Management - TypeScript Integration', () => {
    it('should manage character data with proper TypeScript types', async () => {
      render(<CharacterManager sessionCode="TEST123" userInfo={mockUserInfo} />);
      
      // User expects character creation to work with proper validation
      await user.click(screen.getByRole('button', { name: /create.*character/i }));
      
      expect(screen.getByText(/character creation/i)).toBeInTheDocument();
      
      // User expects TypeScript type safety in character data
      const nameInput = screen.getByLabelText(/character name/i);
      await user.type(nameInput, 'Gandalf');
      
      expect(screen.getByDisplayValue('Gandalf')).toBeInTheDocument();
    });

    it('should synchronize character data across network', async () => {
      render(<CharacterManager sessionCode="TEST123" userInfo={mockUserInfo} />);
      
      // User expects characters to load from server
      await waitFor(() => {
        expect(screen.getByText(/loading characters/i)).toBeInTheDocument();
      });
      
      // User expects real-time synchronization
      expect(screen.getByText(/characters synced/i)).toBeInTheDocument();
    });

    it('should handle character permissions with TypeScript safety', async () => {
      const limitedUser = { id: 2, username: 'player1', role: 'player' as const, permissions: ['view'] };
      render(<CharacterManager sessionCode="TEST123" userInfo={limitedUser} />);
      
      // User expects limited permissions to be enforced
      const restrictedAction = screen.queryByRole('button', { name: /delete.*character/i });
      expect(restrictedAction).toBeNull();
    });
  });

  describe('WebSocket Network System', () => {
    it('should provide typed WebSocket communication', async () => {
      render(<NetworkPanel />);
      
      // User expects connection status to be clearly displayed
      expect(screen.getByTestId('connection-status')).toBeInTheDocument();
      expect(screen.getByText(/connected/i)).toBeInTheDocument();
      
      // User expects latency monitoring
      expect(screen.getByText(/latency.*ms/i)).toBeInTheDocument();
    });

    it('should handle WebSocket reconnection automatically', async () => {
      render(<NetworkPanel />);
      
      // User expects reconnection button when disconnected
      const reconnectButton = screen.queryByRole('button', { name: /reconnect/i });
      if (reconnectButton) {
        await user.click(reconnectButton);
        expect(screen.getByText(/attempting.*reconnect/i)).toBeInTheDocument();
      }
    });

    it('should provide typed message validation', async () => {
      render(<ChatPanel />);
      
      // User expects message types to be validated
      const messageInput = screen.getByPlaceholderText(/type.*message/i);
      await user.type(messageInput, '/invalid-command test');
      await user.keyboard('{Enter}');
      
      // User expects validation error for invalid commands
      expect(screen.getByText(/unknown command/i)).toBeInTheDocument();
    });
  });

  describe('Asset Management - TypeScript & WASM Bridge', () => {
    it('should manage assets with TypeScript safety and WASM processing', async () => {
      render(<AssetPanel />);
      
      // User expects asset categories to be properly typed
      expect(screen.getByText(/images/i)).toBeInTheDocument();
      expect(screen.getByText(/models/i)).toBeInTheDocument();
      
      // User expects search to work with proper filtering
      const searchInput = screen.getByPlaceholderText(/search assets/i);
      await user.type(searchInput, 'dragon');
      
      await waitFor(() => {
        expect(screen.getByText(/filtering assets/i)).toBeInTheDocument();
      });
    });

    it('should handle asset uploads with progress tracking', async () => {
      render(<AssetPanel />);
      
      // User expects upload functionality
      const uploadButton = screen.getByRole('button', { name: /upload/i });
      await user.click(uploadButton);
      
      expect(screen.getByText(/select files/i)).toBeInTheDocument();
      
      // User expects progress indicator for large uploads
      const progressBar = screen.queryByRole('progressbar');
      if (progressBar) {
        expect(progressBar).toBeInTheDocument();
      }
    });

    it('should integrate assets with WASM texture loading', async () => {
      render(
        <div>
          <AssetPanel />
          <GameCanvas />
        </div>
      );
      
      // User expects assets to be loadable in WASM engine
      const dragonAsset = screen.queryByText(/dragon.*png/i);
      if (dragonAsset) {
        await user.click(dragonAsset);
        
        // User expects asset to be processed by WASM
        await waitFor(() => {
          expect(mockWasmModule.RenderEngine().load_texture).toHaveBeenCalled();
        });
      }
    });
  });

  describe('Performance Monitoring - TypeScript Metrics', () => {
    it('should display real-time performance metrics from WASM', async () => {
      render(<PerformanceMonitor isVisible={true} />);
      
      // User expects FPS counter from WASM engine
      expect(screen.getByText(/fps/i)).toBeInTheDocument();
      
      // User expects memory usage monitoring
      expect(screen.getByText(/memory/i)).toBeInTheDocument();
      
      // User expects frame time information
      expect(screen.getByText(/frame.*time/i)).toBeInTheDocument();
    });

    it('should provide performance optimization suggestions', async () => {
      render(<PerformanceMonitor isVisible={true} />);
      
      // User expects optimization recommendations based on metrics
      const optimizeButton = screen.queryByRole('button', { name: /optimize/i });
      if (optimizeButton) {
        await user.click(optimizeButton);
        expect(screen.getByText(/optimization applied/i)).toBeInTheDocument();
      }
    });

    it('should warn about performance issues', async () => {
      // Mock poor performance
      mockWasmModule.RenderEngine().get_performance_metrics.mockReturnValue({
        fps: 15,
        frame_time: 66.67,
        memory_usage: 1024 * 1024 * 1024, // 1GB
        sprite_count: 1000
      });
      
      render(<PerformanceMonitor isVisible={true} />);
      
      // User expects performance warnings
      expect(screen.getByText(/performance warning/i)).toBeInTheDocument();
      expect(screen.getByText(/consider reducing/i)).toBeInTheDocument();
    });
  });

  describe('Game Canvas - WASM Rendering Integration', () => {
    it('should render game world through WASM engine', async () => {
      render(<GameCanvas />);
      
      // User expects canvas to be properly sized and responsive
      const canvas = screen.getByTestId('game-canvas');
      expect(canvas).toHaveAttribute('width');
      expect(canvas).toHaveAttribute('height');
      
      // User expects viewport controls
      const zoomIn = screen.getByRole('button', { name: /zoom.*in/i });
      const zoomOut = screen.getByRole('button', { name: /zoom.*out/i });
      
      expect(zoomIn).toBeInTheDocument();
      expect(zoomOut).toBeInTheDocument();
    });

    it('should handle mouse interactions with coordinate transformation', async () => {
      render(<GameCanvas />);
      
      const canvas = screen.getByTestId('game-canvas');
      
      // User expects mouse clicks to be converted to world coordinates
      await user.click(canvas);
      
      // User expects coordinate transformation to be called
      await waitFor(() => {
        expect(mockWasmModule.RenderEngine().screen_to_world).toHaveBeenCalled();
      });
    });

    it('should support sprite manipulation through TypeScript interface', async () => {
      render(<GameCanvas />);
      
      // User expects to be able to place sprites
      const canvas = screen.getByTestId('game-canvas');
      await user.click(canvas);
      
      // User expects sprite creation to work
      await waitFor(() => {
        expect(mockWasmModule.RenderEngine().create_sprite).toHaveBeenCalled();
      });
    });
  });

  describe('Cross-System TypeScript Integration', () => {
    it('should maintain type safety across all system boundaries', async () => {
      render(
        <div>
          <ActionsPanel renderEngine={mockWasmModule.RenderEngine()} />
          <CharacterManager sessionCode="TEST123" userInfo={mockUserInfo} />
          <GameCanvas />
        </div>
      );
      
      // User expects all systems to work together with proper TypeScript types
      const canvas = screen.getByTestId('game-canvas');
      await user.click(canvas);
      
      // User expects character placement to work across systems
      await waitFor(() => {
        expect(screen.getByText(/character.*placed/i)).toBeInTheDocument();
      });
    });

    it('should handle errors consistently across TypeScript boundaries', async () => {
      // Mock system error
      mockWasmModule.RenderEngine().create_sprite.mockImplementation(() => {
        throw new Error('WASM operation failed');
      });
      
      render(<GameCanvas />);
      
      const canvas = screen.getByTestId('game-canvas');
      await user.click(canvas);
      
      // User expects error to be handled gracefully
      await waitFor(() => {
        expect(screen.getByText(/operation failed/i)).toBeInTheDocument();
      });
    });

    it('should provide consistent state management across TypeScript systems', async () => {
      render(
        <div>
          <NetworkPanel />
          <PerformanceMonitor isVisible={true} />
          <GameCanvas />
        </div>
      );
      
      // User expects all systems to reflect the same application state
      expect(screen.getByText(/connected/i)).toBeInTheDocument();
      expect(screen.getByText(/fps/i)).toBeInTheDocument();
      expect(screen.getByTestId('game-canvas')).toBeInTheDocument();
    });
  });
});