import { NextRequest, NextResponse } from 'next/server';
import { publishRealtimeEvent } from '@/lib/services/realtime-service';
import { authenticateApiRequest } from '@/lib/auth/server-session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    // 1. Session authentication: Restrict arbitrary broadcasting to authorized staff
    const auth = await authenticateApiRequest(request, {
      allowedRoles: [
        'super_admin',
        'admin',
        'trainer',
        'counsellor',
        'accountant',
        'placement_coordinator',
        'support',
        'onboarding_team',
      ],
    });
    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const body = await request.json();
    const { topic, event, payload } = body;

    if (!topic || !event) {
      return NextResponse.json(
        { success: false, error: 'topic and event are required parameters' },
        { status: 400 }
      );
    }

    // Disallow broadcasting to unauthorized sensitive system channels unless admin
    if (topic.startsWith('system:') || topic.startsWith('audit:')) {
      if (!['super_admin', 'admin'].includes(auth.user.role)) {
        return NextResponse.json(
          { success: false, error: 'Forbidden: Administrative privileges required for system channel broadcasts.' },
          { status: 403 }
        );
      }
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
