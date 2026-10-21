import { expect, it, vi } from 'vitest';
import type { WallData } from '@/store';
import { WallCommandSync } from '../wallCommandSync';
import { createMessage, MessageType } from '../message';

it('reverts denied wall edits and preserves later intent', () => {
  let visible = { wall_id: 'wall', table_id: 'table', x1: 0, y1: 0, x2: 10, y2: 10 } as WallData;
  const sync = new WallCommandSync({ read: () => [visible], active: () => 'table', render: (_id, row) => { visible = row!; } });
  sync.seed();
  const first = createMessage(MessageType.WALL_UPDATE, { table_id: 'table', wall_id: 'wall', updates: { x2: 20 } });
  const next = createMessage(MessageType.WALL_UPDATE, { table_id: 'table', wall_id: 'wall', updates: { y2: 30 } });
  sync.stage(first); sync.stage(next);
  sync.reject(first.message_id!);
  expect(visible).toMatchObject({ x2: 10, y2: 30 });
  sync.reject(next.message_id!);
  expect(visible).toMatchObject({ x2: 10, y2: 10 });
});

it('previews wall creation under a temporary identity and installs only the accepted server identity', () => {
  const render = vi.fn();
  const sync = new WallCommandSync({ read: () => [], active: () => 'table', render });
  const request = createMessage(MessageType.WALL_CREATE, { table_id: 'table', wall_data: { x1: 0, y1: 0, x2: 10, y2: 10 } });
  sync.stage(request);
  expect(render).toHaveBeenLastCalledWith(request.message_id, expect.objectContaining({ x2: 10 }));
  sync.accept({ ...createMessage(MessageType.WALL_DATA, { table_id: 'table', operation: 'create',
    wall: { wall_id: 'server-wall', table_id: 'table', x1: 0, y1: 0, x2: 10, y2: 10 } }), causation_id: request.message_id });
  expect(render).toHaveBeenCalledWith(request.message_id, null);
  expect(render).toHaveBeenLastCalledWith('server-wall', expect.objectContaining({ x2: 10 }));
});

it('replays dependent edits over the canonical identity when a provisional wall is accepted', () => {
  const render = vi.fn();
  const sync = new WallCommandSync({ read: () => [], active: () => 'table', render });
  const create = createMessage(MessageType.WALL_CREATE, { table_id: 'table', wall_data: { x1: 0, y1: 0, x2: 10, y2: 10 } });
  sync.stage(create);
  const edit = createMessage(MessageType.WALL_UPDATE, { table_id: 'table', wall_id: create.message_id, updates: { x2: 30 } });
  expect(sync.stage(edit)).toBe(true);
  sync.accept({ ...createMessage(MessageType.WALL_DATA, { table_id: 'table', operation: 'create', wall: {
    wall_id: 'server-wall', table_id: 'table', x1: 0, y1: 0, x2: 10, y2: 10 } }), causation_id: create.message_id });
  expect(render).toHaveBeenLastCalledWith('server-wall', expect.objectContaining({ x2: 30 }));
  sync.reject(edit.message_id!);
  expect(render).toHaveBeenLastCalledWith('server-wall', expect.objectContaining({ x2: 10 }));
});
