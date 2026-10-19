import { afterEach, expect, it, vi } from 'vitest';
import { CommandTracking, MUTATION_MESSAGES, PREVIEW_MESSAGES } from '../commandTracking';
import { createMessage, MessageType } from '../message';

afterEach(() => vi.useRealTimers());

it('tracks every mutation policy without treating previews and queries as durable commands', () => {
  vi.useFakeTimers();
  const tracker = new CommandTracking();
  const uncertain = vi.fn();
  for (const type of MUTATION_MESSAGES) tracker.track(createMessage(type, { table_id: 't1' }), 't1', uncertain);
  for (const type of PREVIEW_MESSAGES) tracker.track(createMessage(type, { table_id: 't1' }), 't1', uncertain);
  tracker.track(createMessage(MessageType.TABLE_REQUEST, { table_id: 't1' }), 't1', uncertain);
  expect(tracker.watermark('t1')).toHaveLength(MUTATION_MESSAGES.size);
  tracker.dispose();
  vi.advanceTimersByTime(20_000);
  expect(uncertain).not.toHaveBeenCalled();
});

it('a fenced snapshot resolves earlier uncertainty and retains newer commands', () => {
  vi.useFakeTimers();
  const tracker = new CommandTracking();
  const uncertain = vi.fn();
  const first = createMessage(MessageType.SPRITE_MOVE, { table_id: 't1' });
  tracker.track(first, 't1', uncertain);
  const watermark = tracker.watermark('t1');
  const later = createMessage(MessageType.WALL_UPDATE, { table_id: 't1' });
  tracker.track(later, 't1', uncertain);
  tracker.resolveSnapshot(watermark);
  expect(tracker.watermark('t1')).toEqual([later.message_id]);
  expect(tracker.settle({ ...createMessage(MessageType.ERROR), causation_id: later.message_id })).toEqual(later);
  vi.advanceTimersByTime(20_000);
  expect(uncertain).not.toHaveBeenCalled();
});
