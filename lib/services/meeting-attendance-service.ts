import crypto from 'crypto';
import { store } from './data-store';
import {
  Student,
  AttendanceRecord,
  AttendanceStatus,
  AttendanceSource,
  ClassSession,
  MeetingParticipantLog,
  MeetingAttendanceSyncResult,
} from '@/types';
import { publishRealtimeEvent } from './realtime-service';
import { dispatchMultiChannelNotification } from './notification-service';
import { recordAuditLog } from './audit-service';
import { isLiveSupabaseEnabled, getDb } from '@/lib/supabase/db';

/**
 * Attendance Threshold Configuration (in percentages)
 */
export interface AttendanceThresholdConfig {
  presentThreshold: number; // default: 70% of total meeting duration
  lateThreshold: number;    // default: 40% of total meeting duration
}

export const DEFAULT_ATTENDANCE_THRESHOLDS: AttendanceThresholdConfig = {
  presentThreshold: 70,
  lateThreshold: 40,
};

// ==========================================
// 1. ZOOM WEBHOOK SIGNATURE & CHALLENGE
// ==========================================

/**
 * Verifies Zoom HMAC-SHA256 Webhook signature.
 * Format: v0:{timestamp}:{request_body}
 * Signature header: "v0={hash}" or "{hash}"
 */
export function verifyZoomWebhookSignature(
  rawBody: string,
  timestamp: string,
  signature: string,
  secretToken?: string
): boolean {
  const secret = secretToken || process.env.ZOOM_WEBHOOK_SECRET_TOKEN || 'zoom_webhook_secret_dev';
  if (!signature || !timestamp || !rawBody) {
    return false;
  }

  try {
    const message = `v0:${timestamp}:${rawBody}`;
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(message);
    const expectedHash = hmac.digest('hex');
    const expectedSigWithPrefix = `v0=${expectedHash}`;

    // Support both prefixed "v0=..." and raw hash
    if (signature === expectedSigWithPrefix || signature === expectedHash) {
      return true;
    }

    // Constant-time comparison for timing attack defense
    try {
      const sigClean = signature.startsWith('v0=') ? signature.slice(3) : signature;
      const sigBuf = Buffer.from(sigClean, 'hex');
      const expectedBuf = Buffer.from(expectedHash, 'hex');
      if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        return true;
      }
    } catch {
      // In case invalid hex was passed
    }

    return false;
  } catch (err) {
    console.error('Error verifying Zoom webhook signature:', err);
    return false;
  }
}

/**
 * Generates response for Zoom endpoint.url_validation challenge.
 * Returns { plainToken, encryptedToken } where encryptedToken is HMAC-SHA256(plainToken, secret)
 */
export function handleZoomEndpointValidation(
  plainToken: string,
  secretToken?: string
): { plainToken: string; encryptedToken: string } {
  const secret = secretToken || process.env.ZOOM_WEBHOOK_SECRET_TOKEN || 'zoom_webhook_secret_dev';
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(plainToken);
  const encryptedToken = hmac.digest('hex');

  return {
    plainToken,
    encryptedToken,
  };
}

// ==========================================
// 2. GOOGLE MEET WEBHOOK VERIFICATION
// ==========================================

/**
 * Verifies Google Meet / Google Calendar push webhook token header
 */
export function verifyGoogleMeetWebhook(
  tokenHeader?: string | null,
  secretToken?: string
): boolean {
  const expectedToken = secretToken || process.env.GOOGLE_MEET_WEBHOOK_TOKEN || 'google_meet_secret_token_dev';
  if (!tokenHeader) {
    // If not provided and running without configured secret in dev, allow
    return !process.env.GOOGLE_MEET_WEBHOOK_TOKEN;
  }
  return tokenHeader === expectedToken;
}

// ==========================================
// 3. PARTICIPANT & SESSION RESOLUTION
// ==========================================

/**
 * Match a meeting participant by email or name to an enrolled student
 */
