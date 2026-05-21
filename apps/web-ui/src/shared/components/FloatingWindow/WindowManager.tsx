import React, { createContext, useCallback, useContext, useState } from 'react';
import { FloatingWindow } from './FloatingWindow';

interface WindowEntry {
  id: string;
  title: string;
  component: React.ComponentType<Record<string, unknown>>;
  props: Record<string, unknown>;
  zIndex: number;
  minimized: boolean;
  initialWidth?: number;
  initialHeight?: number;
}

interface WindowManagerContextValue {
  openWindow: (
    id: string,
    component: React.ComponentType<Record<string, unknown>>,
    props: Record<string, unknown>,
    options?: { title?: string; width?: number; height?: number }
  ) => void;
  closeWindow: (id: string) => void;
  bringToFront: (id: string) => void;
  isOpen: (id: string) => boolean;
  minimizeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
}

const WindowManagerContext = createContext<WindowManagerContextValue | null>(null);

const BASE_Z = 1000;

function nextZ(windows: WindowEntry[]): number {
  return windows.reduce((m, w) => Math.max(m, w.zIndex), BASE_Z) + 1;
}

export function WindowManagerProvider({ children }: { children: React.ReactNode }) {
  const [windows, setWindows] = useState<WindowEntry[]>([]);

  const openWindow = useCallback((
    id: string,
    component: React.ComponentType<Record<string, unknown>>,
    props: Record<string, unknown>,
    options: { title?: string; width?: number; height?: number } = {}
  ) => {
    setWindows(prev => {
      const z = nextZ(prev);
      const exists = prev.find(w => w.id === id);
      if (exists) {
        // Re-opening a window restores and brings to front
        return [...prev.filter(w => w.id !== id), { ...exists, zIndex: z, minimized: false }];
      }
      return [...prev, {
        id,
        title: options.title ?? id,
        component,
        props,
        zIndex: z,
        minimized: false,
        initialWidth: options.width,
        initialHeight: options.height,
      }];
    });
  }, []);

  const closeWindow = useCallback((id: string) => {
    setWindows(prev => prev.filter(w => w.id !== id));
  }, []);

  const bringToFront = useCallback((id: string) => {
    setWindows(prev => {
      const entry = prev.find(w => w.id === id);
      if (!entry) return prev;
      const z = nextZ(prev);
      return [...prev.filter(w => w.id !== id), { ...entry, zIndex: z }];
    });
  }, []);

  const isOpen = useCallback((id: string) => {
    return windows.some(w => w.id === id);
  }, [windows]);

  const minimizeWindow = useCallback((id: string) => {
    setWindows(prev => prev.map(w => w.id === id ? { ...w, minimized: true } : w));
  }, []);

  const restoreWindow = useCallback((id: string) => {
    setWindows(prev => {
      const entry = prev.find(w => w.id === id);
      if (!entry) return prev;
      const z = nextZ(prev);
      return [...prev.filter(w => w.id !== id), { ...entry, minimized: false, zIndex: z }];
    });
  }, []);

  return (
    <WindowManagerContext.Provider value={{ openWindow, closeWindow, bringToFront, isOpen, minimizeWindow, restoreWindow }}>
      {children}
      {windows.map(w => (
        <FloatingWindow
          key={w.id}
          id={w.id}
          title={w.title}
          zIndex={w.zIndex}
          minimized={w.minimized}
          initialWidth={w.initialWidth}
          initialHeight={w.initialHeight}
          onClose={() => closeWindow(w.id)}
          onFocus={() => bringToFront(w.id)}
          onMinimizeToggle={() => w.minimized ? restoreWindow(w.id) : minimizeWindow(w.id)}
        >
          <w.component {...w.props} onClose={() => closeWindow(w.id)} />
        </FloatingWindow>
      ))}
      {windows.some(w => w.minimized) && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          zIndex: 9999,
          display: 'flex', flexWrap: 'wrap', gap: '4px',
          padding: '4px 8px',
          background: 'var(--bg-elevated)',
          borderTop: '1px solid var(--border-primary)',
        }}>
          {windows.filter(w => w.minimized).map(w => (
            <button
              key={w.id}
              type="button"
              onClick={() => restoreWindow(w.id)}
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '12px',
                padding: '2px 10px',
                height: '26px',
              }}
            >
              {w.title}
            </button>
          ))}
        </div>
      )}
    </WindowManagerContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWindowManager(): WindowManagerContextValue {
  const ctx = useContext(WindowManagerContext);
  if (!ctx) throw new Error('useWindowManager must be used within WindowManagerProvider');
  return ctx;
}
