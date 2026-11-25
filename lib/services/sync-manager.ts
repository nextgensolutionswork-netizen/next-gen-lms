/**
 * TASK-02: Client-Side Synchronization Manager
 * Orchestrates invalidation signals, connection recovery, window focus refresh,
 * request generation tracking (to discard stale responses), and event debouncing.
 */

import { subscribeRealtimeTopic } from './realtime-service';
import { SyncTopic, SyncSignalPayload, isUserAuthorizedForTopic } from './sync-events';
import { UserRole } from '@/types';

type RevalidationCallback = () => void | Promise<void>;

interface InvalidatorRegistration {
  id: string;
  topic: string;
  callback: RevalidationCallback;
}

class SyncManager {
  private invalidators: Map<string, InvalidatorRegistration[]> = new Map();
  private debouncedTimers: Map<string, NodeJS.Timeout> = new Map();
  private requestGenerations: Map<string, number> = new Map();
  private channelUnsubs: Map<string, () => void> = new Map();
  private isOnlineState: boolean = true;
  private isReconnectingState: boolean = false;
  private listenersAttached: boolean = false;
  private currentRole?: UserRole;

  constructor() {
    if (typeof window !== 'undefined') {
      this.isOnlineState = navigator.onLine;
      this.attachWindowListeners();
    }
  }

  /**
   * Set active authenticated role context.
   */
  public setRole(role?: UserRole): void {
    this.currentRole = role;
  }

  /**
   * Get current connection state.
   */
  public isOnline(): boolean {
    return this.isOnlineState;
  }

  public isReconnecting(): boolean {
    return this.isReconnectingState;
  }

  /**
   * Attach window focus and online/offline event listeners.
   */
  private attachWindowListeners(): void {
    if (this.listenersAttached || typeof window === 'undefined') return;
    this.listenersAttached = true;

    window.addEventListener('online', () => {
      this.isOnlineState = true;
      this.isReconnectingState = true;
      // Re-validate all registered active views after connection recovery
      setTimeout(() => {
        this.isReconnectingState = false;
        this.revalidateAll();
      }, 500);
    });

    window.addEventListener('offline', () => {
      this.isOnlineState = false;
      this.isReconnectingState = false;
    });

    window.addEventListener('focus', () => {
      if (this.isOnlineState) {
        this.revalidateAll();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.isOnlineState) {
        this.revalidateAll();
      }
    });
  }

  /**
   * Get a new request generation token for a domain.
   * Any response returning with an older token than current generation will be ignored.
   */
  public nextGeneration(domain: string): number {
    const next = (this.requestGenerations.get(domain) || 0) + 1;
    this.requestGenerations.set(domain, next);
    return next;
  }

  /**
   * Check if a generation token is still the latest.
   */
  public isLatestGeneration(domain: string, generation: number): boolean {
    return (this.requestGenerations.get(domain) || 0) === generation;
  }

  /**
   * Register a revalidation callback for a specific topic or domain.
   * Returns an unsubscribe function.
   */
  public register(topic: SyncTopic | string, callback: RevalidationCallback): () => void {
    const id = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const currentList = this.invalidators.get(topic) || [];
    currentList.push({ id, topic, callback });
    this.invalidators.set(topic, currentList);

    // If first subscriber for this topic and role authorized, connect realtime channel
    if (!this.channelUnsubs.has(topic)) {
      if (!this.currentRole || isUserAuthorizedForTopic(this.currentRole, topic)) {
        const unsub = subscribeRealtimeTopic(topic, (_event) => {
          this.triggerInvalidation(topic);
        });
        this.channelUnsubs.set(topic, unsub);
      }
    }

    return () => {
      const list = this.invalidators.get(topic) || [];
      const updated = list.filter((item) => item.id !== id);
      if (updated.length > 0) {
        this.invalidators.set(topic, updated);
      } else {
        this.invalidators.delete(topic);
        const channelUnsub = this.channelUnsubs.get(topic);
        if (channelUnsub) {
          channelUnsub();
          this.channelUnsubs.delete(topic);
        }
      }
    };
  }

  /**
   * Trigger debounced revalidation for a topic.
   * Coalesces rapid bursts into a single execution after 250ms.
   */
  public triggerInvalidation(topic: SyncTopic | string, debounceMs = 250): void {
    if (this.debouncedTimers.has(topic)) {
      clearTimeout(this.debouncedTimers.get(topic)!);
    }

    const timer = setTimeout(() => {
      this.debouncedTimers.delete(topic);
      const callbacks = this.invalidators.get(topic) || [];
      callbacks.forEach((reg) => {
        try {
          void reg.callback();
        } catch (err) {
          console.error(`[SyncManager] Invalidator error on topic "${topic}":`, err);
        }
      });
    }, debounceMs);

    this.debouncedTimers.set(topic, timer);
  }

  /**
   * Revalidate all registered active domains (e.g. after reconnection or focus).
   */
  public revalidateAll(): void {
    for (const topic of this.invalidators.keys()) {
      this.triggerInvalidation(topic, 50);
    }
  }

  /**
   * Reset all invalidators, timers, and subscriptions (e.g. on user logout).
   */
  public reset(): void {
    // Clear all debounced timers
    for (const timer of this.debouncedTimers.values()) {
      clearTimeout(timer);
    }
    this.debouncedTimers.clear();

    // Unsubscribe all realtime channels
    for (const unsub of this.channelUnsubs.values()) {
      try {
        unsub();
      } catch {}
    }
    this.channelUnsubs.clear();
    this.invalidators.clear();
    this.requestGenerations.clear();
    this.currentRole = undefined;
  }
}

export const syncManager = new SyncManager();
