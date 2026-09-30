import { NextRequest, NextResponse } from 'next/server';
import { publishRealtimeEvent } from '@/lib/services/realtime-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { topic, event, payload } = body;

    if (!topic || !event) {
      return NextResponse.json(
        { success: false, error: 'topic and event are required parameters' },
        { status: 400 }
      );
    }

    const messageEvent = publishRealtimeEvent(topic, event, payload || {});

    return NextResponse.json({
      success: true,
      event: messageEvent,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to broadcast event' },
      { status: 500 }
    );
  }
}
