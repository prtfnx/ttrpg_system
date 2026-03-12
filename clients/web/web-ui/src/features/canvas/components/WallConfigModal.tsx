import { useGameStore, type WallData } from '@/store';
import { useProtocol } from '@lib/api';
import { createMessage, MessageType } from '@lib/websocket';
import React, { useCallback, useEffect, useState } from 'react';

interface WallDraft extends Omit<WallData, 'wall_id' | 'table_id'> {
  x1: number; y1: number; x2: number; y2: number;
}

const DEFAULTS: WallDraft = {
  x1: 0, y1: 0, x2: 0, y2: 0,
  wall_type: 'normal',
  blocks_movement: true,
  blocks_light: true,
  blocks_sight: true,
  blocks_sound: false,
  is_door: false,
  door_state: 'closed',
  is_secret: false,
  direction: 'both',
};

export const WallConfigModal: React.FC = () => {
  const { protocol } = useProtocol();
  const tableId = useGameStore(s => s.activeTableId);
  const addWall = useGameStore(s => s.addWall);

  const [draft, setDraft] = useState<WallDraft | null>(null);

  // Listen for wallDrawn DOM event from Rust
  useEffect(() => {
    const handler = (e: Event) => {
      const { x1, y1, x2, y2 } = (e as CustomEvent).detail;
      setDraft({ ...DEFAULTS, x1, y1, x2, y2 });
    };
    window.addEventListener('wallDrawn', handler);
    return () => window.removeEventListener('wallDrawn', handler);
  }, []);

  const close = () => setDraft(null);

  const set = useCallback(<K extends keyof WallDraft>(key: K, value: WallDraft[K]) => {
    setDraft(prev => prev ? { ...prev, [key]: value } : prev);
  }, []);

  const submit = () => {
    if (!draft || !tableId || !protocol) return;

    const wall: WallData = {
      wall_id: `wall_${Date.now()}`,
      table_id: tableId,
      ...draft,
    };

    // Optimistic local update
    addWall(wall);

    // Sync to WASM
    if (window.rustRenderManager) {
      (window.rustRenderManager as any).add_wall(JSON.stringify(wall));
    }

    // Send to server — server expects { table_id, wall_data: {...} }
    protocol.sendMessage(createMessage(MessageType.WALL_CREATE, { table_id: tableId, wall_data: wall as unknown as Record<string, unknown> }));
    close();
  };

  if (!draft) return null;

  return (
    <div style={overlay}>
      <div style={modal}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>New Wall Segment</h3>

        <label style={row}>
          Type
          <select value={draft.wall_type} onChange={e => set('wall_type', e.target.value as WallDraft['wall_type'])}>
            <option value="normal">Normal</option>
            <option value="terrain">Terrain</option>
            <option value="invisible">Invisible</option>
            <option value="ethereal">Ethereal</option>
            <option value="window">Window</option>
          </select>
        </label>

        <label style={row}>
          Direction
          <select value={draft.direction} onChange={e => set('direction', e.target.value as WallDraft['direction'])}>
            <option value="both">Both sides</option>
            <option value="left">Left only</option>
            <option value="right">Right only</option>
          </select>
        </label>

        <fieldset style={{ border: '1px solid #444', padding: '8px', marginBottom: 8, borderRadius: 4 }}>
          <legend style={{ color: '#aaa', fontSize: 12 }}>Blocks</legend>
          {(['blocks_movement', 'blocks_light', 'blocks_sight', 'blocks_sound'] as const).map(k => (
            <label key={k} style={{ ...row, marginBottom: 4 }}>
              <input type="checkbox" checked={draft[k]} onChange={e => set(k, e.target.checked)} />
              {k.replace('blocks_', '').replace('_', ' ')}
            </label>
          ))}
        </fieldset>

        <label style={row}>
          <input type="checkbox" checked={draft.is_door} onChange={e => set('is_door', e.target.checked)} />
          Is door
        </label>

        {draft.is_door && (
          <label style={row}>
            Door state
            <select value={draft.door_state} onChange={e => set('door_state', e.target.value as WallDraft['door_state'])}>
              <option value="closed">Closed</option>
              <option value="open">Open</option>
              <option value="locked">Locked</option>
            </select>
          </label>
        )}

        <label style={row}>
          <input type="checkbox" checked={draft.is_secret} onChange={e => set('is_secret', e.target.checked)} />
          Secret
        </label>

        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
          <button onClick={close} style={btnSecondary}>Cancel</button>
          <button onClick={submit} style={btnPrimary}>Place Wall</button>
        </div>
      </div>
    </div>
  );
};

// Minimal inline styles — no CSS module needed for a simple modal
const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
};
const modal: React.CSSProperties = {
  background: '#1e1e2e', color: '#cdd6f4', border: '1px solid #45475a',
  borderRadius: 8, padding: 20, minWidth: 280, fontSize: 13,
};
const row: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
  justifyContent: 'space-between',
};
const btnPrimary: React.CSSProperties = {
  background: '#89b4fa', color: '#1e1e2e', border: 'none', borderRadius: 4,
  padding: '6px 14px', cursor: 'pointer', fontWeight: 600,
};
const btnSecondary: React.CSSProperties = {
  background: '#45475a', color: '#cdd6f4', border: 'none', borderRadius: 4,
  padding: '6px 14px', cursor: 'pointer',
};
