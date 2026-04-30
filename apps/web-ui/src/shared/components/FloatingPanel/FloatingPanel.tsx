import type React from 'react';
import { useRef, useState } from 'react';
import Draggable from 'react-draggable';
import { ResizableBox } from 'react-resizable';
import 'react-resizable/css/styles.css';
import styles from './FloatingPanel.module.css';

interface Props {
  id: string;
  title: string;
  defaultPos?: { x: number; y: number };
  defaultSize?: { width: number; height: number };
  minWidth?: number;
  minHeight?: number;
  onClose: () => void;
  children: React.ReactNode;
}

type Pos = { x: number; y: number };
type Size = { width: number; height: number };

const HEADER_H = 32;

const loadPos = (id: string): Pos | null => { try { return JSON.parse(localStorage.getItem(`fp-pos-${id}`) ?? 'null'); } catch { return null; } };
const savePos = (id: string, p: Pos) => localStorage.setItem(`fp-pos-${id}`, JSON.stringify(p));
const loadSize = (id: string): Size | null => { try { return JSON.parse(localStorage.getItem(`fp-size-${id}`) ?? 'null'); } catch { return null; } };
const saveSize = (id: string, s: Size) => localStorage.setItem(`fp-size-${id}`, JSON.stringify(s));

export function FloatingPanel({ id, title, defaultPos = { x: 80, y: 80 }, defaultSize = { width: 280, height: 400 }, minWidth = 240, minHeight = 200, onClose, children }: Props) {
  const [pos, setPos] = useState<Pos>(() => loadPos(id) ?? defaultPos);
  const [size, setSize] = useState<Size>(() => loadSize(id) ?? defaultSize);
  const nodeRef = useRef<HTMLDivElement>(null);

  return (
    <Draggable
      nodeRef={nodeRef as React.RefObject<HTMLElement>}
      handle={`.${styles.header}`}
      position={pos}
      onStop={(_, d) => { const p = { x: d.x, y: d.y }; setPos(p); savePos(id, p); }}
    >
      <div ref={nodeRef} className={styles.panel} style={{ width: size.width, height: size.height, position: 'fixed' }}>
        <div className={styles.header}>
          <span className={styles.title}>{title}</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <ResizableBox
          width={size.width}
          height={size.height - HEADER_H}
          minConstraints={[minWidth, minHeight - HEADER_H]}
          onResizeStop={(_, { size: s }) => {
            const ns = { width: s.width, height: s.height + HEADER_H };
            setSize(ns);
            saveSize(id, ns);
          }}
        >
          <div className={styles.body}>{children}</div>
        </ResizableBox>
      </div>
    </Draggable>
  );
}
