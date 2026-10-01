import { NextRequest, NextResponse } from 'next/server';
import { generateConferenceMeeting } from '@/lib/services/conference-service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { topic, sessionDate, startTime, endTime, provider, description } = body;

    if (!topic || !sessionDate || !startTime || !endTime) {
      return NextResponse.json(
        { error: 'topic, sessionDate, startTime, and endTime are required' },
        { status: 400 }
      );
    }

    const meetingProvider = provider === 'Zoom' ? 'Zoom' : 'Google Meet';

    const result = await generateConferenceMeeting({
      topic,
      sessionDate,
      startTime,
      endTime,
      provider: meetingProvider,
      description,
    });

    return NextResponse.json({
      success: true,
      meeting: result,
    });
  } catch (error: any) {
    console.error('Error generating conference meeting:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate conference meeting link' },
      { status: 500 }
    );
  }
}
