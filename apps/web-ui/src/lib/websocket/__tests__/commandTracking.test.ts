import { afterEach, expect, it, vi } from 'vitest';
import { CommandTracking, MUTATION_MESSAGES, PREVIEW_MESSAGES } from '../commandTracking';
import { createMessage, MessageType } from '../message';

afterEach(() => vi.useRealTimers());

it('waits for idle receipt progress instead of resyncing a healthy backlog', () => {
  vi.useFakeTimers();
  const tracker = new CommandTracking();
  const uncertain = vi.fn();
  const first = createMessage(MessageType.SPRITE_MOVE, { table_id: 't1' });
  const next = createMessage(MessageType.SPRITE_MOVE, { table_id: 't1' });
  tracker.track(first, 't1', uncertain); tracker.track(next, 't1', uncertain);
  vi.advanceTimersByTime(9000);
  tracker.settle({ ...createMessage(MessageType.SPRITE_RESPONSE), causation_id: first.message_id });
  vi.advanceTimersByTime(9000);
  expect(uncertain).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1000);
  expect(uncertain).toHaveBeenCalledWith('t1');
  tracker.dispose();
});

it('bounds a lost individual receipt even if other commands keep completing', () => {
  vi.useFakeTimers();
  const tracker = new CommandTracking();
  const uncertain = vi.fn();
  tracker.track(createMessage(MessageType.SPRITE_MOVE, { table_id: 't1' }), 't1', uncertain);
  for (let index = 0; index < 11; index++) {
    const command = createMessage(MessageType.SPRITE_MOVE, { table_id: 't1' });
    tracker.track(command, 't1', uncertain);
    vi.advanceTimersByTime(5000);
    tracker.settle({ ...createMessage(MessageType.SPRITE_RESPONSE), causation_id: command.message_id });
  }
  expect(uncertain).not.toHaveBeenCalled();
  vi.advanceTimersByTime(5000);
  expect(uncertain).toHaveBeenCalledWith('t1');
  tracker.dispose();
});

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
