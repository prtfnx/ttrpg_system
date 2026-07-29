import { useGameStore } from '@/store';
import { useProtocol } from '@lib/api';
import { useRenderEngine } from '@lib/wasm/runtime';
import { createMessage, MessageType } from '@lib/websocket';
import React, { useCallback, useEffect, useId, useState } from 'react';
import styles from './CanvasConfigModal.module.css';

interface Point { x: number; y: number; }

interface PolygonDraft {
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

  const [draft, setDraft] = useState<PolygonDraft | null>(null);

  // Listen for polygonCreated DOM event from Rust
  useEffect(() => {
    const handler = (e: Event) => {
      const { vertices } = (e as CustomEvent<{ vertices: Point[] }>).detail;
      setDraft({ vertices, layer: DEFAULT_LAYER, label: '' });
    };
    window.addEventListener('polygonCreated', handler);
    return () => window.removeEventListener('polygonCreated', handler);
  }, []);

  const close = useCallback(() => {
    setDraft(null);
  }, []);

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

  const submit = useCallback(() => {
    if (!draft || !tableId || !protocol) return;

    const layer = draft.layer;
    // Generate ID once — used for both WASM and server to keep them in sync
    const spriteId = crypto.randomUUID();

    // Compute bounding box for width/height
    const xs = draft.vertices.map(v => v.x);
    const ys = draft.vertices.map(v => v.y);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const maxX = Math.max(...xs), maxY = Math.max(...ys);
    const width = Math.max(maxX - minX, 1);
    const height = Math.max(maxY - minY, 1);

    // Add polygon sprite to WASM render engine with the pre-generated ID
    if (renderEngine) {
      const spriteJson = {
        id: spriteId,
        table_id: tableId,
        world_x: minX,
        world_y: minY,
        width,
        height,
        scale_x: 1.0,
        scale_y: 1.0,
        rotation: 0.0,
        layer,
        texture_id: '',
        tint_color: [1, 1, 1, 1],
        obstacle_type: 'polygon',
        polygon_vertices: draft.vertices.map(v => [v.x, v.y]),
        controlled_by: [],
      };
      renderEngine.add_sprite_to_layer(layer, spriteJson);
    }

    // Send sprite_create to server with the same ID
    const spriteData = {
      sprite_id: spriteId,
      table_id: tableId,
      layer,
      obstacle_type: 'polygon',
      polygon_vertices: draft.vertices,
      coord_x: minX,
      coord_y: minY,
      label: draft.label,
    };
    protocol.sendMessage(createMessage(MessageType.SPRITE_CREATE, { table_id: tableId, sprite_data: spriteData } as unknown as Record<string, unknown>));
    setDraft(null);
  }, [draft, renderEngine, tableId, protocol]);

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
          <select value={draft.layer} onChange={e => setDraft(prev => prev ? { ...prev, layer: e.target.value } : prev)}>
            <option value="obstacles">Obstacles</option>
            <option value="map">Map</option>
          </select>
        </label>

        <label className={styles.row}>
          Label (optional)
          <input
            type="text"
            value={draft.label}
            onChange={e => setDraft(prev => prev ? { ...prev, label: e.target.value } : prev)}
            placeholder="e.g. Wall, Pillar"
            className={styles.textInput}
          />
        </label>

        <div className={styles.actions}>
          <button onClick={close} className={styles.btnSecondary}>Cancel</button>
          <button onClick={submit} className={styles.btnPrimary}>Create Obstacle</button>
        </div>
      </div>
    </div>
  );
};
