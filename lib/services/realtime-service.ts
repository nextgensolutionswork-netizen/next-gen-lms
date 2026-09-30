import { RealtimeMessageEvent } from '@/types';
import { isLiveSupabaseEnabled, getDb } from '@/lib/supabase/db';

type RealtimeListener = (event: RealtimeMessageEvent) => void;

class RealtimeHub {
  private subscribers: Map<string, Set<RealtimeListener>> = new Map();

  /**
   * Subscribe a listener function to a given topic.
   * Special topic '*' listens to all broadcasts.
   * Returns an unsubscribe function.
   */
  public subscribe(topic: string, listener: RealtimeListener): () => void {
    if (!this.subscribers.has(topic)) {
      this.subscribers.set(topic, new Set());
    }
    this.subscribers.get(topic)!.add(listener);

    return () => {
      const topicSet = this.subscribers.get(topic);
      if (topicSet) {
        topicSet.delete(listener);
        if (topicSet.size === 0) {
          this.subscribers.delete(topic);
        }
      }
    };
  }

  /**
   * Broadcast an event to all subscribers of a specific topic and wildcard listeners.
   * If Supabase is connected and live, also broadcasts via Supabase Realtime channels.
   */
  public publish(topic: string, eventName: string, payload: any): RealtimeMessageEvent {
    const event: RealtimeMessageEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      topic,
      event: eventName,
      payload,
      timestamp: new Date().toISOString(),
    };

    // 1. Direct in-memory subscribers for this topic
    const topicSubscribers = this.subscribers.get(topic);
    if (topicSubscribers) {
      topicSubscribers.forEach((listener) => {
        try {
          listener(event);
        } catch (err) {
          console.error(`Error notifying realtime listener for topic "${topic}":`, err);
        }
      });
    }

    // 2. Global wildcard subscribers ('*')
    const wildcardSubscribers = this.subscribers.get('*');
    if (wildcardSubscribers) {
      wildcardSubscribers.forEach((listener) => {
        try {
          listener(event);
        } catch (err) {
          console.error('Error notifying wildcard realtime listener:', err);
        }
      });
    }

    // 3. Supabase Realtime Channel Broadcast if configured
    if (isLiveSupabaseEnabled()) {
      try {
        const client = getDb();
        if (client) {
          const sanitizedChannelName = topic.replace(/[^a-zA-Z0-9_-]/g, '_');
          client.channel(sanitizedChannelName).send({
            type: 'broadcast',
            event: eventName,
            payload: event,
          }).catch((err: any) => {
            console.warn(`Supabase channel broadcast error for ${topic}:`, err?.message || err);
          });
        }
      } catch (err) {
        // Suppress realtime channel network drops in dev/sandbox
      }
    }

    return event;
  }

  /**
   * Count how many active listeners are registered for a topic or total.
   */
  public getSubscriberCount(topic?: string): number {
    if (topic) {
      return this.subscribers.get(topic)?.size || 0;
    }
    let total = 0;
    for (const set of this.subscribers.values()) {
      total += set.size;
    }
    return total;
  }

  /**
   * Clear all subscribers (useful for test resets).
   */
  public reset(): void {
    this.subscribers.clear();
  }
}

// Global Singleton
export const realtimeHub = new RealtimeHub();

export function publishRealtimeEvent(topic: string, eventName: string, payload: any): RealtimeMessageEvent {
  return realtimeHub.publish(topic, eventName, payload);
}

export function subscribeRealtimeTopic(topic: string, listener: RealtimeListener): () => void {
  return realtimeHub.subscribe(topic, listener);
}
