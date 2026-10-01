'use client';

import * as React from 'react';
import { RealtimeMessageEvent } from '@/types';
import { createClient } from '@/lib/supabase/client';

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
    let supabaseChannel: any = null;

    // 1. Supabase Realtime Channel: supabase.channel('doubt_messages')
    try {
      const supabase = createClient();
      if (supabase && typeof supabase.channel === 'function') {
        const channel = supabase.channel('doubt_messages');

        channel
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'doubt_messages' },
            (payload: any) => {
              const msg = payload.new;
              const event: RealtimeMessageEvent = {
                id: `sb-msg-${Date.now()}`,
                topic: 'doubts',
                event: 'doubt_reply',
                payload: {
                  doubtId: msg.doubt_id,
                  message: msg,
                },
                timestamp: new Date().toISOString(),
              };
              setLastEvent(event);
              if (onEventRef.current) onEventRef.current(event);
            }
          )
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'student_doubts' },
            (payload: any) => {
              const doubt = payload.new;
              const event: RealtimeMessageEvent = {
                id: `sb-dbt-${Date.now()}`,
                topic: 'doubts',
                event: 'doubt_created',
                payload: doubt,
                timestamp: new Date().toISOString(),
              };
              setLastEvent(event);
              if (onEventRef.current) onEventRef.current(event);
            }
          )
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'student_doubts' },
            (payload: any) => {
              const doubt = payload.new;
              if (doubt.status === 'Resolved') {
                const event: RealtimeMessageEvent = {
                  id: `sb-res-${Date.now()}`,
                  topic: 'doubts',
                  event: 'doubt_resolved',
                  payload: { doubtId: doubt.id },
                  timestamp: new Date().toISOString(),
                };
                setLastEvent(event);
                if (onEventRef.current) onEventRef.current(event);
              }
            }
          )
          .on('broadcast', { event: 'doubt_reply' }, (res: any) => {
            const event: RealtimeMessageEvent = {
              id: `bc-rep-${Date.now()}`,
              topic: 'doubts',
              event: 'doubt_reply',
              payload: res.payload,
              timestamp: new Date().toISOString(),
            };
            setLastEvent(event);
            if (onEventRef.current) onEventRef.current(event);
          })
          .on('broadcast', { event: 'doubt_created' }, (res: any) => {
            const event: RealtimeMessageEvent = {
              id: `bc-crt-${Date.now()}`,
              topic: 'doubts',
              event: 'doubt_created',
              payload: res.payload,
              timestamp: new Date().toISOString(),
            };
            setLastEvent(event);
            if (onEventRef.current) onEventRef.current(event);
          })
          .subscribe((status: string) => {
            if (status === 'SUBSCRIBED') {
              setIsConnected(true);
            }
          });

        supabaseChannel = channel;
      }
    } catch (err) {
      console.warn('Supabase Realtime channel initialization notice:', err);
    }

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
      if (supabaseChannel && typeof supabaseChannel.unsubscribe === 'function') {
        supabaseChannel.unsubscribe();
      }
      setIsConnected(false);
    };
  }, [topicString, enabled]);

  return { isConnected, lastEvent };
}