export function matchStudentParticipant(
  email?: string,
  name?: string,
  batchId?: string
): Student | undefined {
  const normalizedEmail = email ? email.trim().toLowerCase() : '';
  const normalizedName = name ? name.trim().toLowerCase() : '';

  // 1. Exact email match in specific batch first if provided
  if (normalizedEmail) {
    if (batchId) {
      const studentInBatch = store.students.find(
        (s) => s.batch_id === batchId && s.email.toLowerCase() === normalizedEmail
      );
      if (studentInBatch) return studentInBatch;
    }

    // 2. Exact email match anywhere in students
    const studentByEmail = store.students.find(
      (s) => s.email.toLowerCase() === normalizedEmail
    );
    if (studentByEmail) return studentByEmail;
  }

  // 3. Name match if email not matched or missing
  if (normalizedName) {
    if (batchId) {
      const studentByNameInBatch = store.students.find(
        (s) =>
          s.batch_id === batchId &&
          (s.full_name.toLowerCase() === normalizedName ||
           normalizedName.includes(s.full_name.toLowerCase()) ||
           s.full_name.toLowerCase().includes(normalizedName))
      );
      if (studentByNameInBatch) return studentByNameInBatch;
    }

    const studentByName = store.students.find(
      (s) =>
        s.full_name.toLowerCase() === normalizedName ||
        normalizedName.includes(s.full_name.toLowerCase()) ||
        s.full_name.toLowerCase().includes(normalizedName)
    );
    if (studentByName) return studentByName;
  }

  return undefined;
}

/**
 * Locates the class session matching the given meeting ID or meeting link
 */
export function findSessionForMeeting(meetingId: string): ClassSession | undefined {
  if (!meetingId) return undefined;
  const cleanId = meetingId.trim().toLowerCase();

  // 1. Direct meeting_id match
  const directMatch = store.classSessions.find(
    (s) => s.meeting_id && s.meeting_id.toLowerCase() === cleanId
  );
  if (directMatch) return directMatch;

  // 2. Meeting link substring match (e.g. meet.google.com/xyz-fico-sap or zoom.us/j/9876543210)
  const linkMatch = store.classSessions.find(
    (s) => s.meeting_link && s.meeting_link.toLowerCase().includes(cleanId)
  );
  if (linkMatch) return linkMatch;

  // 3. Match by today's date if only 1 active online session exists
  const todayStr = new Date().toISOString().slice(0, 10);
  const todaySessions = store.classSessions.filter(
    (s) => s.session_date === todayStr && (s.mode === 'Online' || s.mode === 'Hybrid')
  );
  if (todaySessions.length === 1) {
    return todaySessions[0];
  }

  // Fallback to first session if none directly matched
  return store.classSessions[0];
}

// ==========================================
// 4. DURATION & ATTENDANCE THRESHOLD LOGIC
// ==========================================

/**
 * Calculates AttendanceStatus based on participant duration vs total meeting duration
 */
export function calculateAttendanceStatus(
  durationMinutes: number,
  totalMeetingMinutes: number,
  thresholds: AttendanceThresholdConfig = DEFAULT_ATTENDANCE_THRESHOLDS
): { status: AttendanceStatus; percentage: number } {
  const safeTotal = Math.max(1, totalMeetingMinutes || 60);
  const percentage = Math.min(100, Math.round((durationMinutes / safeTotal) * 100));

  let status: AttendanceStatus = 'Absent';
  if (percentage >= thresholds.presentThreshold) {
    status = 'Present';
  } else if (percentage >= thresholds.lateThreshold) {
    status = 'Late';
  } else {
    status = 'Absent';
  }

  return { status, percentage };
}

/**
 * Logs a participant event (join/leave) and aggregates multi-segment durations
 */
