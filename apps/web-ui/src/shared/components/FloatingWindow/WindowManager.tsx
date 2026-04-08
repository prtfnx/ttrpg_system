import React, { createContext, useCallback, useContext, useState } from 'react';
import { FloatingWindow } from './FloatingWindow';

interface WindowEntry {
  id: string;
  title: string;
  component: React.ComponentType<any>;
  props: Record<string, any>;
  zIndex: number;
  initialWidth?: number;
  initialHeight?: number;
}

interface WindowManagerContextValue {
  openWindow: (
    id: string,
    component: React.ComponentType<any>,
    props: Record<string, any>,
    options?: { title?: string; width?: number; height?: number }
  ) => void;
  closeWindow: (id: string) => void;
  bringToFront: (id: string) => void;
  isOpen: (id: string) => boolean;
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
    component: React.ComponentType<any>,
    props: Record<string, any>,
    options: { title?: string; width?: number; height?: number } = {}
  ) => {
    setWindows(prev => {
      const z = nextZ(prev);
      const exists = prev.find(w => w.id === id);
      if (exists) {
        return [...prev.filter(w => w.id !== id), { ...exists, zIndex: z }];
      }
      return [...prev, {
        id,
        title: options.title ?? id,
        component,
        props,
        zIndex: z,
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

  return (
    <WindowManagerContext.Provider value={{ openWindow, closeWindow, bringToFront, isOpen }}>
      {children}
      {windows.map(w => (
        <FloatingWindow
          key={w.id}
          id={w.id}
          title={w.title}
          zIndex={w.zIndex}
          initialWidth={w.initialWidth}
          initialHeight={w.initialHeight}
          onClose={() => closeWindow(w.id)}
          onFocus={() => bringToFront(w.id)}
        >
          <w.component {...w.props} onClose={() => closeWindow(w.id)} />
        </FloatingWindow>
      ))}
    </WindowManagerContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWindowManager(): WindowManagerContextValue {
  const ctx = useContext(WindowManagerContext);
  if (!ctx) throw new Error('useWindowManager must be used within WindowManagerProvider');
  return ctx;
}
