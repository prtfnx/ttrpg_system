/**
 * Event System Service
 * Production-quality event system with type safety and error handling
 */

export type EventHandler<T = any> = (data: T) => void;

export interface EventSubscription {
  key: string;
  event: string;
  handler: EventHandler;
  once: boolean;
}

/**
 * Event System Base Class
 * Provides event emission, subscription, and management functionality
 */
export class EventSystem {
  private eventHandlers: Map<string, EventSubscription[]> = new Map();

  /**
   * Subscribe to an event
   */
  subscribe<T = any>(key: string, event: string, handler: EventHandler<T>, once = false): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }

    const subscription: EventSubscription = {
      key,
      event,
      handler,
      once
    };

    this.eventHandlers.get(event)!.push(subscription);
  }

  /**
   * Subscribe to an event that only fires once
   */
  subscribeOnce<T = any>(key: string, event: string, handler: EventHandler<T>): void {
    this.subscribe(key, event, handler, true);
  }

  /**
   * Unsubscribe from an event by key
   */
  unsubscribe(key: string, event?: string): void {
    if (event) {
      const handlers = this.eventHandlers.get(event);
      if (handlers) {
        const filtered = handlers.filter(sub => sub.key !== key);
        if (filtered.length === 0) {
          this.eventHandlers.delete(event);
        } else {
          this.eventHandlers.set(event, filtered);
        }
      }
    } else {
      // Remove all subscriptions for this key
      for (const [eventName, handlers] of this.eventHandlers.entries()) {
        const filtered = handlers.filter(sub => sub.key !== key);
        if (filtered.length === 0) {
          this.eventHandlers.delete(eventName);
        } else {
          this.eventHandlers.set(eventName, filtered);
        }
      }
    }
  }

  /**
   * Emit an event
   */
  public emit<T = any>(event: string, data: T): void {
    const handlers = this.eventHandlers.get(event);
    if (!handlers) return;

    const handlersToRemove: EventSubscription[] = [];

    handlers.forEach(subscription => {
      try {
        subscription.handler(data);
        
        // Mark for removal if it's a once-only subscription
        if (subscription.once) {
          handlersToRemove.push(subscription);
        }
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    });

    // Remove once-only handlers
    if (handlersToRemove.length > 0) {
      const remaining = handlers.filter(sub => !handlersToRemove.includes(sub));
      if (remaining.length === 0) {
        this.eventHandlers.delete(event);
      } else {
        this.eventHandlers.set(event, remaining);
      }
    }
  }

  /**
   * Get all active event subscriptions
   */
  getSubscriptions(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [event, handlers] of this.eventHandlers.entries()) {
      result[event] = handlers.length;
    }
    return result;
  }

  /**
   * Clear all event subscriptions
   */
  clearAllSubscriptions(): void {
    this.eventHandlers.clear();
  }

  /**
   * Check if there are any subscriptions for an event
   */
  hasSubscriptions(event: string): boolean {
    const handlers = this.eventHandlers.get(event);
    return handlers ? handlers.length > 0 : false;
  }

  /**
   * Get subscription count for an event
   */
  getSubscriptionCount(event: string): number {
    const handlers = this.eventHandlers.get(event);
    return handlers ? handlers.length : 0;
  }
}

export default EventSystem;