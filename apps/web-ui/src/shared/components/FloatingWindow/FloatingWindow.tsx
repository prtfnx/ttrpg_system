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
  onClose: () => void;
  onFocus: () => void;
  children: React.ReactNode;
}

interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
}

function loadState(id: string, defaults: WindowState): WindowState {
  try {
    const saved = sessionStorage.getItem(`fw:${id}`);
    if (saved) return { ...defaults, ...JSON.parse(saved) };
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
  onClose,
  onFocus,
  children,
}: FloatingWindowProps) {
  const defaults: WindowState = {
    x: initialX ?? Math.max(0, (window.innerWidth - initialWidth) / 2),
    y: initialY ?? Math.max(0, (window.innerHeight - initialHeight) / 4),
    width: initialWidth,
    height: initialHeight,
    minimized: false,
  };

  const [state, setState] = useState<WindowState>(() => loadState(id, defaults));
  const rndRef = useRef<Rnd>(null);

  const updateState = useCallback((patch: Partial<WindowState>) => {
    setState(prev => {
      const next = { ...prev, ...patch };
      saveState(id, next);
      return next;
    });
  }, [id]);

  // Escape key closes the topmost focused window
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const root = document.getElementById('window-root');
  if (!root) return null;

  const content = (
    <div
      style={{ position: 'absolute', top: 0, left: 0, zIndex }}
      onMouseDown={onFocus}
    >
      <Rnd
        ref={rndRef}
        size={{ width: state.width, height: state.minimized ? 36 : state.height }}
        position={{ x: state.x, y: state.y }}
        minWidth={minWidth}
        minHeight={state.minimized ? 36 : minHeight}
        dragHandleClassName={styles.titleBar}
        bounds="window"
        onDragStop={(_, d) => updateState({ x: d.x, y: d.y })}
        onResizeStop={(_, __, ref, ___, pos) => updateState({
          width: parseInt(ref.style.width),
          height: parseInt(ref.style.height),
          x: pos.x,
          y: pos.y,
        })}
        enableResizing={!state.minimized}
        className={styles.floatingWindow}
      >
        <div className={styles.titleBar}>
          <span className={styles.titleText}>{title}</span>
          <div className={styles.titleActions}>
            <button
              type="button"
              className={styles.titleBtn}
              onClick={() => updateState({ minimized: !state.minimized })}
              title={state.minimized ? 'Restore' : 'Minimize'}
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

        {!state.minimized && (
          <div className={styles.windowBody}>
            {children}
          </div>
        )}
      </Rnd>
    </div>
  );

  return createPortal(content, root);
}
