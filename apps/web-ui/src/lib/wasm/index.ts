export * from './wasm.d';
export { useWasmBridge } from './wasmBridge';
export { wasmIntegrationService } from './wasmIntegration.service';
export { wasmManager } from './wasmManager';
export type { GlobalWasmModule } from './wasmManager';
export type { WasmApi } from './wasmApi';
export { emitWasmEvent, onWasmEvent, onWasmEvents } from './wasmEvents';
export type { WasmEventMap, WasmEventHandler } from './wasmEvents';
export { useWasm } from './useWasm';
// Sub-services (use for testing / direct injection)
export { AssetSyncService } from './assetSync.service';
export { SpriteSyncService } from './spriteSync.service';
export { TableSyncService } from './tableSync.service';
export { RemoteSyncService } from './remoteSync.service';

