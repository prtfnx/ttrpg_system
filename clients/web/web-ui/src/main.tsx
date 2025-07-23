import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ToolsPanel } from './components/ToolsPanel'
import { EntitiesPanel } from './components/EntitiesPanel'
import { CharacterPanel } from './components/CharacterPanel'

// Global type declaration for integration mode
declare global {
  interface Window {
    ReactGameComponents: {
      mountLeftPanel: (container: HTMLElement) => void;
      mountRightPanel: (container: HTMLElement) => void;
    };
  }
}

// Always expose integration functions
window.ReactGameComponents = {
  mountLeftPanel: (container: HTMLElement) => {
    const root = createRoot(container);
    root.render(
      <StrictMode>
        <div className="panel-container">
          <ToolsPanel />
        </div>
      </StrictMode>
    );
  },
  
  mountRightPanel: (container: HTMLElement) => {
    const root = createRoot(container);
    root.render(
      <StrictMode>
        <div className="panel-container">
          <EntitiesPanel />
          <CharacterPanel />
        </div>
      </StrictMode>
    );
  }
};

// Check if we're in standalone mode
const rootElement = document.getElementById('root');
if (rootElement) {
  // Standalone React app mode
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

console.log('React game components integration loaded');