export function recordParticipantMeetingEvent(params: {
  meetingId: string;
  provider: 'Zoom' | 'Google Meet';
  participantEmail: string;
  participantName: string;
  eventType: 'join' | 'leave';
  timestamp?: string;
  durationSeconds?: number;
}): MeetingParticipantLog {
  const now = params.timestamp || new Date().toISOString();
  const normalizedEmail = params.participantEmail.toLowerCase().trim();

  if (params.eventType === 'join') {
    const newLog: MeetingParticipantLog = {
      id: `mpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      meeting_id: params.meetingId,
      provider: params.provider,
      participant_email: normalizedEmail,
      participant_name: params.participantName,
      join_time: now,
      duration_seconds: 0,
      created_at: new Date().toISOString(),
    };
    store.meetingLogs.push(newLog);
    return newLog;
  }

  // Handle 'leave'
  // Look for the most recent open log (without leave_time) for this participant & meeting
  const openLogs = store.meetingLogs.filter(
    (l) =>
      l.meeting_id === params.meetingId &&
      l.participant_email === normalizedEmail &&
      !l.leave_time
  );

  const targetLog = openLogs[openLogs.length - 1];
  let calculatedSeconds = params.durationSeconds || 0;

  if (targetLog) {
    targetLog.leave_time = now;
    if (!calculatedSeconds && targetLog.join_time) {
      const joinMs = new Date(targetLog.join_time).getTime();
      const leaveMs = new Date(now).getTime();
      calculatedSeconds = Math.max(0, Math.round((leaveMs - joinMs) / 1000));
    }
    targetLog.duration_seconds = calculatedSeconds;
    return targetLog;
  } else {
    // If no open join log was recorded (e.g. joined before webhook listener started)
    const fallbackLog: MeetingParticipantLog = {
      id: `mpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      meeting_id: params.meetingId,
      provider: params.provider,
      participant_email: normalizedEmail,
      participant_name: params.participantName,
      join_time: new Date(Date.now() - (calculatedSeconds || 60) * 1000).toISOString(),
      leave_time: now,
      duration_seconds: calculatedSeconds || 60,
      created_at: new Date().toISOString(),
    };
    store.meetingLogs.push(fallbackLog);
    return fallbackLog;
  }
}

/**
 * Aggregates duration across all joined segments for a participant in a meeting
 */
export function getParticipantTotalDurationMinutes(
  meetingId: string,
  participantEmail: string,
  meetingEndTime?: string
): number {
  const normalizedEmail = participantEmail.toLowerCase().trim();
  const logs = store.meetingLogs.filter(
    (l) => l.meeting_id === meetingId && l.participant_email === normalizedEmail
  );

  let totalSeconds = 0;
  for (const log of logs) {
    if (log.duration_seconds && log.duration_seconds > 0) {
      totalSeconds += log.duration_seconds;
    } else if (log.join_time) {
      const endMs = log.leave_time
        ? new Date(log.leave_time).getTime()
        : meetingEndTime
        ? new Date(meetingEndTime).getTime()
        : Date.now();
      const startMs = new Date(log.join_time).getTime();
      totalSeconds += Math.max(0, Math.round((endMs - startMs) / 1000));
    }
  }

  return Math.round(totalSeconds / 60);
}

// ==========================================
// 5. ATOMIC ATTENDANCE PERSISTENCE & ALERTS
// ==========================================

/**
 * Atomically updates a student's attendance percentage across all their session records
 */
export async function recalculateStudentAttendancePercentage(studentId: string): Promise<number> {
  const student = store.students.find((s) => s.id === studentId);
  if (!student) return 0;

  const records = store.attendanceRecords.filter((a) => a.student_id === studentId);
  if (records.length === 0) return student.attendance_percentage;

  const presentOrLateCount = records.filter(
    (a) => a.status === 'Present' || a.status === 'Late'
  ).length;

  const newPercentage = Math.round((presentOrLateCount / records.length) * 100);
  student.attendance_percentage = newPercentage;
  student.updated_at = new Date().toISOString();

  // Sync to live Supabase if enabled
  if (isLiveSupabaseEnabled()) {
    try {
      const db = getDb();
      if (db) {
        await db
          .from('students')
          .update({ attendance_percentage: newPercentage })
          .eq('id', studentId);
      }
    } catch (err) {
      console.warn('Failed to update student attendance_percentage in Supabase:', err);
    }
  }

  return newPercentage;
}

