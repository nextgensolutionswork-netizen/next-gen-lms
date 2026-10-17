import { NextRequest, NextResponse } from 'next/server';
import { subscribeRealtimeTopic } from '@/lib/services/realtime-service';
import { RealtimeMessageEvent } from '@/types';
import { authenticateApiRequest } from '@/lib/auth/server-session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  // 1. Session authentication
  const auth = await authenticateApiRequest(request);
  if (auth.errorResponse) {
    return auth.errorResponse;
  }
  const user = auth.user;

  const { searchParams } = new URL(request.url);
  const rawTopics = searchParams.get('topics') || searchParams.get('topic') || '*';
  const requestedTopics = rawTopics
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  // 2. Topic Scoping Enforcement
  const isAdmin = ['super_admin', 'admin'].includes(user.role);
  if (!isAdmin) {
    if (requestedTopics.includes('*')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Forbidden: Wildcard realtime topic subscriptions are restricted to administrators.',
        },
        { status: 403 }
      );
    }

    const sensitivePrefixes = ['audit:', 'system:', 'finance:', 'expenses:'];
    const hasSensitive = requestedTopics.some((t) => sensitivePrefixes.some((p) => t.startsWith(p)));
    if (hasSensitive && user.role !== 'accountant') {
      return NextResponse.json(
        {
          success: false,
          error: 'Forbidden: Insufficient privileges to subscribe to restricted realtime topics.',
        },
        { status: 403 }
      );
    }
  }

  const topics = requestedTopics;
  const encoder = new TextEncoder();

  let unsubs: Array<() => void> = [];
  let heartbeatTimer: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // 1. Initial connection handshake
      const handshakePayload = JSON.stringify({
        connected: true,
        topics,
        user_id: user.id,
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

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
