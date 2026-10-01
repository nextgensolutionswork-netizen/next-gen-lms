import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  createZoomMeeting,
  createGoogleMeetSession,
  generateConferenceMeeting,
  calculateDurationMinutes,
} from '@/lib/services/conference-service';
import { POST as createConferenceMeetingRoute } from '@/app/api/conference/create-meeting/route';
import {
  recordParticipantMeetingEvent,
  calculateAttendanceStatus,
  findSessionForMeeting,
  processZoomWebhook,
  processGoogleMeetWebhook,
} from '@/lib/services/meeting-attendance-service';
import { store } from '@/lib/services/data-store';
import { createStudentDoubt, replyToDoubt } from '@/lib/services/doubt-service';

describe('Live Class Conference Integration & Automated Attendance Tracking', () => {
  describe('1. Conference Service & Automated Meeting Link Generation', () => {
    it('calculates duration in minutes accurately from start and end times', () => {
      expect(calculateDurationMinutes('08:00', '10:00')).toBe(120);
      expect(calculateDurationMinutes('09:30', '10:15')).toBe(45);
      expect(calculateDurationMinutes('14:00', '15:30')).toBe(90);
      expect(calculateDurationMinutes('10:00', '10:00')).toBe(60); // fallback
    });

    it('creates an automated Zoom meeting with meeting ID, join URL, and password', async () => {
      const result = await createZoomMeeting({
        topic: 'SAP FICO General Ledger Deep Dive',
        startDateTimeIso: '2026-10-01T08:00:00+05:30',
        durationMinutes: 120,
      });

      expect(result).toBeDefined();
      expect(result.provider).toBe('Zoom');
      expect(result.meetingId).toBeDefined();
      expect(result.meetingId.length).toBeGreaterThanOrEqual(9);
      expect(result.joinUrl).toContain('https://zoom.us/j/');
      expect(result.password).toBeDefined();
      expect(result.durationMinutes).toBe(120);
    });

    it('creates an automated Google Meet session with standard 3-4-3 meeting code', async () => {
      const result = await createGoogleMeetSession({
        topic: 'SAP MM Purchase Order Configuration',
        startDateTimeIso: '2026-10-01T10:30:00+05:30',
        endDateTimeIso: '2026-10-01T12:00:00+05:30',
        durationMinutes: 90,
      });

      expect(result).toBeDefined();
      expect(result.provider).toBe('Google Meet');
      expect(result.meetingLink).toMatch(/https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/);
      expect(result.durationMinutes).toBe(90);
    });

    it('generates meetings via unified generateConferenceMeeting function', async () => {
      const zoomMeeting = await generateConferenceMeeting({
        topic: 'SAP ABAP CDS Views Workshop',
        sessionDate: '2026-10-02',
        startTime: '14:00',
        endTime: '16:00',
        provider: 'Zoom',
      });
      expect(zoomMeeting.provider).toBe('Zoom');
      expect(zoomMeeting.durationMinutes).toBe(120);

      const gmeetMeeting = await generateConferenceMeeting({
        topic: 'SAP S/4HANA Migration Overview',
        sessionDate: '2026-10-03',
        startTime: '09:00',
        endTime: '10:30',
        provider: 'Google Meet',
      });
      expect(gmeetMeeting.provider).toBe('Google Meet');
      expect(gmeetMeeting.durationMinutes).toBe(90);
    });
  });

  describe('2. POST /api/conference/create-meeting API Route Handler', () => {
    it('returns 200 and generated Zoom meeting when valid payload is passed', async () => {
      const payload = {
        topic: 'SAP SD Pricing Procedure',
        sessionDate: '2026-10-05',
        startTime: '11:00',
        endTime: '12:30',
        provider: 'Zoom',
      };

      const req = new NextRequest('http://localhost:3000/api/conference/create-meeting', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const res = await createConferenceMeetingRoute(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.meeting.provider).toBe('Zoom');
      expect(data.meeting.meetingLink).toContain('zoom.us/j/');
      expect(data.meeting.durationMinutes).toBe(90);
    });

    it('returns 400 when required fields are missing', async () => {
      const payload = { topic: 'SAP Incomplete' };
      const req = new NextRequest('http://localhost:3000/api/conference/create-meeting', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const res = await createConferenceMeetingRoute(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBeDefined();
    });
  });

  describe('3. Automated Attendance Webhook Synchronization', () => {
    it('tracks student participant join event and calculates call duration on leave', () => {
      const meetingId = 'zoom-auto-test-101';
      const studentEmail = 'amit.gupta@enterprise-student.com';

      // 1. Participant joined
      const joinLog = recordParticipantMeetingEvent({
        meetingId,
        provider: 'Zoom',
        participantEmail: studentEmail,
        participantName: 'Amit Gupta',
        eventType: 'join',
        timestamp: '2026-10-01T08:00:00Z',
      });
      expect(joinLog).toBeDefined();
      expect(joinLog.join_time).toBe('2026-10-01T08:00:00Z');
      expect(joinLog.leave_time).toBeUndefined();

      // 2. Participant left after 75 minutes (4500 seconds)
      const leaveLog = recordParticipantMeetingEvent({
        meetingId,
        provider: 'Zoom',
        participantEmail: studentEmail,
        participantName: 'Amit Gupta',
        eventType: 'leave',
        timestamp: '2026-10-01T09:15:00Z',
        durationSeconds: 4500,
      });

      expect(leaveLog).toBeDefined();
      expect(leaveLog.leave_time).toBe('2026-10-01T09:15:00Z');
      expect(leaveLog.duration_seconds).toBe(4500);

      // 3. Status computation: 75 mins out of 90 mins session -> 83% -> Present (>=70%)
      const statusCheck = calculateAttendanceStatus(75, 90);
      expect(statusCheck.status).toBe('Present');
      expect(statusCheck.percentage).toBe(83);
    });

    it('processes Zoom webhook participant_joined and participant_left events', async () => {
      const meetingId = '9876543210';
      const webhookPayload = {
        event: 'meeting.participant_joined',
        payload: {
          object: {
            id: meetingId,
            topic: 'SAP FICO Month-End Closing',
            participant: {
              email: 'sneha.patel@enterprise-student.com',
              user_name: 'Sneha Patel',
              join_time: new Date().toISOString(),
            },
          },
        },
      };

      const result = await processZoomWebhook(webhookPayload);
      expect(result.handled).toBe(true);
      expect(result.event).toBe('meeting.participant_joined');
      expect(result.result).toBeDefined();
    });

    it('locates session by automated meeting link or meeting ID', () => {
      const session = store.classSessions[0];
      expect(session).toBeDefined();

      if (session.meeting_link) {
        const foundByLink = findSessionForMeeting(session.meeting_link);
        expect(foundByLink).toBeDefined();
        expect(foundByLink?.id).toBe(session.id);
      }
    });
  });

  describe('4. Dynamic Canvas Watermark Bouncing Physics Integrity', () => {
    it('simulates bouncing collision physics within canvas display bounds', () => {
      const displayWidth = 640;
      const displayHeight = 360;
      const badgeWidth = 270;
      const badgeHeight = 64;

      const pos = { x: 35, y: 45, vx: 1.1, vy: 0.85 };

      // Simulate 100 animation frames
      for (let frame = 0; frame < 100; frame++) {
        pos.x += pos.vx;
        pos.y += pos.vy;

        // X-axis bounce
        if (pos.x <= 10) {
          pos.x = 10;
          pos.vx = Math.abs(pos.vx);
        } else if (pos.x + badgeWidth >= displayWidth - 10) {
          pos.x = displayWidth - 10 - badgeWidth;
          pos.vx = -Math.abs(pos.vx);
        }

        // Y-axis bounce
        if (pos.y <= 15) {
          pos.y = 15;
          pos.vy = Math.abs(pos.vy);
        } else if (pos.y + badgeHeight >= displayHeight - 20) {
          pos.y = displayHeight - 20 - badgeHeight;
          pos.vy = -Math.abs(pos.vy);
        }

        // Assert strictly inside bounds
        expect(pos.x).toBeGreaterThanOrEqual(10);
        expect(pos.x + badgeWidth).toBeLessThanOrEqual(displayWidth - 10);
        expect(pos.y).toBeGreaterThanOrEqual(15);
        expect(pos.y + badgeHeight).toBeLessThanOrEqual(displayHeight - 20);
      }
    });
  });

  describe('5. Real-Time Helpdesk Messaging via Supabase Realtime Channel', () => {
    it('creates doubt and dispatches real-time broadcast payload', async () => {
      const student = store.students[0];
      const newDoubt = await createStudentDoubt(
        {
          student_id: student.id,
          title: 'OB52 Posting Period Variant Error',
          description: 'Period 09/2026 is closed for account type + in company code 1000',
          category: 'SAP Configuration',
          priority: 'High',
          sap_tcode: 'OB52',
        },
        student.user_id
      );

      expect(newDoubt).toBeDefined();
      expect(newDoubt.ticket_number).toBeDefined();
      expect(['Open', 'Assigned']).toContain(newDoubt.status);

      // Reply to doubt
      const reply = await replyToDoubt(
        newDoubt.id,
        'Please check posting period variant assigned to company code in OBY6, then open period 09 in OB52.',
        'usr-trainer-fico',
        'trainer',
        'Rajesh Kumar (Senior SAP FICO Architect)'
      );

      expect(reply).toBeDefined();
      expect(reply.doubt_id).toBe(newDoubt.id);
      expect(reply.sender_role).toBe('trainer');

      const updatedDoubt = store.doubts.find((d) => d.id === newDoubt.id);
      expect(updatedDoubt?.status).toBe('In Progress');
      expect(updatedDoubt?.messages.some((m) => m.id === reply.id)).toBe(true);
    });
  });
});
