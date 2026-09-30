import { NextRequest, NextResponse } from 'next/server';
import {
  syncMeetingAttendance,
  getMeetingLogs,
} from '@/lib/services/meeting-attendance-service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { meetingId, provider, sessionId, totalDurationMinutes, participants } = body;

    if (!meetingId || !provider) {
      return NextResponse.json(
        { error: 'Missing required fields: meetingId and provider are mandatory' },
        { status: 400 }
      );
    }

    if (provider !== 'Zoom' && provider !== 'Google Meet') {
      return NextResponse.json(
        { error: 'Invalid provider. Must be "Zoom" or "Google Meet"' },
        { status: 400 }
      );
    }

    const result = await syncMeetingAttendance({
      meetingId,
      provider,
      sessionId,
      totalDurationMinutes,
      participants,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Meeting attendance sync error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to sync meeting attendance' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const meetingId = searchParams.get('meetingId') || undefined;

    const logs = await getMeetingLogs(meetingId);

    return NextResponse.json({
      success: true,
      count: logs.length,
      logs,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to retrieve meeting logs' },
      { status: 500 }
    );
  }
}
