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

export function WindowManagerProvider({ children }: { children: React.ReactNode }) {
  const [windows, setWindows] = useState<WindowEntry[]>([]);
  const [topZ, setTopZ] = useState(BASE_Z);

  const openWindow = useCallback((
    id: string,
    component: React.ComponentType<any>,
    props: Record<string, any>,
    options: { title?: string; width?: number; height?: number } = {}
  ) => {
    setWindows(prev => {
      const exists = prev.find(w => w.id === id);
      if (exists) {
        // Bring to front
        const next = prev.filter(w => w.id !== id);
        const newZ = topZ + 1;
        setTopZ(newZ);
        return [...next, { ...exists, zIndex: newZ }];
      }
      const newZ = topZ + 1;
      setTopZ(newZ);
      return [...prev, {
        id,
        title: options.title ?? id,
        component,
        props,
        zIndex: newZ,
        initialWidth: options.width,
        initialHeight: options.height,
      }];
    });
  }, [topZ]);

  const closeWindow = useCallback((id: string) => {
    setWindows(prev => prev.filter(w => w.id !== id));
  }, []);

  const bringToFront = useCallback((id: string) => {
    setWindows(prev => {
      const entry = prev.find(w => w.id === id);
      if (!entry) return prev;
      const next = prev.filter(w => w.id !== id);
      const newZ = topZ + 1;
      setTopZ(newZ);
      return [...next, { ...entry, zIndex: newZ }];
    });
  }, [topZ]);

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
