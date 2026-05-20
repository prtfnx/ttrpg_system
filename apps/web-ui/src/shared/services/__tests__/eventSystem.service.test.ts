import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventSystem } from '../eventSystem.service';

describe('EventSystem', () => {
  let es: EventSystem;

  beforeEach(() => {
    es = new EventSystem();
  });

  describe('subscribe + emit', () => {
    it('calls handler on emit', () => {
      const handler = vi.fn();
      es.subscribe('k1', 'test', handler);
      es.emit('test', { value: 42 });
      expect(handler).toHaveBeenCalledWith({ value: 42 });
    });

    it('multiple handlers all called', () => {
      const h1 = vi.fn(), h2 = vi.fn();
      es.subscribe('k1', 'evt', h1);
      es.subscribe('k2', 'evt', h2);
      es.emit('evt', 'data');
      expect(h1).toHaveBeenCalledWith('data');
      expect(h2).toHaveBeenCalledWith('data');
    });

    it('does nothing when no subscribers', () => {
      expect(() => es.emit('nonexistent', null)).not.toThrow();
    });

    it('errors in handlers are caught and not rethrown', () => {
      es.subscribe('k1', 'boom', () => { throw new Error('oops'); });
      expect(() => es.emit('boom', null)).not.toThrow();
    });
  });

  describe('subscribeOnce', () => {
    it('fires only once', () => {
      const handler = vi.fn();
      es.subscribeOnce('k1', 'once', handler);
      es.emit('once', 1);
      es.emit('once', 2);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('removes subscription after first fire', () => {
      es.subscribeOnce('k1', 'once', vi.fn());
      es.emit('once', 1);
      expect(es.hasSubscriptions('once')).toBe(false);
    });
  });

  describe('unsubscribe', () => {
    it('removes specific event subscription by key', () => {
      const handler = vi.fn();
      es.subscribe('k1', 'ev', handler);
      es.unsubscribe('k1', 'ev');
      es.emit('ev', null);
      expect(handler).not.toHaveBeenCalled();
    });

    it('removes all subscriptions for a key when no event specified', () => {
      const h1 = vi.fn(), h2 = vi.fn();
      es.subscribe('k1', 'ev1', h1);
      es.subscribe('k1', 'ev2', h2);
      es.unsubscribe('k1');
      es.emit('ev1', null);
      es.emit('ev2', null);
      expect(h1).not.toHaveBeenCalled();
      expect(h2).not.toHaveBeenCalled();
    });

    it('does not remove other key subscriptions', () => {
      const h1 = vi.fn(), h2 = vi.fn();
      es.subscribe('k1', 'ev', h1);
      es.subscribe('k2', 'ev', h2);
      es.unsubscribe('k1', 'ev');
      es.emit('ev', null);
      expect(h1).not.toHaveBeenCalled();
      expect(h2).toHaveBeenCalled();
    });

    it('is a no-op for unknown key', () => {
      expect(() => es.unsubscribe('ghost', 'ev')).not.toThrow();
    });
  });

  describe('getSubscriptions', () => {
    it('returns empty record initially', () => {
      expect(es.getSubscriptions()).toEqual({});
    });

    it('shows counts per event', () => {
      es.subscribe('k1', 'a', vi.fn());
      es.subscribe('k2', 'a', vi.fn());
      es.subscribe('k3', 'b', vi.fn());
      const subs = es.getSubscriptions();
      expect(subs.a).toBe(2);
      expect(subs.b).toBe(1);
    });
  });

  describe('clearAllSubscriptions', () => {
    it('removes all handlers', () => {
      const handler = vi.fn();
      es.subscribe('k1', 'ev', handler);
      es.clearAllSubscriptions();
      es.emit('ev', null);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('hasSubscriptions + getSubscriptionCount', () => {
    it('returns false before subscription', () => {
      expect(es.hasSubscriptions('ev')).toBe(false);
    });

    it('returns true after subscription', () => {
      es.subscribe('k1', 'ev', vi.fn());
      expect(es.hasSubscriptions('ev')).toBe(true);
    });

    it('getSubscriptionCount returns correct count', () => {
      expect(es.getSubscriptionCount('ev')).toBe(0);
      es.subscribe('k1', 'ev', vi.fn());
      es.subscribe('k2', 'ev', vi.fn());
      expect(es.getSubscriptionCount('ev')).toBe(2);
    });
  });
});
