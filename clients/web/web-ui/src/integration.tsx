import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ToolsPanel } from './components/ToolsPanel'
import { EntitiesPanel } from './components/EntitiesPanel'
import { CharacterPanel } from './components/CharacterPanel'
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
