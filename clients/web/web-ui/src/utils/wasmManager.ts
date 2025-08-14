// Global WASM module manager - ensures single instance across the app
export interface GlobalWasmModule {
  RenderEngine: any;
  NetworkClient: any;
  TableSync: any;
  LightingSystem: any;
  FogOfWarSystem: any;
  AssetManager: any;
  LayerManager: any;
  ActionsClient: any;
  PaintSystem: any;
  // Add other WASM exports as needed
  default: () => Promise<void>; // WASM init function
}

// Use declaration merging for Window interface
declare global {
  interface Window {
    wasmInitialized: boolean;
  }
}

// Global state for WASM management
class WasmManager {
  private static instance: WasmManager;
  private wasmModule: GlobalWasmModule | null = null;
  private initPromise: Promise<GlobalWasmModule> | null = null;
  private isInitialized = false;

  private constructor() {}

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
      
      let wasmModule: any;
      
      // Strategy 1: Use dynamic asset path detection
      try {
        // Check if we can find the assets via script tags
        const scripts = document.querySelectorAll('script[src*="ttrpg_rust_core"]');
        if (scripts.length > 0) {
          const scriptSrc = (scripts[0] as HTMLScriptElement).src;
          console.log('[WASM Manager] Found asset path from DOM:', scriptSrc);
          wasmModule = await import(/* @vite-ignore */ scriptSrc);
        } else {
          throw new Error('No WASM script tags found');
        }
      } catch (error) {
        console.log('[WASM Manager] DOM detection failed, trying hardcoded paths...', error);
        
        // Strategy 2: Try common paths
        const possiblePaths = [
          // Vite build assets (production)
          '/assets/ttrpg_rust_core-D-72hd6H.js',
          // Server static path
          '/static/ui/wasm/ttrpg_rust_core.js',
          // Development paths
          '../wasm/ttrpg_rust_core.js',
          './wasm/ttrpg_rust_core.js',
          '../../../public/wasm/ttrpg_rust_core.js',
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
      const requiredExports = ['RenderEngine', 'NetworkClient'];
      const missingExports = requiredExports.filter(exp => !wasmModule[exp]);
      
      if (missingExports.length > 0) {
        console.warn('[WASM Manager] Missing critical WASM exports:', missingExports);
      }

      // Optional exports (warn but don't fail)
      const optionalExports = ['TableSync', 'AssetManager', 'LightingSystem', 'FogOfWarSystem', 'LayerManager'];
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

  async getNetworkClient(): Promise<any> {
    const wasm = await this.getWasmModule();
    return wasm.NetworkClient;
  }

  async getTableSync(): Promise<any> {
    const wasm = await this.getWasmModule();
    return wasm.TableSync;
  }

  async getAssetManager(): Promise<any> {
    const wasm = await this.getWasmModule();
    return wasm.AssetManager;
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