/**
 * Upserts an attendance record for a student from an automated meeting event
 */
export async function recordMeetingAttendanceForStudent(params: {
  sessionId: string;
  studentId: string;
  durationMinutes: number;
  totalMeetingMinutes: number;
  meetingId: string;
  provider: AttendanceSource;
  thresholds?: AttendanceThresholdConfig;
  joinTime?: string;
  leaveTime?: string;
  markerName?: string;
}): Promise<{ record: AttendanceRecord; alertDispatched: boolean }> {
  const session = store.classSessions.find((s) => s.id === params.sessionId);
  const student = store.students.find((s) => s.id === params.studentId);
  if (!session) throw new Error(`ClassSession not found: ${params.sessionId}`);
  if (!student) throw new Error(`Student not found: ${params.studentId}`);

  const { status, percentage } = calculateAttendanceStatus(
    params.durationMinutes,
    params.totalMeetingMinutes,
    params.thresholds
  );

  let existing = store.attendanceRecords.find(
    (a) => a.session_id === params.sessionId && a.student_id === params.studentId
  );

  const notes = `${params.provider} Webhook: Attended ${params.durationMinutes}/${params.totalMeetingMinutes} mins (${percentage}%)`;

  let record: AttendanceRecord;
  if (existing) {
    existing.status = status;
    existing.source = params.provider;
    existing.meeting_id = params.meetingId;
    existing.duration_minutes = params.durationMinutes;
    existing.join_time = params.joinTime || existing.join_time;
    existing.leave_time = params.leaveTime || existing.leave_time;
    existing.notes = notes;
    existing.marked_by = `system-${params.provider.toLowerCase().replace(/\s+/g, '-')}`;
    existing.marked_by_name = params.markerName || `Automated ${params.provider} Gateway`;
    existing.marked_at = new Date().toISOString();
    record = existing;
  } else {
    record = {
      id: `att-${Date.now()}-${params.studentId}`,
      student_id: params.studentId,
      student_name: student.full_name,
      batch_id: session.batch_id,
      session_id: session.id,
      attendance_date: session.session_date,
      status,
      source: params.provider,
      meeting_id: params.meetingId,
      duration_minutes: params.durationMinutes,
      join_time: params.joinTime,
      leave_time: params.leaveTime,
      notes,
      marked_by: `system-${params.provider.toLowerCase().replace(/\s+/g, '-')}`,
      marked_by_name: params.markerName || `Automated ${params.provider} Gateway`,
      marked_at: new Date().toISOString(),
    };
    store.attendanceRecords.push(record);
  }

  // Recalculate student overall percentage
  const updatedOverallAttendance = await recalculateStudentAttendancePercentage(params.studentId);

  // Sync record to Supabase if enabled
  if (isLiveSupabaseEnabled()) {
    try {
      const db = getDb();
      if (db) {
        await db.from('attendance_records').upsert({
          id: record.id,
          student_id: record.student_id,
          session_id: record.session_id,
          batch_id: record.batch_id,
          attendance_date: record.attendance_date,
          status: record.status,
          notes: record.notes,
          marked_by: record.marked_by,
          marked_at: record.marked_at,
        });
      }
    } catch (err) {
      console.warn('Failed to upsert attendance record in Supabase:', err);
    }
  }

  // Publish real-time events
  publishRealtimeEvent('attendance', 'record_updated', {
    ...record,
    overall_percentage: updatedOverallAttendance,
  });
  publishRealtimeEvent(`student:${params.studentId}`, 'attendance_updated', record);

  // Multi-channel notification:
  // If student was Absent or Late, or if overall attendance dropped below 80% (certificate threshold)
  let alertDispatched = false;
  if (status === 'Absent' || status === 'Late' || updatedOverallAttendance < 80) {
    alertDispatched = true;
    const title =
      status === 'Absent'
        ? 'Absence Alert: Live SAP Session Missed'
        : status === 'Late'
        ? 'Late Attendance Recorded: Live SAP Session'
        : 'Warning: Low Attendance Threshold (< 80%)';

    const message =
      status === 'Absent'
        ? `You were marked ABSENT for session "${session.topic}". You attended ${params.durationMinutes} min(s) of ${params.totalMeetingMinutes} min(s). Your current attendance is ${updatedOverallAttendance}%. Minimum 80% attendance is strictly required for SAP Certification eligibility.`
        : `You were marked ${status.toUpperCase()} for session "${session.topic}". Attended ${params.durationMinutes} min(s) of ${params.totalMeetingMinutes} min(s). Your overall attendance is ${updatedOverallAttendance}%.`;

    try {
      await dispatchMultiChannelNotification({
        userId: student.user_id,
        recipientName: student.full_name,
        recipientEmail: student.email,
        recipientPhone: student.phone,
        title,
        message,
        type: status === 'Absent' ? 'error' : 'warning',
        category: 'class',
        actionUrl: '/academics/attendance',
        channels: ['in_app', 'email', 'whatsapp'],
      });
    } catch (err) {
      console.warn('Failed to dispatch multi-channel attendance alert:', err);
    }
  }

  return { record, alertDispatched };
}

