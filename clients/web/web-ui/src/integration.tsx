import { CharacterPanel } from '@features/character'
import { initVisionService } from '@features/lighting'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { EntitiesPanel } from './components/EntitiesPanel'
import { ToolsPanel } from './components/ToolsPanel'
import './index.css'

// Modern ES module approach - export mounting functions
export function mountToolsPanel(container: HTMLElement) {
  const root = createRoot(container)
  root.render(
    <StrictMode>
  <ToolsPanel userInfo={{ id: 0, username: "unknown", role: "player", permissions: [] }} />
    </StrictMode>
  )
  return root
}

export function mountEntitiesPanel(container: HTMLElement) {
  const root = createRoot(container)
  root.render(
    <StrictMode>
      <EntitiesPanel />
    </StrictMode>
  )
  return root
}

export function mountCharacterPanel(container: HTMLElement) {
  const root = createRoot(container)
  root.render(
    <StrictMode>
      <CharacterPanel />
    </StrictMode>
  )
  return root
}

// Auto-mount if DOM elements exist (for integration)
document.addEventListener('DOMContentLoaded', () => {
  // Define window.gameAPI if not present
  if (!window.gameAPI) {
    window.gameAPI = {
      sendMessage: (type, data) => {
        console.log('[integration] gameAPI.sendMessage called:', type, data);
        
        // Bridge to WASM RenderManager for all sprite operations
        if (window.rustRenderManager) {
          try {
            switch (type) {
              case 'sprite_create':
                if (typeof window.rustRenderManager.add_sprite_to_layer === 'function') {
                  const layer = (data.layer as string) ?? 'tokens';
                  // Fill in all required fields for Rust Sprite struct
                  const sprite = {
                    id: data.id || `sprite_${Date.now()}`,
                    world_x: data.x ?? 0,
                    world_y: data.y ?? 0,
                    width: data.width ?? 32,
                    height: data.height ?? 32,
                    scale_x: data.scale_x ?? 1.0,
                    scale_y: data.scale_y ?? 1.0,
                    rotation: data.rotation ?? 0.0,
                    layer: layer,
                    texture_id: data.texture_path ?? data.asset_id ?? '',
                    tint_color: [1.0, 1.0, 1.0, 1.0],
                    table_id: data.table_id ?? 'default_table', // Use default table if not specified
                  };
                  console.log('[integration] Forwarding to WASM add_sprite_to_layer:', layer, sprite);
                  window.rustRenderManager.add_sprite_to_layer(layer, sprite);
                }
                break;
              
              case 'sprite_move':
                if (typeof window.rustRenderManager.send_sprite_move === 'function') {
                  console.log('[integration] Forwarding sprite_move to WASM:', data);
                  window.rustRenderManager.send_sprite_move(data.id as string, data.x as number, data.y as number);
                }
                break;
              
              case 'sprite_scale':
                if (typeof window.rustRenderManager.send_sprite_scale === 'function') {
                  console.log('[integration] Forwarding sprite_scale to WASM:', data);
                  window.rustRenderManager.send_sprite_scale(data.id as string, data.scale_x as number, data.scale_y as number);
                }
                break;
              
              case 'sprite_rotate':
                if (typeof window.rustRenderManager.send_sprite_rotate === 'function') {
                  console.log('[integration] Forwarding sprite_rotate to WASM:', data);
                  window.rustRenderManager.send_sprite_rotate(data.id as string, data.rotation as number);
                }
                break;
              
              case 'sprite_delete':
                if (typeof window.rustRenderManager.remove_sprite_from_layer === 'function') {
                  console.log('[integration] Forwarding sprite_delete to WASM:', data);
                  window.rustRenderManager.remove_sprite_from_layer((data.layer as string) || 'tokens', data.id as string);
                }
                break;
              
              default:
                console.warn('[integration] Unknown message type:', type);
            }
          } catch (err) {
            console.error(`[integration] WASM ${type} error:`, err);
          }
        } else {
          console.warn('[integration] rustRenderManager not available for:', type);
        }
      },
      renderManager: () => window.rustRenderManager || null
    };
  }

  // Set up WASM → React bridge for sprite updates
  // This will be called from Rust when sprites are manipulated
  if (!window.wasmBridge) {
    window.wasmBridge = {
      // Called when sprite operations complete in WASM
      onSpriteOperationComplete: (operation: string, spriteId: string, data: any) => {
        console.log('[integration] WASM operation complete:', operation, spriteId, data);
        
        // Dispatch custom event that components can listen to
        window.dispatchEvent(new CustomEvent('wasm-sprite-operation', {
          detail: { operation, spriteId, data }
        }));
        
        // For network sync operations, also emit specific events
        switch (operation) {
          case 'move':
            window.dispatchEvent(new CustomEvent('sprite-moved', {
              detail: { spriteId, x: data.x, y: data.y }
            }));
            break;
          case 'scale':
            window.dispatchEvent(new CustomEvent('sprite-scaled', {
              detail: { spriteId, scale_x: data.scale_x, scale_y: data.scale_y }
            }));
            break;
          case 'rotate':
            window.dispatchEvent(new CustomEvent('sprite-rotated', {
              detail: { spriteId, rotation: data.rotation }
            }));
            break;
        }
      },
      
      // Called when WASM needs to send network updates
      sendNetworkUpdate: (updateType: string, data: any) => {
        console.log('[integration] WASM requesting network update:', updateType, data);
        
        // Dispatch event that protocol can listen to
        window.dispatchEvent(new CustomEvent('wasm-network-request', {
          detail: { updateType, data }
        }));
      },
      
      // Error handling from WASM
      onError: (operation: string, error: string) => {
        console.error('[integration] WASM error:', operation, error);
        window.dispatchEvent(new CustomEvent('wasm-error', {
          detail: { operation, error }
        }));
      }
    };
  }

  const leftPanel = document.getElementById('react-left-panel')
  const rightPanelTop = document.getElementById('react-entities-panel')
  const rightPanelBottom = document.getElementById('react-character-panel')

  if (leftPanel) {
    mountToolsPanel(leftPanel)
  }

  if (rightPanelTop) {
    mountEntitiesPanel(rightPanelTop)
  }

  if (rightPanelBottom) {
    mountCharacterPanel(rightPanelBottom)
  }

  // Start vision service which will wait for WASM and then run LOS updates
  try {
    visionService.initVisionService(150);
  } catch (err) {
    console.error('[integration] Failed to init vision service:', err);
  }
})
