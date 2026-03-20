import { useGameStore } from '@/store';
import { useProtocol } from '@lib/api';
import { createMessage, MessageType } from '@lib/websocket';
import React, { useCallback, useEffect, useState } from 'react';

interface Point { x: number; y: number; }

interface PolygonDraft {
  vertices: Point[];
  layer: string;
  label: string;
}

const DEFAULT_LAYER = 'obstacles';

export const PolygonConfigModal: React.FC = () => {
  const { protocol } = useProtocol();
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
    // Cancel any in-progress polygon in Rust (in case user dismissed via hotkey)
    if (window.rustRenderManager) {
      (window.rustRenderManager as any).cancel_polygon_creation?.();
    }
  }, []);

  const submit = useCallback(() => {
    if (!draft || !tableId || !protocol) return;

    // Flatten vertices to Float32Array for WASM
    const flat = new Float32Array(draft.vertices.flatMap(v => [v.x, v.y]));
    const layer = draft.layer;

    let spriteId = '';
    if (window.rustRenderManager) {
      spriteId = (window.rustRenderManager as any).create_polygon_sprite(flat, layer, tableId) ?? '';
    }

    // Send sprite_create to server — server expects { table_id, sprite_data: {...} }
    const spriteData = {
      sprite_id: spriteId || `polygon_${Date.now()}`,
      table_id: tableId,
      layer,
      obstacle_type: 'polygon',
      polygon_vertices: draft.vertices,
      coord_x: draft.vertices[0]?.x ?? 0,
      coord_y: draft.vertices[0]?.y ?? 0,
      label: draft.label,
    };
    protocol.sendMessage(createMessage(MessageType.SPRITE_CREATE, { table_id: tableId, sprite_data: spriteData } as unknown as Record<string, unknown>));
    setDraft(null);
  }, [draft, tableId, protocol]);

  if (!draft) return null;

  return (
    <div style={overlay}>
      <div style={modal}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>New Polygon Obstacle</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 12 }}>
          {draft.vertices.length} vertices placed
        </p>

        <label style={row}>
          Layer
          <select value={draft.layer} onChange={e => setDraft(prev => prev ? { ...prev, layer: e.target.value } : prev)}>
            <option value="obstacles">Obstacles</option>
            <option value="map">Map</option>
          </select>
        </label>

        <label style={row}>
          Label (optional)
          <input
            type="text"
            value={draft.label}
            onChange={e => setDraft(prev => prev ? { ...prev, label: e.target.value } : prev)}
            placeholder="e.g. Wall, Pillar"
            style={{ flex: 1, background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)', borderRadius: 4, padding: '4px 8px' }}
          />
        </label>

        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
          <button onClick={close} style={btnSecondary}>Cancel</button>
          <button onClick={submit} style={btnPrimary}>Create Obstacle</button>
        </div>
      </div>
    </div>
  );
};

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
};
const modal: React.CSSProperties = {
  background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)',
  borderRadius: 8, padding: 20, minWidth: 280, fontSize: 13,
};
const row: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
  justifyContent: 'space-between',
};
const btnPrimary: React.CSSProperties = {
  background: 'var(--color-primary)', color: 'var(--text-inverse-primary)', border: 'none', borderRadius: 4,
  padding: '6px 14px', cursor: 'pointer', fontWeight: 600,
};
const btnSecondary: React.CSSProperties = {
  background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: 'none', borderRadius: 4,
  padding: '6px 14px', cursor: 'pointer',
};
