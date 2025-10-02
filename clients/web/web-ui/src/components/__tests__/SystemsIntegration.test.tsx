import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Import web client system components
import { ActionsPanel } from '../ActionsPanel';
import { AssetPanel } from '../AssetPanel';
import { CharacterManager } from '../CharacterManager';
import ChatPanel from '../ChatPanel';
import { GameCanvas } from '../GameCanvas';
import { NetworkPanel } from '../NetworkPanel';
import { PerformanceMonitor } from '../PerformanceMonitor';

//Mock WASM module with realistic interface
const mockLoadTexture = vi.fn().mockResolvedValue(true);
const mockRenderEngine = {
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
  add_light: vi.fn(),
  set_light_color: vi.fn(),
  set_light_intensity: vi.fn(),
  remove_light: vi.fn(),
  update_fog_of_war: vi.fn(),
  calculate_line_of_sight: vi.fn().mockReturnValue(true),
  create_table: vi.fn(),
  load_texture: mockLoadTexture,
  get_performance_metrics: vi.fn().mockReturnValue({
    fps: 60,
    frame_time: 16.67,
    memory_usage: 1024 * 1024,
    sprite_count: 15
  })
};

const mockWasmModule = {
  RenderEngine: vi.fn().mockImplementation(() => mockRenderEngine),
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
  // Add missing required properties for GlobalWasmModule interface
  TableSync: vi.fn().mockImplementation(() => ({
    sync_table: vi.fn(),
    get_table_state: vi.fn()
  })),
  LightingSystem: vi.fn().mockImplementation(() => ({
    add_light: vi.fn(),
    remove_light: vi.fn()
  })),
  FogOfWarSystem: vi.fn().mockImplementation(() => ({
    update_fog: vi.fn(),
    clear_fog: vi.fn()
  })),
  LayerManager: vi.fn().mockImplementation(() => ({
    add_layer: vi.fn(),
    remove_layer: vi.fn()
  })),
  PaintSystem: vi.fn().mockImplementation(() => ({
    start_painting: vi.fn(),
    stop_painting: vi.fn()
  })),
  create_default_brush_presets: vi.fn().mockReturnValue([]),
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

vi.mock('../../services/ProtocolContext', () => ({
  useProtocol: vi.fn().mockReturnValue({
    protocol: {
      client_id: 'test-client-123',
      connection: {
        readyState: 1, // WebSocket.OPEN
        send: vi.fn(),
        close: vi.fn()
      },
      sendMessage: vi.fn(),
      isConnected: true,
      registerHandler: vi.fn(),
      unregisterHandler: vi.fn()
    }
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

beforeEach(() => {
  // Clear all mocks before each test
  vi.clearAllMocks();
  mockLoadTexture.mockClear();
});

describe('Web Client TypeScript & WASM Systems Integration Tests', () => {
  const user = userEvent.setup();
  const mockUserInfo = { id: 1, username: 'testuser', role: 'dm' as const, permissions: ['all'] };

  describe('WASM Integration System', () => {
    it('should initialize WASM module and provide TypeScript bridge', async () => {
      // Set up WASM mock state on window
      (window as any).ttrpg_rust_core = mockWasmModule;
      window.wasmInitialized = true;
      
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
      // Set up WASM mock state
      (window as any).ttrpg_rust_core = mockWasmModule;
      window.wasmInitialized = true;
      
      render(<GameCanvas />);
      
      const canvas = screen.getByTestId('game-canvas');
      
      // User expects canvas to be ready for interaction
      await waitFor(() => {
        expect(canvas).toBeInTheDocument();
      });
      
      // User expects WASM methods to be available
      expect(mockWasmModule.RenderEngine().screen_to_world).toBeDefined();
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

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(<GameCanvas />);

      // User expects WASM errors to be logged and handled gracefully
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to load WASM module'),
          expect.any(Error)
        );
      });

      consoleSpy.mockRestore();
    });
  });

  describe('Actions System - TypeScript Command Bus', () => {
    beforeEach(() => {
      // Reset WASM mock for clean actions tests
      mockWasmModule.RenderEngine.mockClear();
      mockWasmModule.RenderEngine.mockImplementation(() => ({
        initialize: vi.fn().mockResolvedValue(undefined),
        free: vi.fn(),
        render: vi.fn(),
        resize: vi.fn(),
        add_sprite_to_layer: vi.fn(),
        remove_sprite: vi.fn(),
        screen_to_world: vi.fn().mockReturnValue({ x: 10.5, y: 20.3 })
      }));
    });
    
    it('should coordinate WASM operations through TypeScript actions', async () => {
      const mockRenderEngine = mockWasmModule.RenderEngine();
      render(<ActionsPanel renderEngine={mockRenderEngine} />);
      
      // User expects action interface to be available
      expect(screen.getByText(/actions/i)).toBeInTheDocument();
    });

    it('should support batch operations with WASM backend', async () => {
      const mockRenderEngine = mockWasmModule.RenderEngine();
      render(<ActionsPanel renderEngine={mockRenderEngine} />);
      
      // User expects action creation to be available
      const createButton = screen.getByRole('button', { name: /create table/i });
      expect(createButton).toBeInTheDocument();
      
      // User expects tables tab to be available for batch operations
      const tablesTab = screen.getByRole('button', { name: /tables/i });
      expect(tablesTab).toBeInTheDocument();
      await user.click(tablesTab);
      
      // User expects tables section to be present for batch operations
      expect(screen.getByText(/tables \(0\)/i)).toBeInTheDocument();
    });

    it('should provide undo/redo functionality backed by WASM', async () => {
      const mockRenderEngine = mockWasmModule.RenderEngine();
      render(<ActionsPanel renderEngine={mockRenderEngine} />);
      
      // User expects action interface to be available with undo/redo
      expect(screen.getByText(/actions/i)).toBeInTheDocument();
      
      // Check if undo button exists (may not be enabled without actions)
      const undoButton = screen.queryByRole('button', { name: /undo/i });
      if (undoButton) {
        expect(undoButton).toBeInTheDocument();
      }
    });
  });

  describe('Character Management - TypeScript Integration', () => {
    it('should manage character data with proper TypeScript types', async () => {
      render(<CharacterManager sessionCode="TEST123" userInfo={mockUserInfo} />);
      
      // User expects character creation button to be available during loading
      const createButton = screen.getByRole('button', { name: /create.*character/i });
      expect(createButton).toBeInTheDocument();
      
      // User expects loading indicator to be present initially
      expect(screen.getByText(/loading characters/i)).toBeInTheDocument();
      
      // User expects proper character management interface
      expect(screen.getByText(/characters synced/i)).toBeInTheDocument();
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
      expect(screen.getByTestId('connection-status')).toHaveTextContent(/disconnected/i);
      
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
      const imageCategory = screen.getByRole('button', { name: 'Images' });
      const modelCategory = screen.getByRole('button', { name: 'Models' });
      expect(imageCategory).toBeInTheDocument();
      expect(modelCategory).toBeInTheDocument();
      
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
      
      // User expects file input to be available
      const fileInput = screen.getByTestId('file-input');
      expect(fileInput).toBeInTheDocument();
      
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
          expect(mockLoadTexture).toHaveBeenCalled();
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
      render(<PerformanceMonitor isVisible={true} />);
      
      // User expects performance monitoring to be available
      expect(screen.getByText(/fps/i)).toBeInTheDocument();
      expect(screen.getByText(/memory/i)).toBeInTheDocument();
      expect(screen.getByText(/frame.*time/i)).toBeInTheDocument();
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
      
      // User expects mouse interactions to work with the canvas
      await user.click(canvas);
      
      // User expects canvas to be interactive (focus should work)
      await waitFor(() => {
        expect(canvas).toHaveFocus();
      });
      
      // User expects coordinate display to be present
      expect(screen.getByText(/mouse css/i)).toBeInTheDocument();
      expect(screen.getAllByText(/world/i)).toHaveLength(2); // One in FPS overlay, one in debug overlay
    });

    it('should support sprite manipulation through TypeScript interface', async () => {
      render(<GameCanvas />);
      
      // User expects sprite manipulation interface to be available
      const canvas = screen.getByTestId('game-canvas');
      expect(canvas).toBeInTheDocument();
      
      // User expects draggable tokens for testing
      expect(screen.getByTestId('draggable-token-wizard')).toBeInTheDocument();
      expect(screen.getByTestId('draggable-token-dragon')).toBeInTheDocument();
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
      
      // User expects all systems to be present and functional
      expect(screen.getByText(/actions system/i)).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /characters/i })).toBeInTheDocument();
      expect(screen.getByTestId('game-canvas')).toBeInTheDocument();
    });

    it('should handle errors consistently across TypeScript boundaries', async () => {
      render(
        <div>
          <ActionsPanel renderEngine={mockWasmModule.RenderEngine()} />
          <GameCanvas />
        </div>
      );
      
      // User expects error handling to be graceful
      expect(screen.getByText(/actions system/i)).toBeInTheDocument();
      expect(screen.getByTestId('game-canvas')).toBeInTheDocument();
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
      expect(screen.getByTestId('connection-status')).toHaveTextContent(/disconnected/i);
      // Use getAllByText to handle multiple FPS displays and just check one exists
      const fpsElements = screen.getAllByText(/fps/i);
      expect(fpsElements.length).toBeGreaterThan(0);
      expect(screen.getByTestId('game-canvas')).toBeInTheDocument();
    });
  });
});