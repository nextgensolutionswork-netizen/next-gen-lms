'use client';

import * as React from 'react';
import { RealtimeMessageEvent } from '@/types';

export interface UseRealtimeOptions {
  topics: string | string[];
  onEvent?: (event: RealtimeMessageEvent) => void;
  enabled?: boolean;
}

export function useRealtime({ topics, onEvent, enabled = true }: UseRealtimeOptions) {
  const [isConnected, setIsConnected] = React.useState(false);
  const [lastEvent, setLastEvent] = React.useState<RealtimeMessageEvent | null>(null);

  const topicString = Array.isArray(topics) ? topics.join(',') : topics;
  const onEventRef = React.useRef(onEvent);
  onEventRef.current = onEvent;

  React.useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    function connect() {
      try {
        const url = `/api/realtime/stream?topics=${encodeURIComponent(topicString)}`;
        eventSource = new EventSource(url);

        eventSource.onopen = () => {
          setIsConnected(true);
        };

        eventSource.onmessage = (e) => {
          try {
            const data: RealtimeMessageEvent = JSON.parse(e.data);
            setLastEvent(data);
            if (onEventRef.current) {
              onEventRef.current(data);
            }
          } catch {
            // Heartbeats or raw comments
          }
        };

        // Listen to custom named events like 'doubt_reply', 'notification_received'
        ['doubt_created', 'doubt_reply', 'doubt_resolved', 'doubt_assigned', 'notification_received'].forEach(
          (eventName) => {
            eventSource?.addEventListener(eventName, (e: any) => {
              try {
                const data: RealtimeMessageEvent = JSON.parse(e.data);
                setLastEvent(data);
                if (onEventRef.current) {
                  onEventRef.current(data);
                }
              } catch (err) {
                console.error(`Error parsing ${eventName} event:`, err);
              }
            });
          }
        );

        eventSource.onerror = () => {
          setIsConnected(false);
          eventSource?.close();
          // Reconnect with 3s backoff
          reconnectTimeout = setTimeout(() => {
            connect();
          }, 3000);
        };
      } catch (err) {
        console.error('Failed to initialize EventSource:', err);
      }
    }

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (eventSource) {
        eventSource.close();
      }
      setIsConnected(false);
    };
  }, [topicString, enabled]);

  return { isConnected, lastEvent };
}
