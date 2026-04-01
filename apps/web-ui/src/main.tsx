console.log('[DEBUG] main.tsx script loaded');
import { AuthProvider } from '@features/auth';
import { EntitiesPanel } from '@features/canvas/components/EntitiesPanel';
import { ToolsPanel } from '@features/canvas/components/ToolsPanel';
import { CharacterPanel } from '@features/character/components/CharacterPanel';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const isDev = import.meta.env.DEV;

// Conditionally wrap with StrictMode — only in development to avoid double effects in production
function AppWrapper() {
  return isDev ? (
    <StrictMode>
      <AuthProvider><App /></AuthProvider>
    </StrictMode>
  ) : (
    <AuthProvider><App /></AuthProvider>
  );
}

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
      <AuthProvider>
        <div className="panel-container">
          <ToolsPanel userInfo={{ id: 0, username: "unknown", role: "player", permissions: [] }} />
        </div>
      </AuthProvider>
    );
  },
  
  mountRightPanel: (container: HTMLElement) => {
    const root = createRoot(container);
    root.render(
      <AuthProvider>
        <div className="panel-container">
          <EntitiesPanel />
          <CharacterPanel />
        </div>
      </AuthProvider>
    );
  }
};

// Check if we're in standalone mode
const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<AppWrapper />);
}

console.log('React game components integration loaded');