// ==========================================
// 6. ZOOM WEBHOOK EVENT PROCESSING
// ==========================================

export interface ZoomWebhookPayload {
  event: string;
  payload: {
    plainToken?: string;
    object?: {
      id?: string | number;
      topic?: string;
      start_time?: string;
      end_time?: string;
      duration?: number; // duration in minutes
      participant?: {
        user_name?: string;
        email?: string;
        user_id?: string;
        id?: string;
        join_time?: string;
        leave_time?: string;
        duration?: number; // in seconds
      };
    };
  };
}

/**
 * Handles incoming Zoom Webhook event
 */
export async function processZoomWebhook(body: ZoomWebhookPayload): Promise<{
  handled: boolean;
  event: string;
  result?: any;
}> {
  const { event, payload } = body;

  // 1. Challenge validation
  if (event === 'endpoint.url_validation' && payload?.plainToken) {
    const challenge = handleZoomEndpointValidation(payload.plainToken);
    return { handled: true, event, result: challenge };
  }

  const meetingObj = payload?.object;
  if (!meetingObj || !meetingObj.id) {
    return { handled: false, event, result: 'No meeting object found' };
  }

  const meetingId = String(meetingObj.id);
  const session = findSessionForMeeting(meetingId);
  const participant = meetingObj.participant;

  if (event === 'meeting.participant_joined' && participant) {
    const log = recordParticipantMeetingEvent({
      meetingId,
      provider: 'Zoom',
      participantEmail: participant.email || '',
      participantName: participant.user_name || 'Zoom Participant',
      eventType: 'join',
      timestamp: participant.join_time,
    });
    return { handled: true, event, result: log };
  }

  if (event === 'meeting.participant_left' && participant) {
    const log = recordParticipantMeetingEvent({
      meetingId,
      provider: 'Zoom',
      participantEmail: participant.email || '',
      participantName: participant.user_name || 'Zoom Participant',
      eventType: 'leave',
      timestamp: participant.leave_time,
      durationSeconds: participant.duration,
    });
    return { handled: true, event, result: log };
  }

  if (event === 'meeting.ended') {
    // When meeting ends, reconcile all participants and batch students
    const totalMinutes = meetingObj.duration || 60;
    const syncResult = await reconcileCompletedMeeting({
      meetingId,
      provider: 'Zoom',
      session,
      totalMeetingMinutes: totalMinutes,
    });
    return { handled: true, event, result: syncResult };
  }

  return { handled: true, event, result: 'Event acknowledged' };
}

// ==========================================
// 7. GOOGLE MEET WEBHOOK EVENT PROCESSING
// ==========================================

