import { NextRequest } from 'next/server';
import { subscribeRealtimeTopic } from '@/lib/services/realtime-service';
import { RealtimeMessageEvent } from '@/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawTopics = searchParams.get('topics') || searchParams.get('topic') || '*';
  const topics = rawTopics
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const encoder = new TextEncoder();

  let unsubs: Array<() => void> = [];
  let heartbeatTimer: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // 1. Initial connection handshake
      const handshakePayload = JSON.stringify({
        connected: true,
        topics,
        timestamp: new Date().toISOString(),
      });
      controller.enqueue(encoder.encode(`event: connected\ndata: ${handshakePayload}\n\n`));

      // 2. Subscribe to each requested topic
      topics.forEach((topic) => {
        const unsub = subscribeRealtimeTopic(topic, (event: RealtimeMessageEvent) => {
          try {
            const chunk = `id: ${event.id}\nevent: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(encoder.encode(chunk));
          } catch (err) {
            console.error('Error streaming realtime event:', err);
          }
        });
        unsubs.push(unsub);
      });

      // 3. Heartbeat ping every 15 seconds to prevent client/proxy timeout
      heartbeatTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          if (heartbeatTimer) clearInterval(heartbeatTimer);
        }
      }, 15000);
    },
    cancel() {
      // Clean up subscribers and interval
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      unsubs.forEach((unsub) => unsub());
      unsubs = [];
    },
  });

  // Also listen to client abort signal
  request.signal.addEventListener('abort', () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    unsubs.forEach((unsub) => unsub());
    unsubs = [];
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform, no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable proxy buffering for nginx
    },
  });
}
