import type { RenderEngine } from './wasm';

// Global WASM module manager - ensures single instance across the app
export interface GlobalWasmModule {
  RenderEngine: any;
  AssetManager: any;
  // PaintSystem / BrushPreset: internal — accessed via RenderEngine paint_* methods
  PaintSystem: any;
  create_default_brush_presets: () => any;
  version?: () => string;
  init_game_renderer?: (canvas: HTMLCanvasElement) => RenderEngine;
  default: () => Promise<void>; // WASM init function
}

// Global state for WASM management
class WasmManager {
  private static instance: WasmManager;
  private wasmModule: GlobalWasmModule | null = null;
  private initPromise: Promise<GlobalWasmModule> | null = null;
  private isInitialized = false;

  private constructor() {}

  private createMockWasmModule(): GlobalWasmModule {
    console.log('[WASM Manager] Creating mock WASM module for testing');
    
    // Create mock implementations of all WASM exports
    const mockEngine = {
      // Lighting methods
      add_light: () => console.log('Mock: add_light called'),
      remove_light: () => console.log('Mock: remove_light called'),
      set_light_color: () => console.log('Mock: set_light_color called'),
      set_light_intensity: () => console.log('Mock: set_light_intensity called'),
      set_light_radius: () => console.log('Mock: set_light_radius called'),
      update_light_position: () => console.log('Mock: update_light_position called'),
      toggle_light: () => console.log('Mock: toggle_light called'),
      turn_off_all_lights: () => console.log('Mock: turn_off_all_lights called'),
      turn_on_all_lights: () => console.log('Mock: turn_on_all_lights called'),
      clear_lights: () => console.log('Mock: clear_lights called'),
      // Render methods
      render: () => console.log('Mock: render called'),
      clear: () => console.log('Mock: clear called'),
      // Basic functionality
      width: 800,
      height: 600,
    };
    
    return {
      RenderEngine: mockEngine,
      AssetManager: {},
      PaintSystem: {},
      create_default_brush_presets: () => ({}),
      default: async () => Promise.resolve(),
    };
  }

  static getInstance(): WasmManager {
    if (!WasmManager.instance) {
      WasmManager.instance = new WasmManager();
    }
    return WasmManager.instance;
  }

  async getWasmModule(): Promise<GlobalWasmModule> {
    if (this.wasmModule && this.isInitialized) {
      return this.wasmModule;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.initializeWasm();
    return this.initPromise;
  }

  private async initializeWasm(): Promise<GlobalWasmModule> {
    try {
      console.log('[WASM Manager] Starting WASM initialization...');
      
      // Check if we're in a test environment using safe detection methods
      const isTest = (typeof globalThis !== 'undefined' && (globalThis as any).process?.env?.NODE_ENV === 'test') ||
                     (typeof window !== 'undefined' && (window as any).__VITEST__) ||
                     (typeof globalThis !== 'undefined' && (globalThis as any).__VITEST__);
      
      if (isTest) {
        console.log('[WASM Manager] Test environment detected, using mock WASM module');
        this.wasmModule = this.createMockWasmModule();
        this.isInitialized = true;
        return this.wasmModule!;
      }
      
      let wasmModule: any;
      
      // Strategy 1: Use dynamic asset path detection (browser only)
      try {
        // Check if we're in a browser environment first
        if (typeof document !== 'undefined') {
          // Check if we can find the assets via script tags
          const scripts = document.querySelectorAll('script[src*="ttrpg_rust_core"]');
          if (scripts.length > 0) {
            const scriptSrc = (scripts[0] as HTMLScriptElement).src;
            console.log('[WASM Manager] Found asset path from DOM:', scriptSrc);
            wasmModule = await import(/* @vite-ignore */ scriptSrc);
          } else {
            throw new Error('No WASM script tags found');
          }
        } else {
          throw new Error('Not in browser environment');
        }
      } catch (error) {
        console.log('[WASM Manager] DOM detection failed, trying hardcoded paths...', error);
        
        // Strategy 2: Try production path
        const possiblePaths = [
          // Server static path (production deploy path)
          '/static/ui/wasm/ttrpg_rust_core.js',
        ];

        let loaded = false;
        for (const path of possiblePaths) {
          try {
            console.log(`[WASM Manager] Trying path: ${path}`);
            wasmModule = await import(/* @vite-ignore */ path);
            console.log(`[WASM Manager] Successfully loaded from: ${path}`);
            loaded = true;
            break;
          } catch (err) {
            console.log(`[WASM Manager] Failed to load from ${path}:`, err);
          }
        }

        if (!loaded) {
          throw new Error('Failed to load WASM module from any path');
        }
      }

      // Initialize the WASM module
      if (typeof wasmModule.default === 'function') {
        console.log('[WASM Manager] Calling WASM init function...');
        await wasmModule.default();
        console.log('[WASM Manager] WASM init completed');
      }

      // Validate required exports
      const requiredExports = ['RenderEngine'];
      const missingExports = requiredExports.filter(exp => !wasmModule[exp]);
      
      if (missingExports.length > 0) {
        console.warn('[WASM Manager] Missing critical WASM exports:', missingExports);
      }

      // Optional exports (warn but don't fail)
      const optionalExports = ['AssetManager', 'PaintSystem'];
      const missingOptional = optionalExports.filter(exp => !wasmModule[exp]);
      
      if (missingOptional.length > 0) {
        console.warn('[WASM Manager] Missing optional WASM exports:', missingOptional);
      }

      this.wasmModule = wasmModule as GlobalWasmModule;
      this.isInitialized = true;

      // Set global window reference for backward compatibility
      if (typeof window !== 'undefined') {
        (window as any).ttrpg_rust_core = this.wasmModule;
        window.wasmInitialized = true;
      }

      console.log('[WASM Manager] WASM module fully initialized');
      console.log('[WASM Manager] Available exports:', Object.keys(wasmModule));
      return this.wasmModule;

    } catch (error) {
      console.error('[WASM Manager] Failed to initialize WASM:', error);
      // Reset state on failure
      this.initPromise = null;
      this.isInitialized = false;
      if (typeof window !== 'undefined') {
        window.wasmInitialized = false;
        (window as any).ttrpg_rust_core = null;
      }
      throw error;
    }
  }

  // Helper methods for specific WASM classes
  async getRenderEngine(): Promise<any> {
    const wasm = await this.getWasmModule();
    return wasm.RenderEngine;
  }

  async getAssetManager(): Promise<any> {
    const wasm = await this.getWasmModule();
    return wasm.AssetManager;
  }

  /**
   * Initialize the WebGL renderer on the given canvas.
   * Calls `init_game_renderer(canvas)` from the WASM module.
   */
  async createRenderer(canvas: HTMLCanvasElement): Promise<RenderEngine> {
    const wasm = await this.getWasmModule();
    if (typeof wasm.init_game_renderer !== 'function') {
      throw new Error('[WASM] init_game_renderer not available in this build');
    }
    return wasm.init_game_renderer(canvas);
  }

  // Check if WASM is ready without triggering initialization
  isReady(): boolean {
    return this.isInitialized && this.wasmModule !== null;
  }
}

// Export singleton instance
export const wasmManager = WasmManager.getInstance();

// Backward compatibility exports
export const initializeWasm = () => wasmManager.getWasmModule();

// Initialize window globals
if (typeof window !== 'undefined') {
  (window as any).ttrpg_rust_core = null;
  window.wasmInitialized = false;
}
