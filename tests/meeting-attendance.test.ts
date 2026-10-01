import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import {
  verifyZoomWebhookSignature,
  handleZoomEndpointValidation,
  verifyGoogleMeetWebhook,
  matchStudentParticipant,
  findSessionForMeeting,
  calculateAttendanceStatus,
  recordParticipantMeetingEvent,
  getParticipantTotalDurationMinutes,
  recalculateStudentAttendancePercentage,
  recordMeetingAttendanceForStudent,
  reconcileCompletedMeeting,
  syncMeetingAttendance,
  processZoomWebhook,
  processGoogleMeetWebhook,
  getMeetingLogs,
} from '@/lib/services/meeting-attendance-service';
import { store } from '@/lib/services/data-store';
import { verifyAndGenerateCertificate } from '@/lib/services/certificate-service';
import { POST as zoomWebhookRoute } from '@/app/api/webhooks/zoom/route';
import { POST as googleMeetWebhookRoute } from '@/app/api/webhooks/google-meet/route';
import { POST as syncMeetingPostRoute, GET as syncMeetingGetRoute } from '@/app/api/attendance/sync-meeting/route';

describe('11. Zoom / Google Meet Automated Webhook Attendance Tracking Tests', () => {
  const zoomSecret = 'test_zoom_webhook_secret_998877';
  const googleToken = 'test_google_channel_token_112233';

  beforeEach(() => {
    // Reset test state
    store.meetingLogs = [];

    // Ensure test students and class sessions exist
    const student1 = store.students[0];
    if (student1) {
      student1.attendance_percentage = 90;
    }

    const session1 = store.classSessions[0];
    if (session1) {
      session1.meeting_id = 'xyz-fico-sap';
      session1.meeting_provider = 'Google Meet';
      session1.status = 'Scheduled';
    }
  });

  // ==========================================
  // 1. ZOOM SIGNATURE & CHALLENGE TESTS
  // ==========================================
  describe('Zoom Signature Verification & URL Challenge', () => {
    it('verifies genuine Zoom webhook signature with v0= prefix', () => {
      const rawBody = JSON.stringify({ event: 'meeting.participant_joined', payload: {} });
      const timestamp = String(Date.now());
      const message = `v0:${timestamp}:${rawBody}`;
      const hash = crypto.createHmac('sha256', zoomSecret).update(message).digest('hex');
      const signature = `v0=${hash}`;

      const isValid = verifyZoomWebhookSignature(rawBody, timestamp, signature, zoomSecret);
      expect(isValid).toBe(true);
    });

    it('verifies genuine Zoom webhook signature without v0= prefix', () => {
      const rawBody = JSON.stringify({ event: 'meeting.participant_left', payload: {} });
      const timestamp = String(Date.now());
      const message = `v0:${timestamp}:${rawBody}`;
      const hash = crypto.createHmac('sha256', zoomSecret).update(message).digest('hex');

      const isValid = verifyZoomWebhookSignature(rawBody, timestamp, hash, zoomSecret);
      expect(isValid).toBe(true);
    });

    it('rejects forged or tampered Zoom webhook signature', () => {
      const rawBody = JSON.stringify({ event: 'meeting.participant_joined', payload: {} });
      const timestamp = String(Date.now());
      const fakeSignature = 'v0=badbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadb';

      const isValid = verifyZoomWebhookSignature(rawBody, timestamp, fakeSignature, zoomSecret);
      expect(isValid).toBe(false);
    });

    it('rejects signature if timestamp was altered', () => {
      const rawBody = JSON.stringify({ event: 'meeting.participant_joined', payload: {} });
      const validTimestamp = String(Date.now());
      const alteredTimestamp = String(Date.now() + 10000);
      const message = `v0:${validTimestamp}:${rawBody}`;
      const hash = crypto.createHmac('sha256', zoomSecret).update(message).digest('hex');

      const isValid = verifyZoomWebhookSignature(rawBody, alteredTimestamp, `v0=${hash}`, zoomSecret);
      expect(isValid).toBe(false);
    });

    it('correctly computes Zoom endpoint.url_validation challenge', () => {
      const plainToken = 'zoom_challenge_token_abc123';
      const expectedEncryptedToken = crypto
        .createHmac('sha256', zoomSecret)
        .update(plainToken)
        .digest('hex');

      const response = handleZoomEndpointValidation(plainToken, zoomSecret);
      expect(response.plainToken).toBe(plainToken);
      expect(response.encryptedToken).toBe(expectedEncryptedToken);
    });
  });

  // ==========================================
  // 2. GOOGLE MEET WEBHOOK TESTS
  // ==========================================
  describe('Google Meet Token Verification', () => {
    it('verifies valid Google Meet channel token', () => {
      const isValid = verifyGoogleMeetWebhook(googleToken, googleToken);
      expect(isValid).toBe(true);
    });

    it('rejects invalid Google Meet channel token', () => {
      const isValid = verifyGoogleMeetWebhook('wrong_token', googleToken);
      expect(isValid).toBe(false);
    });
  });

  // ==========================================
  // 3. PARTICIPANT RESOLUTION TESTS
  // ==========================================
  describe('Student Participant Matching', () => {
    it('matches student by exact lowercase email', () => {
      const student = store.students[0];
      const matched = matchStudentParticipant(student.email.toUpperCase());
      expect(matched).toBeDefined();
      expect(matched?.id).toBe(student.id);
    });

    it('matches student within a specific batch roster', () => {
      const student = store.students[0];
      const matched = matchStudentParticipant(student.email, undefined, student.batch_id);
      expect(matched).toBeDefined();
      expect(matched?.id).toBe(student.id);
    });

    it('matches student by full name when email is missing or masked', () => {
      const student = store.students[0];
      const matched = matchStudentParticipant(undefined, student.full_name);
      expect(matched).toBeDefined();
      expect(matched?.id).toBe(student.id);
    });

    it('returns undefined for non-existent participant', () => {
      const matched = matchStudentParticipant('unknown.user@otherdomain.com', 'Unknown User');
      expect(matched).toBeUndefined();
    });
  });

  // ==========================================
  // 4. DURATION & MULTI-SEGMENT AGGREGATION
  // ==========================================
  describe('Multi-segment Duration Tracking & Aggregation', () => {
    it('records participant join and leave events', () => {
      const meetingId = 'meet-test-101';
      const email = 'amit.gupta@student.next-gen.com';
      const name = 'Amit Gupta';

      const joinTime = new Date('2026-03-02T08:00:00Z').toISOString();
      const leaveTime = new Date('2026-03-02T08:45:00Z').toISOString();

      recordParticipantMeetingEvent({
        meetingId,
        provider: 'Zoom',
        participantEmail: email,
        participantName: name,
        eventType: 'join',
        timestamp: joinTime,
      });

      expect(store.meetingLogs.length).toBe(1);
      expect(store.meetingLogs[0].leave_time).toBeUndefined();

      recordParticipantMeetingEvent({
        meetingId,
        provider: 'Zoom',
        participantEmail: email,
        participantName: name,
        eventType: 'leave',
        timestamp: leaveTime,
        durationSeconds: 2700, // 45 mins
      });

      expect(store.meetingLogs[0].leave_time).toBe(leaveTime);
      expect(store.meetingLogs[0].duration_seconds).toBe(2700);
    });

    it('aggregates multiple disconnection and reconnection segments', () => {
      const meetingId = 'meet-test-segments';
      const email = 'amit.gupta@student.next-gen.com';

      // Segment 1: 30 minutes
      recordParticipantMeetingEvent({
        meetingId,
        provider: 'Google Meet',
        participantEmail: email,
        participantName: 'Amit Gupta',
        eventType: 'join',
        timestamp: '2026-03-02T08:00:00Z',
      });
      recordParticipantMeetingEvent({
        meetingId,
        provider: 'Google Meet',
        participantEmail: email,
        participantName: 'Amit Gupta',
        eventType: 'leave',
        timestamp: '2026-03-02T08:30:00Z',
        durationSeconds: 1800,
      });

      // Segment 2: 40 minutes (after network reconnect)
      recordParticipantMeetingEvent({
        meetingId,
        provider: 'Google Meet',
        participantEmail: email,
        participantName: 'Amit Gupta',
        eventType: 'join',
        timestamp: '2026-03-02T08:35:00Z',
      });
      recordParticipantMeetingEvent({
        meetingId,
        provider: 'Google Meet',
        participantEmail: email,
        participantName: 'Amit Gupta',
        eventType: 'leave',
        timestamp: '2026-03-02T09:15:00Z',
        durationSeconds: 2400,
      });

      const totalMinutes = getParticipantTotalDurationMinutes(meetingId, email);
      // 1800s + 2400s = 4200s = 70 mins
      expect(totalMinutes).toBe(70);
    });
  });

  // ==========================================
  // 5. ATTENDANCE THRESHOLD CATEGORIZATION
  // ==========================================
  describe('Attendance Threshold Calculations', () => {
    it('marks student Present when attended >= 70% of meeting duration', () => {
      // 60 min meeting, attended 45 mins (75%)
      const { status, percentage } = calculateAttendanceStatus(45, 60);
      expect(percentage).toBe(75);
      expect(status).toBe('Present');
    });

    it('marks student Late when attended between 40% and 69% of meeting duration', () => {
      // 60 min meeting, attended 30 mins (50%)
      const { status, percentage } = calculateAttendanceStatus(30, 60);
      expect(percentage).toBe(50);
      expect(status).toBe('Late');
    });

    it('marks student Absent when attended < 40% of meeting duration', () => {
      // 60 min meeting, attended 15 mins (25%)
      const { status, percentage } = calculateAttendanceStatus(15, 60);
      expect(percentage).toBe(25);
      expect(status).toBe('Absent');
    });

    it('marks student Absent when duration is 0', () => {
      const { status, percentage } = calculateAttendanceStatus(0, 60);
      expect(percentage).toBe(0);
      expect(status).toBe('Absent');
    });
  });

  // ==========================================
  // 6. ATOMIC RECALCULATION & CERTIFICATE ELIGIBILITY
  // ==========================================
  describe('Atomic Recalculation & Certificate Impact', () => {
    it('recalculates student attendance percentage atomically', async () => {
      const student = store.students[0];
      const session = store.classSessions[0];

      // Mark an attendance record
      await recordMeetingAttendanceForStudent({
        sessionId: session.id,
        studentId: student.id,
        durationMinutes: 55,
        totalMeetingMinutes: 60,
        meetingId: 'xyz-fico-sap',
        provider: 'Google Meet',
      });

      const updatedPercentage = await recalculateStudentAttendancePercentage(student.id);
      expect(typeof updatedPercentage).toBe('number');
      expect(student.attendance_percentage).toBe(updatedPercentage);
    });

    it('dispatches alert and updates certificate eligibility when student is absent', async () => {
      const student = store.students[0];
      const session = store.classSessions[0];

      // Student attended only 5 mins of 60 mins -> Absent
      const { record, alertDispatched } = await recordMeetingAttendanceForStudent({
        sessionId: session.id,
        studentId: student.id,
        durationMinutes: 5,
        totalMeetingMinutes: 60,
        meetingId: 'xyz-fico-sap',
        provider: 'Google Meet',
      });

      expect(record.status).toBe('Absent');
      expect(alertDispatched).toBe(true);

      // Check certificate eligibility: if attendance percentage falls below 80%, certificate must be blocked
      const student2 = store.students[1];
      student2.attendance_percentage = 72; // simulated low attendance
      store.certificates = store.certificates.filter(
        (c) => !(c.student_id === student2.id && c.course_id === student2.course_id)
      );
      const eligibility = await verifyAndGenerateCertificate(student2.id, student2.course_id, 'usr-admin');
      expect(eligibility.eligible).toBe(false);
      expect(eligibility.reasons.some((r) => r.includes('minimum 80% required'))).toBe(true);
    });
  });

  // ==========================================
  // 7. COMPLETED MEETING RECONCILIATION
  // ==========================================
  describe('Completed Meeting Webhook Reconciliation', () => {
    it('reconciles meeting and marks enrolled students absent if they never joined', async () => {
      const session = store.classSessions[0];
      session.meeting_id = 'test-reconcile-meet';

      // Only student[0] attended
      const student1 = store.students.find((s) => s.batch_id === session.batch_id);
      if (student1) {
        recordParticipantMeetingEvent({
          meetingId: 'test-reconcile-meet',
          provider: 'Zoom',
          participantEmail: student1.email,
          participantName: student1.full_name,
          eventType: 'join',
          timestamp: '2026-03-02T08:00:00Z',
        });
        recordParticipantMeetingEvent({
          meetingId: 'test-reconcile-meet',
          provider: 'Zoom',
          participantEmail: student1.email,
          participantName: student1.full_name,
          eventType: 'leave',
          timestamp: '2026-03-02T09:00:00Z',
          durationSeconds: 3600, // 60 mins
        });
      }

      const syncResult = await reconcileCompletedMeeting({
        meetingId: 'test-reconcile-meet',
        provider: 'Zoom',
        session,
        totalMeetingMinutes: 60,
      });

      expect(syncResult.synced_records_count).toBeGreaterThan(0);
      expect(session.status).toBe('Completed');

      // The student who attended should be Present
      const student1Record = syncResult.records.find((r) => r.student_id === student1?.id);
      expect(student1Record?.status).toBe('Present');
      expect(student1Record?.source).toBe('Zoom');
    });

    it('syncs meeting attendance from external participant array', async () => {
      const session = store.classSessions[0];
      const student1 = store.students.find((s) => s.batch_id === session.batch_id) || store.students[0];
      student1.batch_id = session.batch_id;

      const syncResult = await syncMeetingAttendance({
        meetingId: session.meeting_id || 'xyz-fico-sap',
        provider: 'Google Meet',
        sessionId: session.id,
        totalDurationMinutes: 60,
        participants: [
          {
            email: student1.email,
            name: student1.full_name,
            durationMinutes: 52, // 52/60 = 86% -> Present
          },
        ],
      });

      expect(syncResult.synced_records_count).toBeGreaterThan(0);
      const studentRecord = syncResult.records.find((r) => r.student_id === student1.id);
      expect(studentRecord?.status).toBe('Present');
      expect(studentRecord?.duration_minutes).toBe(52);
    });
  });

  // ==========================================
  // 8. API ROUTE HANDLERS
  // ==========================================
  describe('Webhook & Sync API Route Handlers', () => {
    it('handles Zoom endpoint.url_validation challenge via POST /api/webhooks/zoom', async () => {
      const body = {
        event: 'endpoint.url_validation',
        payload: {
          plainToken: 'zoom_token_xyz999',
        },
      };

      const req = new NextRequest('http://localhost:3000/api/webhooks/zoom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const res = await zoomWebhookRoute(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.plainToken).toBe('zoom_token_xyz999');
      expect(json.encryptedToken).toBeDefined();
    });

    it('processes Zoom meeting.participant_joined event via route', async () => {
      const session = store.classSessions[0];
      const meetingId = session.meeting_id || '9876543210';

      const payload = {
        event: 'meeting.participant_joined',
        payload: {
          object: {
            id: meetingId,
            topic: 'SAP FICO Live Class',
            participant: {
              email: 'amit.gupta@student.next-gen.com',
              user_name: 'Amit Gupta',
              join_time: new Date().toISOString(),
            },
          },
        },
      };

      const rawBody = JSON.stringify(payload);
      const timestamp = String(Date.now());
      const hash = crypto
        .createHmac('sha256', process.env.ZOOM_WEBHOOK_SECRET_TOKEN || 'zoom_webhook_secret_dev')
        .update(`v0:${timestamp}:${rawBody}`)
        .digest('hex');

      const req = new NextRequest('http://localhost:3000/api/webhooks/zoom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-zm-request-timestamp': timestamp,
          'x-zm-signature': `v0=${hash}`,
        },
        body: rawBody,
      });

      const res = await zoomWebhookRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.event).toBe('meeting.participant_joined');
    });

    it('rejects Zoom webhook with invalid signature when secret is enforced', async () => {
      const rawBody = JSON.stringify({ event: 'meeting.participant_joined', payload: { object: { id: '123' } } });
      const req = new NextRequest('http://localhost:3000/api/webhooks/zoom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-zm-request-timestamp': '1234567890',
          'x-zm-signature': 'v0=bad_signature_hash',
        },
        body: rawBody,
      });

      const res = await zoomWebhookRoute(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain('Invalid Zoom webhook signature');
    });

    it('handles Google Meet push handshake sync state via POST /api/webhooks/google-meet', async () => {
      const req = new NextRequest('http://localhost:3000/api/webhooks/google-meet', {
        method: 'POST',
        headers: {
          'x-goog-resource-state': 'sync',
        },
      });

      const res = await googleMeetWebhookRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('synced');
    });

    it('processes Google Meet participant event via route', async () => {
      const session = store.classSessions[0];
      const payload = {
        meeting_id: session.meeting_id || 'xyz-fico-sap',
        event_type: 'participant_joined',
        participant: {
          email: 'amit.gupta@student.next-gen.com',
          display_name: 'Amit Gupta',
          join_time: new Date().toISOString(),
        },
      };

      const req = new NextRequest('http://localhost:3000/api/webhooks/google-meet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await googleMeetWebhookRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('handles manual sync POST /api/attendance/sync-meeting and GET logs', async () => {
      const session = store.classSessions[0];
      const student1 = store.students[0];

      // POST to sync
      const postReq = new NextRequest('http://localhost:3000/api/attendance/sync-meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: session.meeting_id || 'xyz-fico-sap',
          provider: 'Google Meet',
          totalDurationMinutes: 60,
          participants: [
            {
              email: student1.email,
              name: student1.full_name,
              durationMinutes: 48,
            },
          ],
        }),
      });

      const postRes = await syncMeetingPostRoute(postReq);
      expect(postRes.status).toBe(200);
      const postJson = await postRes.json();
      expect(postJson.success).toBe(true);
      expect(postJson.data.synced_records_count).toBeGreaterThan(0);

      // GET meeting logs
      const getReq = new NextRequest('http://localhost:3000/api/attendance/sync-meeting');
      const getRes = await syncMeetingGetRoute(getReq);
      expect(getRes.status).toBe(200);
      const getJson = await getRes.json();
      expect(getJson.success).toBe(true);
      expect(Array.isArray(getJson.logs)).toBe(true);
    });
  });
});
