import { Minus, X } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Rnd } from 'react-rnd';
import styles from './FloatingWindow.module.css';

interface FloatingWindowProps {
  id: string;
  title: string;
  initialWidth?: number;
  initialHeight?: number;
  minWidth?: number;
  minHeight?: number;
  initialX?: number;
  initialY?: number;
  zIndex: number;
  isTopmost: boolean;
  minimized?: boolean;
  onClose: () => void;
  onFocus: () => void;
  onMinimizeToggle?: () => void;
  children: React.ReactNode;
}

interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
}

const isFiniteNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

function loadState(
  id: string,
  defaults: WindowState,
  minWidth: number,
  minHeight: number,
): WindowState {
  try {
    const saved = sessionStorage.getItem(`fw:${id}`);
    if (!saved) return defaults;
    const value: unknown = JSON.parse(saved);
    if (typeof value !== 'object' || value === null) return defaults;
    const persisted = value as Partial<WindowState>;
    return {
      x: isFiniteNumber(persisted.x) ? persisted.x : defaults.x,
      y: isFiniteNumber(persisted.y) ? persisted.y : defaults.y,
      width: isFiniteNumber(persisted.width)
        ? Math.max(minWidth, persisted.width)
        : defaults.width,
      height: isFiniteNumber(persisted.height)
        ? Math.max(minHeight, persisted.height)
        : defaults.height,
      minimized: typeof persisted.minimized === 'boolean'
        ? persisted.minimized
        : defaults.minimized,
    };
  } catch {}
  return defaults;
}

function saveState(id: string, state: WindowState) {
  try {
    sessionStorage.setItem(`fw:${id}`, JSON.stringify(state));
  } catch {}
}

export function FloatingWindow({
  id,
  title,
  initialWidth = 500,
  initialHeight = 600,
  minWidth = 300,
  minHeight = 200,
  initialX,
  initialY,
  zIndex,
  isTopmost,
  minimized: minimizedProp,
  onClose,
  onFocus,
  onMinimizeToggle,
  children,
}: FloatingWindowProps) {
  const defaults: WindowState = {
    x: initialX ?? Math.max(0, (window.innerWidth - initialWidth) / 2),
    y: initialY ?? Math.max(0, (window.innerHeight - initialHeight) / 4),
    width: initialWidth,
    height: initialHeight,
    minimized: false,
  };

  const [state, setState] = useState<WindowState>(() => (
    loadState(id, defaults, minWidth, minHeight)
  ));
  const rndRef = useRef<Rnd>(null);
  const isMinimized = minimizedProp !== undefined ? minimizedProp : state.minimized;

  const updateState = useCallback((patch: Partial<WindowState>) => {
    setState(prev => {
      const next = { ...prev, ...patch };
      saveState(id, next);
      return next;
    });
  }, [id]);

  const handleMinimizeToggle = useCallback(() => {
    if (onMinimizeToggle) {
      onMinimizeToggle();
    } else {
      updateState({ minimized: !state.minimized });
    }
  }, [onMinimizeToggle, updateState, state.minimized]);

  // Escape key closes the topmost focused window
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTopmost && !isMinimized) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isMinimized, isTopmost, onClose]);

  const root = document.getElementById('window-root');
  if (!root) return null;

  const content = (
    <div
      style={{ position: 'absolute', top: 0, left: 0, zIndex }}
      onPointerDown={onFocus}
    >
      <Rnd
        ref={rndRef}
        size={{ width: state.width, height: isMinimized ? 36 : state.height }}
        position={{ x: state.x, y: state.y }}
        minWidth={minWidth}
        minHeight={isMinimized ? 36 : minHeight}
        dragHandleClassName={styles.titleBar}
        bounds="window"
        onDragStop={(_, d) => updateState({ x: d.x, y: d.y })}
        onResizeStop={(_, __, ref, ___, pos) => {
          const width = Number.parseFloat(ref.style.width);
          const height = Number.parseFloat(ref.style.height);
          updateState({
            ...(Number.isFinite(width) ? { width: Math.max(minWidth, width) } : {}),
            ...(Number.isFinite(height) ? { height: Math.max(minHeight, height) } : {}),
            ...(Number.isFinite(pos.x) ? { x: pos.x } : {}),
            ...(Number.isFinite(pos.y) ? { y: pos.y } : {}),
          });
        }}
        enableResizing={!isMinimized}
        className={styles.floatingWindow}
      >
        <div className={styles.titleBar}>
          <span className={styles.titleText}>{title}</span>
          <div className={styles.titleActions}>
            <button
              type="button"
              className={styles.titleBtn}
              onClick={handleMinimizeToggle}
              title={isMinimized ? 'Restore' : 'Minimize'}
            >
              <Minus size={12} aria-hidden />
            </button>
            <button
              type="button"
              className={styles.titleBtn}
              onClick={onClose}
              title="Close"
            >
              <X size={12} aria-hidden />
            </button>
          </div>
        </div>

        {!isMinimized && (
          <div className={styles.windowBody}>
            {children}
          </div>
        )}
      </Rnd>
    </div>
  );

  return createPortal(content, root);
}
