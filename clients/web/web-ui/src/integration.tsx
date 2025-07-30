import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import CharacterPanel from './components/CharacterPanel'
import { EntitiesPanel } from './components/EntitiesPanel'
import { ToolsPanel } from './components/ToolsPanel'
import './index.css'

// Modern ES module approach - export mounting functions
export function mountToolsPanel(container: HTMLElement) {
  const root = createRoot(container)
  root.render(
    <StrictMode>
      <ToolsPanel />
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
        // Bridge to WASM RenderManager if available
        if (type === 'sprite_create' && window.rustRenderManager && typeof window.rustRenderManager.add_sprite === 'function') {
          try {
            // Fill in all required fields for Rust Sprite struct
            const sprite = {
              id: data.id || `sprite_${Date.now()}`,
              x: data.x ?? 0,
              y: data.y ?? 0,
              width: data.width ?? 32,
              height: data.height ?? 32,
              scale_x: data.scale_x ?? 1.0,
              scale_y: data.scale_y ?? 1.0,
              rotation: data.rotation ?? 0.0,
              layer: data.layer ?? 'tokens',
              texture_path: data.texture_path ?? '',
              color: data.color ?? '#ffffff',
            };
            console.log('[integration] Forwarding to WASM add_sprite:', sprite);
            window.rustRenderManager.add_sprite(sprite);
          } catch (err) {
            console.error('[integration] WASM add_sprite error:', err);
          }
        }
        // TODO: Add WebSocket bridge if needed
      },
      renderManager: () => window.rustRenderManager
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
})
