import { useGameStore, type WallData } from '@/store';
import { useProtocol } from '@lib/api';
import React, { useCallback, useEffect, useState } from 'react';
import styles from './WallConfigModal.module.css';

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

    // Optimistic local update — addWall also forwards to rustRenderManager
    addWall(wall);
    protocol.createWall(wall as unknown as Record<string, unknown>);
    close();
  };

  if (!draft) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h3>New Wall Segment</h3>

        <label className={styles.row}>
          Type
          <select value={draft.wall_type} onChange={e => set('wall_type', e.target.value as WallDraft['wall_type'])}>
            <option value="normal">Normal</option>
            <option value="terrain">Terrain</option>
            <option value="invisible">Invisible</option>
            <option value="ethereal">Ethereal</option>
            <option value="window">Window</option>
          </select>
        </label>

        <label className={styles.row}>
          Direction
          <select value={draft.direction} onChange={e => set('direction', e.target.value as WallDraft['direction'])}>
            <option value="both">Both sides</option>
            <option value="left">Left only</option>
            <option value="right">Right only</option>
          </select>
        </label>

        <fieldset className={styles.fieldset}>
          <legend>Blocks</legend>
          {(['blocks_movement', 'blocks_light', 'blocks_sight', 'blocks_sound'] as const).map(k => (
            <label key={k} className={styles.row}>
              <input type="checkbox" checked={draft[k]} onChange={e => set(k, e.target.checked)} />
              {k.replace('blocks_', '').replace('_', ' ')}
            </label>
          ))}
        </fieldset>

        <label className={styles.row}>
          <input type="checkbox" checked={draft.is_door} onChange={e => set('is_door', e.target.checked)} />
          Is door
        </label>

        {draft.is_door && (
          <label className={styles.row}>
            Door state
            <select value={draft.door_state} onChange={e => set('door_state', e.target.value as WallDraft['door_state'])}>
              <option value="closed">Closed</option>
              <option value="open">Open</option>
              <option value="locked">Locked</option>
            </select>
          </label>
        )}

        <label className={styles.row}>
          <input type="checkbox" checked={draft.is_secret} onChange={e => set('is_secret', e.target.checked)} />
          Secret
        </label>

        <div className={styles.actions}>
          <button onClick={close} className={styles.btnSecondary}>Cancel</button>
          <button onClick={submit} className={styles.btnPrimary}>Place Wall</button>
        </div>
      </div>
    </div>
  );
};