export interface GoogleMeetWebhookPayload {
  meeting_id?: string;
  event_type?: 'participant_joined' | 'participant_left' | 'meeting_ended' | 'attendance_report';
  participant?: {
    email?: string;
    display_name?: string;
    join_time?: string;
    leave_time?: string;
    duration_minutes?: number;
  };
  total_meeting_minutes?: number;
  participants?: {
    email: string;
    name?: string;
    duration_minutes?: number;
    durationMinutes?: number;
  }[];
  // Support for Google PubSub wrapper
  message?: {
    data?: string;
    attributes?: Record<string, string>;
  };
}

/**
 * Handles incoming Google Meet webhook / PubSub message
 */
export async function processGoogleMeetWebhook(
  rawPayload: GoogleMeetWebhookPayload
): Promise<{ handled: boolean; event: string; result?: any }> {
  let payload = rawPayload;

  // Decode PubSub base64 data if wrapped
  if (rawPayload.message?.data) {
    try {
      const decoded = Buffer.from(rawPayload.message.data, 'base64').toString('utf-8');
      payload = JSON.parse(decoded);
    } catch (err) {
      console.warn('Failed to parse Google Cloud PubSub message data:', err);
    }
  }

  const meetingId = payload.meeting_id || payload.participant?.email || 'google-meet-live';
  const session = findSessionForMeeting(meetingId);
  const event = payload.event_type || 'attendance_report';

  if (event === 'participant_joined' && payload.participant) {
    const log = recordParticipantMeetingEvent({
      meetingId,
      provider: 'Google Meet',
      participantEmail: payload.participant.email || '',
      participantName: payload.participant.display_name || 'Google Meet Participant',
      eventType: 'join',
      timestamp: payload.participant.join_time,
    });
    return { handled: true, event, result: log };
  }

  if (event === 'participant_left' && payload.participant) {
    const durationSeconds = payload.participant.duration_minutes
      ? payload.participant.duration_minutes * 60
      : undefined;

    const log = recordParticipantMeetingEvent({
      meetingId,
      provider: 'Google Meet',
      participantEmail: payload.participant.email || '',
      participantName: payload.participant.display_name || 'Google Meet Participant',
      eventType: 'leave',
      timestamp: payload.participant.leave_time,
      durationSeconds,
    });
    return { handled: true, event, result: log };
  }

  if (event === 'meeting_ended' || event === 'attendance_report') {
    if (payload.participants && payload.participants.length > 0) {
      // Direct attendance report array provided
      const normalizedParticipants = payload.participants.map((p) => ({
        email: p.email,
        name: p.name,
        durationMinutes: p.durationMinutes !== undefined ? p.durationMinutes : p.duration_minutes || 0,
      }));
      const syncResult = await syncMeetingAttendance({
        meetingId,
        provider: 'Google Meet',
        sessionId: session?.id,
        totalDurationMinutes: payload.total_meeting_minutes || 60,
        participants: normalizedParticipants,
      });
      return { handled: true, event, result: syncResult };
    }

    const syncResult = await reconcileCompletedMeeting({
      meetingId,
      provider: 'Google Meet',
      session,
      totalMeetingMinutes: payload.total_meeting_minutes || 60,
    });
    return { handled: true, event, result: syncResult };
  }

  return { handled: true, event, result: 'Google Meet event processed' };
}

// ==========================================
// 8. COMPLETED MEETING RECONCILIATION & SYNC
// ==========================================

/**
 * Reconciles meeting participant logs against the batch roster for a completed session.
 * Students in the batch who attended have their duration categorized.
 * Students in the batch who did not join are automatically marked Absent.
 */
