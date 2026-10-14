import { useGameStore } from '@/store';
import { isDM } from '@features/session/types/roles';
import { useProtocol } from '@lib/api';
import { useRenderEngine } from '@lib/wasm/runtime';
import { createMessage, MessageType } from '@lib/websocket';
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { sendConfirmedSpriteCommand } from '../services/spriteCommands';
import styles from './CanvasConfigModal.module.css';

interface Point { x: number; y: number; }

interface PolygonDraft {
  id: string;
  tableId: string;
  vertices: Point[];
  layer: string;
  label: string;
}

const DEFAULT_LAYER = 'obstacles';

export const PolygonConfigModal: React.FC = () => {
  const titleId = useId();
  const { protocol } = useProtocol();
  const renderEngine = useRenderEngine();
  const tableId = useGameStore(s => s.activeTableId);
  const actorId = useGameStore(s => s.userId);
  const role = useGameStore(s => s.sessionRole);

  const [draft, setDraft] = useState<PolygonDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);

  const close = useCallback(() => {
    renderEngine?.cancel_current_operation();
    pending.current?.abort();
    pending.current = null;
    setDraft(null);
    setSaving(false);
    setError(null);
  }, [renderEngine]);

  useEffect(() => {
    close();
    return () => {
      pending.current?.abort();
      renderEngine?.cancel_current_operation();
    };
  }, [tableId, actorId, role, protocol, renderEngine, close]);

  // Listen for polygonCreated DOM event from Rust
  useEffect(() => {
    const handler = (e: Event) => {
      if (!tableId || !isDM(role) || draft || pending.current) return;
      const vertices = (e as CustomEvent<{ vertices?: Point[] }>).detail?.vertices;
      if (!Array.isArray(vertices) || vertices.length < 3 || vertices.length > 1000
        || vertices.some(v => !v || !Number.isFinite(v.x) || !Number.isFinite(v.y)
          || Math.abs(v.x) > 1_000_000 || Math.abs(v.y) > 1_000_000)) return;
      setDraft({ id: crypto.randomUUID(), tableId, vertices: vertices.map(v => ({ ...v })), layer: DEFAULT_LAYER, label: '' });
      setError(null);
    };
    window.addEventListener('polygonCreated', handler);
    return () => window.removeEventListener('polygonCreated', handler);
  }, [tableId, role, draft]);

  useEffect(() => {
    if (!draft) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [draft, close]);

  const submit = useCallback(async () => {
    if (!draft || draft.tableId !== tableId || !isDM(role) || !protocol || pending.current) return;

    const layer = draft.layer;

    // Compute bounding box for width/height
    const xs = draft.vertices.map(v => v.x);
    const ys = draft.vertices.map(v => v.y);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const maxX = Math.max(...xs), maxY = Math.max(...ys);
    const width = Math.max(maxX - minX, 1);
    const height = Math.max(maxY - minY, 1);

    const spriteData = {
      sprite_id: draft.id,
      table_id: draft.tableId,
      layer,
      obstacle_type: 'polygon',
      obstacle_data: { vertices: draft.vertices.map(v => [v.x, v.y]) },
      x: minX, y: minY, width, height,
      name: draft.label.trim() || 'Polygon Obstacle',
      texture_path: '',
    };
    const abort = new AbortController();
    pending.current = abort;
    setSaving(true);
    setError(null);
    try {
      await sendConfirmedSpriteCommand(protocol, createMessage(MessageType.SPRITE_CREATE,
        { table_id: draft.tableId, sprite_data: spriteData }, 2), abort.signal);
      if (!abort.signal.aborted && pending.current === abort) close();
    } catch (cause) {
      if (abort.signal.aborted || pending.current !== abort) return;
      pending.current = null;
      setSaving(false);
      setError(cause instanceof Error ? cause.message : 'Polygon could not be saved.');
    }
  }, [draft, tableId, role, protocol, close]);

  if (!draft) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h3 className={styles.title} id={titleId}>New Polygon Obstacle</h3>
        <p className={styles.description}>
          {draft.vertices.length} vertices placed
        </p>

        <label className={styles.row}>
          Layer
          <select disabled={saving} value={draft.layer} onChange={e => setDraft(prev => prev ? { ...prev, layer: e.target.value } : prev)}>
            <option value="obstacles">Obstacles</option>
            <option value="map">Map</option>
          </select>
        </label>

        <label className={styles.row}>
          Label (optional)
          <input
            type="text"
            disabled={saving}
            maxLength={100}
            value={draft.label}
            onChange={e => setDraft(prev => prev ? { ...prev, label: e.target.value } : prev)}
            placeholder="e.g. Wall, Pillar"
            className={styles.textInput}
          />
        </label>

        {error && <p role="alert">{error}</p>}
        <div className={styles.actions}>
          <button onClick={close} className={styles.btnSecondary}>Cancel</button>
          <button onClick={() => void submit()} disabled={saving || !protocol} className={styles.btnPrimary}>{saving ? 'Saving…' : 'Create Obstacle'}</button>
        </div>
      </div>
    </div>
  );
};
