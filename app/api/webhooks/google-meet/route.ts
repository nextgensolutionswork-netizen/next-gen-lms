import { NextRequest, NextResponse } from 'next/server';
import {
  verifyGoogleMeetWebhook,
  processGoogleMeetWebhook,
} from '@/lib/services/meeting-attendance-service';

export async function POST(req: NextRequest) {
  try {
    const resourceState = req.headers.get('x-goog-resource-state');
    const channelToken = req.headers.get('x-goog-channel-token');

    // Google Calendar / Meet push sync challenge handshake
    if (resourceState === 'sync') {
      return NextResponse.json({ status: 'synced', message: 'Channel active' }, { status: 200 });
    }

    // Verify token header if configured
    const isValid = verifyGoogleMeetWebhook(channelToken);
    if (!isValid) {
      return NextResponse.json({ error: 'Unauthorized Google Meet webhook token' }, { status: 401 });
    }

    const body = await req.json();
    const result = await processGoogleMeetWebhook(body);

    return NextResponse.json({
      success: true,
      event: result.event,
      result: result.result,
    });
  } catch (error: any) {
    console.error('Google Meet webhook error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error processing Google Meet webhook' },
      { status: 500 }
    );
  }
}
