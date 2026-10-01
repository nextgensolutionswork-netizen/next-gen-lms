import crypto from 'crypto';

export interface CreateMeetingParams {
  topic: string;
  sessionDate: string;
  startTime: string; // "HH:MM"
  endTime: string;   // "HH:MM"
  provider: 'Zoom' | 'Google Meet';
  description?: string;
}

export interface GeneratedMeeting {
  meetingId: string;
  meetingLink: string;
  joinUrl: string;
  startUrl?: string;
  password?: string;
  provider: 'Zoom' | 'Google Meet';
  durationMinutes: number;
  isSimulated: boolean;
}

/**
 * Calculates duration in minutes from HH:MM start and end times
 */
export function calculateDurationMinutes(startTime: string, endTime: string): number {
  try {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const startTotal = startH * 60 + startM;
    const endTotal = endH * 60 + endM;
    const diff = endTotal - startTotal;
    return diff > 0 ? diff : 60;
  } catch {
    return 60;
  }
}

/**
 * Integrates with Zoom Server-to-Server OAuth API to generate a meeting
 */
export async function createZoomMeeting(params: {
  topic: string;
  startDateTimeIso: string;
  durationMinutes: number;
}): Promise<GeneratedMeeting> {
  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;

  if (accountId && clientId && clientSecret) {
    try {
      // 1. Obtain Server-to-Server OAuth Token
      const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const tokenRes = await fetch(
        `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${authHeader}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        const accessToken = tokenData.access_token;

        // 2. Create Meeting via Zoom API
        const createRes = await fetch('https://api.zoom.us/v2/users/me/meetings', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            topic: params.topic,
            type: 2, // Scheduled meeting
            start_time: params.startDateTimeIso,
            duration: params.durationMinutes,
            timezone: 'Asia/Kolkata',
            settings: {
              host_video: true,
              participant_video: true,
              join_before_host: true,
              waiting_room: false,
              auto_recording: 'cloud',
              meeting_authentication: false,
            },
          }),
        });

        if (createRes.ok) {
          const meetingData = await createRes.json();
          return {
            meetingId: String(meetingData.id),
            meetingLink: meetingData.join_url,
            joinUrl: meetingData.join_url,
            startUrl: meetingData.start_url,
            password: meetingData.password,
            provider: 'Zoom',
            durationMinutes: params.durationMinutes,
            isSimulated: false,
          };
        } else {
          console.warn('Zoom API meeting creation returned non-200, falling back to simulated generation');
        }
      }
    } catch (err) {
      console.warn('Zoom API connection warning, using simulated Zoom generation:', err);
    }
  }

  // Simulated Zoom Meeting Generation (Dev / Offline / Fallback)
  // Generates 10 or 11-digit meeting ID compliant with Zoom format
  const randomMeetingId = Math.floor(9000000000 + Math.random() * 999999999).toString();
  const password = Math.random().toString(36).slice(2, 8);
  const joinUrl = `https://zoom.us/j/${randomMeetingId}?pwd=${password}`;

  return {
    meetingId: randomMeetingId,
    meetingLink: joinUrl,
    joinUrl,
    password,
    provider: 'Zoom',
    durationMinutes: params.durationMinutes,
    isSimulated: true,
  };
}

/**
 * Integrates with Google Calendar / Google Meet API to generate a video meeting link
 */
export async function createGoogleMeetSession(params: {
  topic: string;
  startDateTimeIso: string;
  endDateTimeIso: string;
  durationMinutes: number;
}): Promise<GeneratedMeeting> {
  const apiKey = process.env.GOOGLE_CALENDAR_API_KEY;
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

  if (apiKey) {
    try {
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            summary: params.topic,
            description: `Live SAP Lecture: ${params.topic}`,
            start: { dateTime: params.startDateTimeIso },
            end: { dateTime: params.endDateTimeIso },
            conferenceData: {
              createRequest: {
                requestId: `req-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
                conferenceSolutionKey: { type: 'hangoutsMeet' },
              },
            },
          }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        const meetUrl = data.conferenceData?.entryPoints?.find(
          (ep: any) => ep.entryPointType === 'video'
        )?.uri;
        const meetingCode = data.conferenceData?.conferenceId || data.id;

        if (meetUrl) {
          return {
            meetingId: meetingCode,
            meetingLink: meetUrl,
            joinUrl: meetUrl,
            provider: 'Google Meet',
            durationMinutes: params.durationMinutes,
            isSimulated: false,
          };
        }
      }
    } catch (err) {
      console.warn('Google Meet API connection warning, using simulated Meet generation:', err);
    }
  }

  // Simulated Google Meet link generation (3-4-3 character format e.g. abc-defg-hij)
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const genPart = (len: number) =>
    Array.from({ length: len }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  const meetCode = `${genPart(3)}-${genPart(4)}-${genPart(3)}`;
  const meetUrl = `https://meet.google.com/${meetCode}`;

  return {
    meetingId: meetCode,
    meetingLink: meetUrl,
    joinUrl: meetUrl,
    provider: 'Google Meet',
    durationMinutes: params.durationMinutes,
    isSimulated: true,
  };
}

/**
 * Unified Automated Conference Session Link Generator
 */
export async function generateConferenceMeeting(params: CreateMeetingParams): Promise<GeneratedMeeting> {
  const durationMinutes = calculateDurationMinutes(params.startTime, params.endTime);
  const startDateTimeIso = `${params.sessionDate}T${params.startTime}:00+05:30`;
  const endDateTimeIso = `${params.sessionDate}T${params.endTime}:00+05:30`;

  if (params.provider === 'Zoom') {
    return createZoomMeeting({
      topic: params.topic,
      startDateTimeIso,
      durationMinutes,
    });
  } else {
    return createGoogleMeetSession({
      topic: params.topic,
      startDateTimeIso,
      endDateTimeIso,
      durationMinutes,
    });
  }
}