export async function reconcileCompletedMeeting(params: {
  meetingId: string;
  provider: AttendanceSource;
  session?: ClassSession;
  totalMeetingMinutes: number;
}): Promise<MeetingAttendanceSyncResult> {
  const session = params.session || findSessionForMeeting(params.meetingId);
  const totalMinutes = Math.max(1, params.totalMeetingMinutes || 60);

  if (!session) {
    return {
      session_id: 'unknown',
      meeting_id: params.meetingId,
      provider: params.provider as 'Zoom' | 'Google Meet',
      total_meeting_minutes: totalMinutes,
      synced_records_count: 0,
      records: [],
      alerts_dispatched: 0,
    };
  }

  // Get all students enrolled in this batch
  const batchStudents = store.students.filter((s) => s.batch_id === session.batch_id);
  const records: AttendanceRecord[] = [];
  let alertsCount = 0;

  for (const student of batchStudents) {
    const attendedMinutes = getParticipantTotalDurationMinutes(
      params.meetingId,
      student.email
    );

    const { record, alertDispatched } = await recordMeetingAttendanceForStudent({
      sessionId: session.id,
      studentId: student.id,
      durationMinutes: attendedMinutes,
      totalMeetingMinutes: totalMinutes,
      meetingId: params.meetingId,
      provider: params.provider,
    });

    records.push(record);
    if (alertDispatched) alertsCount++;
  }

  // Mark session as completed
  session.status = 'Completed';

  await recordAuditLog({
    user_id: `system-${params.provider.toLowerCase().replace(/\s+/g, '-')}`,
    user_name: `${params.provider} Automated Gateway`,
    user_role: 'admin',
    action: 'MEETING_ATTENDANCE_SYNCED',
    module: 'ACADEMICS',
    record_id: session.id,
    new_value: {
      meeting_id: params.meetingId,
      provider: params.provider,
      total_minutes: totalMinutes,
      students_processed: batchStudents.length,
      alerts_dispatched: alertsCount,
    },
  });

  return {
    session_id: session.id,
    meeting_id: params.meetingId,
    provider: params.provider as 'Zoom' | 'Google Meet',
    total_meeting_minutes: totalMinutes,
    synced_records_count: records.length,
    records,
    alerts_dispatched: alertsCount,
  };
}

/**
 * Synchronizes attendance from an external meeting report or manual trigger
 */
export async function syncMeetingAttendance(params: {
  meetingId: string;
  provider: 'Zoom' | 'Google Meet';
  sessionId?: string;
  totalDurationMinutes?: number;
  participants?: {
    email: string;
    name?: string;
    durationMinutes: number;
  }[];
}): Promise<MeetingAttendanceSyncResult> {
  const session = params.sessionId
    ? store.classSessions.find((s) => s.id === params.sessionId)
    : findSessionForMeeting(params.meetingId);

  const totalMinutes = Math.max(1, params.totalDurationMinutes || 60);

  if (!session) {
    throw new Error(`Unable to locate ClassSession for meeting ID: ${params.meetingId}`);
  }

  const batchStudents = store.students.filter((s) => s.batch_id === session.batch_id);
  const records: AttendanceRecord[] = [];
  let alertsCount = 0;

  // Map participant durations from input
  const participantMap = new Map<string, number>();
  if (params.participants) {
    for (const p of params.participants) {
      if (p.email) {
        participantMap.set(p.email.toLowerCase().trim(), p.durationMinutes);
      }
    }
  }

  for (const student of batchStudents) {
    let attendedMinutes = participantMap.get(student.email.toLowerCase().trim());
    if (attendedMinutes === undefined) {
      // Fallback to internal logs if not passed explicitly
      attendedMinutes = getParticipantTotalDurationMinutes(params.meetingId, student.email);
    }

    const { record, alertDispatched } = await recordMeetingAttendanceForStudent({
      sessionId: session.id,
      studentId: student.id,
      durationMinutes: attendedMinutes,
      totalMeetingMinutes: totalMinutes,
      meetingId: params.meetingId,
      provider: params.provider,
    });

    records.push(record);
    if (alertDispatched) alertsCount++;
  }

  session.status = 'Completed';

  return {
    session_id: session.id,
    meeting_id: params.meetingId,
    provider: params.provider,
    total_meeting_minutes: totalMinutes,
    synced_records_count: records.length,
    records,
    alerts_dispatched: alertsCount,
  };
}

/**
 * Returns meeting participant logs
 */
export async function getMeetingLogs(meetingId?: string): Promise<MeetingParticipantLog[]> {
  if (meetingId) {
    return store.meetingLogs.filter((l) => l.meeting_id === meetingId);
  }
  return [...store.meetingLogs];
}
