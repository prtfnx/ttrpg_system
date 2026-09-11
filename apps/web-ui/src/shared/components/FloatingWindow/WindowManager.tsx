import React, { createContext, useCallback, useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import { FloatingWindow } from './FloatingWindow';
import styles from './FloatingWindow.module.css';

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

const BASE_Z = 0;

function nextZ(windows: WindowEntry[]): number {
  return BASE_Z + windows.length + 1;
}

function normalizeZOrder(windows: WindowEntry[]): WindowEntry[] {
  return [...windows]
    .sort((left, right) => left.zIndex - right.zIndex)
    .map((window, index) => ({ ...window, zIndex: BASE_Z + index + 1 }));
}

function moveToFront(windows: WindowEntry[], id: string): WindowEntry[] {
  const ordered = normalizeZOrder(windows);
  const entry = ordered.find(window => window.id === id);
  if (!entry) return windows;
  const behind = ordered.filter(window => window.id !== id);
  return [...behind, { ...entry, zIndex: nextZ(behind) }];
}

export function WindowManagerProvider({ children }: { children: React.ReactNode }) {
  const [windows, setWindows] = useState<WindowEntry[]>([]);
  const topmostVisibleZ = windows.reduce(
    (highest, window) => window.minimized ? highest : Math.max(highest, window.zIndex),
    Number.NEGATIVE_INFINITY,
  );

  const openWindow = useCallback((
    id: string,
    component: React.ComponentType<Record<string, unknown>>,
    props: Record<string, unknown>,
    options: { title?: string; width?: number; height?: number } = {}
  ) => {
    setWindows(prev => {
      const normalized = normalizeZOrder(prev);
      const z = nextZ(normalized);
      const exists = normalized.find(w => w.id === id);
      if (exists) {
        // Re-opening a window restores and brings to front
        return [...normalized.filter(w => w.id !== id), { ...exists, zIndex: z, minimized: false }];
      }
      return [...normalized, {
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
    setWindows(prev => moveToFront(prev, id));
  }, []);

  const isOpen = useCallback((id: string) => {
    return windows.some(w => w.id === id);
  }, [windows]);

  const minimizeWindow = useCallback((id: string) => {
    setWindows(prev => prev.map(w => w.id === id ? { ...w, minimized: true } : w));
  }, []);

  const restoreWindow = useCallback((id: string) => {
    setWindows(prev => moveToFront(
      prev.map(window => window.id === id ? { ...window, minimized: false } : window),
      id,
    ));
  }, []);

  const windowRoot = typeof document === 'undefined' ? null : document.getElementById('window-root');

  return (
    <WindowManagerContext.Provider value={{ openWindow, closeWindow, bringToFront, isOpen, minimizeWindow, restoreWindow }}>
      {children}
      {windows.map(w => (
        <FloatingWindow
          key={w.id}
          id={w.id}
          title={w.title}
          zIndex={w.zIndex}
          isTopmost={!w.minimized && w.zIndex === topmostVisibleZ}
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
      {windowRoot && windows.some(w => w.minimized) && createPortal(
        <div className={styles.taskbar}>
          {windows.filter(w => w.minimized).map(w => (
            <button
              key={w.id}
              type="button"
              onClick={() => restoreWindow(w.id)}
              className={styles.taskbarButton}
            >
              {w.title}
            </button>
          ))}
        </div>,
        windowRoot,
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
