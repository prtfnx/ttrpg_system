console.log('[DEBUG] main.tsx script loaded');
import { AuthProvider } from '@features/auth';
import { CharacterPanel } from '@features/character/components/CharacterPanel';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { EntitiesPanel } from './features/canvas/components/EntitiesPanel';
import { ToolsPanel } from './features/canvas/components/ToolsPanel';
import './index.css';

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
        <AuthProvider>
          <div className="panel-container">
            <ToolsPanel userInfo={{ id: 0, username: "unknown", role: "player", permissions: [] }} />
          </div>
        </AuthProvider>
      </StrictMode>
    );
  },
  
  mountRightPanel: (container: HTMLElement) => {
    const root = createRoot(container);
    root.render(
      <StrictMode>
        <AuthProvider>
          <div className="panel-container">
            <EntitiesPanel />
            <CharacterPanel />
          </div>
        </AuthProvider>
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
      <AuthProvider>
        <App />
      </AuthProvider>
    </StrictMode>,
  )
}

console.log('React game components integration loaded');
