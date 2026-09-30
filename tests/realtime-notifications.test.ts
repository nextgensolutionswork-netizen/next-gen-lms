import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  realtimeHub,
  publishRealtimeEvent,
  subscribeRealtimeTopic,
} from '@/lib/services/realtime-service';
import {
  sendResendEmail,
  sendWhatsAppMessage,
  normalizePhoneNumber,
  buildReceiptEmailHtml,
  buildDoubtReplyEmailHtml,
  buildCertificateEmailHtml,
  dispatchMultiChannelNotification,
  getNotificationsForUser,
  markNotificationAsRead,
} from '@/lib/services/notification-service';
import {
  createStudentDoubt,
  replyToDoubt,
  resolveDoubt,
} from '@/lib/services/doubt-service';
import { store } from '@/lib/services/data-store';
import { NextRequest } from 'next/server';
import { POST as broadcastRouteHandler } from '@/app/api/realtime/broadcast/route';

describe('Realtime PubSub & Multi-Channel Notification Service', () => {
  beforeEach(() => {
    realtimeHub.reset();
  });

  describe('1. Realtime PubSub Event Bus', () => {
    it('publishes and receives events on a specific topic', () => {
      const receivedEvents: any[] = [];
      const unsubscribe = subscribeRealtimeTopic('doubts', (event) => {
        receivedEvents.push(event);
      });

      const published = publishRealtimeEvent('doubts', 'doubt_created', { ticketId: 'dbt-101' });

      expect(receivedEvents.length).toBe(1);
      expect(receivedEvents[0].id).toBe(published.id);
      expect(receivedEvents[0].topic).toBe('doubts');
      expect(receivedEvents[0].event).toBe('doubt_created');
      expect(receivedEvents[0].payload.ticketId).toBe('dbt-101');

      unsubscribe();
    });

    it('wildcard topic (*) receives broadcasts across all topics', () => {
      const allEvents: any[] = [];
      const unsub = subscribeRealtimeTopic('*', (e) => allEvents.push(e));

      publishRealtimeEvent('doubts', 'doubt_created', { id: 1 });
      publishRealtimeEvent('payments', 'payment_captured', { id: 2 });
      publishRealtimeEvent('notifications:usr-01', 'notification_received', { id: 3 });

      expect(allEvents.length).toBe(3);
      expect(allEvents[0].topic).toBe('doubts');
      expect(allEvents[1].topic).toBe('payments');
      expect(allEvents[2].topic).toBe('notifications:usr-01');

      unsub();
    });

    it('unsubscribing removes the listener cleanly', () => {
      const events: any[] = [];
      const unsub = subscribeRealtimeTopic('chat', (e) => events.push(e));

      publishRealtimeEvent('chat', 'msg', { text: 'hello' });
      expect(events.length).toBe(1);

      unsub();
      publishRealtimeEvent('chat', 'msg', { text: 'ignored' });
      expect(events.length).toBe(1);
    });

    it('correctly reports subscriber counts', () => {
      expect(realtimeHub.getSubscriberCount('doubts')).toBe(0);

      const unsub1 = subscribeRealtimeTopic('doubts', () => {});
      const unsub2 = subscribeRealtimeTopic('doubts', () => {});
      const unsub3 = subscribeRealtimeTopic('notifications', () => {});

      expect(realtimeHub.getSubscriberCount('doubts')).toBe(2);
      expect(realtimeHub.getSubscriberCount('notifications')).toBe(1);
      expect(realtimeHub.getSubscriberCount()).toBe(3);

      unsub1();
      expect(realtimeHub.getSubscriberCount('doubts')).toBe(1);

      unsub2();
      unsub3();
      expect(realtimeHub.getSubscriberCount()).toBe(0);
    });
  });

  describe('2. Resend Email Integration', () => {
    it('simulates transactional email delivery when RESEND_API_KEY is not configured', async () => {
      const res = await sendResendEmail({
        to: 'student@example.com',
        subject: 'Official Fee Receipt - REC-2026-0042',
        html: '<p>Thank you for your fee payment.</p>',
      });

      expect(res.success).toBe(true);
      expect(res.simulated).toBe(true);
      expect(res.id).toBeDefined();
    });

    it('renders clean HTML templates for payment receipts', () => {
      const html = buildReceiptEmailHtml({
        studentName: 'Amit Gupta',
        receiptNumber: 'REC-2026-0042',
        amount: 25000,
        remainingBalance: 15000,
        courseName: 'SAP S/4HANA Finance (FICO)',
        pdfUrl: 'https://example.com/receipt.pdf',
      });

      expect(html).toContain('Amit Gupta');
      expect(html).toContain('REC-2026-0042');
      expect(html).toContain('₹25,000');
      expect(html).toContain('https://example.com/receipt.pdf');
    });

    it('renders clean HTML templates for mentor doubt replies', () => {
      const html = buildDoubtReplyEmailHtml({
        studentName: 'Priya Sharma',
        ticketNumber: 'DBT-2026-001',
        doubtTitle: 'Error in T-Code FB50 during GL Posting',
        mentorName: 'Ananya Deshmukh',
        replyMessage: 'Please verify document type SA in OBA7.',
        portalUrl: 'https://example.com/portal',
      });

      expect(html).toContain('Priya Sharma');
      expect(html).toContain('DBT-2026-001');
      expect(html).toContain('Ananya Deshmukh');
      expect(html).toContain('Please verify document type SA');
    });

    it('renders clean HTML templates for course completion certificates', () => {
      const html = buildCertificateEmailHtml({
        studentName: 'Rohan Verma',
        courseName: 'SAP MM Materials Management',
        certificateId: 'CERT-2026-MM-0012',
        grade: 'A+ (Distinction)',
        verificationUrl: 'https://example.com/verify',
        pdfUrl: 'https://example.com/cert.pdf',
      });

      expect(html).toContain('Rohan Verma');
      expect(html).toContain('CERT-2026-MM-0012');
      expect(html).toContain('A+ (Distinction)');
      expect(html).toContain('https://example.com/cert.pdf');
    });
  });

  describe('3. WhatsApp Business / Cloud API Integration', () => {
    it('normalizes 10-digit Indian numbers with country prefix 91', () => {
      expect(normalizePhoneNumber('9876543210')).toBe('919876543210');
      expect(normalizePhoneNumber('+91 98765-43210')).toBe('919876543210');
      expect(normalizePhoneNumber('919876543210')).toBe('919876543210');
    });

    it('simulates WhatsApp message delivery gracefully when credentials are not configured', async () => {
      const res = await sendWhatsAppMessage({
        to: '+91 98765 43210',
        text: 'Your SAP lab access credentials have been renewed.',
      });

      expect(res.success).toBe(true);
      expect(res.simulated).toBe(true);
      expect(res.id).toBeDefined();
    });
  });

  describe('4. Unified Multi-Channel Dispatcher', () => {
    it('creates in-app notification, publishes to realtime stream, and invokes channels', async () => {
      const capturedRealtime: any[] = [];
      const unsub = subscribeRealtimeTopic('notifications:usr-test-01', (e) =>
        capturedRealtime.push(e)
      );

      const result = await dispatchMultiChannelNotification({
        userId: 'usr-test-01',
        recipientName: 'Amit Gupta',
        recipientEmail: 'amit.gupta@example.com',
        recipientPhone: '+91 98765 43210',
        title: 'Fee Payment Received',
        message: 'Your payment of ₹25,000 has been credited.',
        category: 'payment',
        type: 'success',
        channels: ['in_app', 'email', 'whatsapp'],
        actionUrl: '/accounts/receipts/rec-01',
      });

      expect(result.notification).toBeDefined();
      expect(result.notification.user_id).toBe('usr-test-01');
      expect(result.notification.is_read).toBe(false);

      // Verify real-time broadcast happened
      expect(capturedRealtime.length).toBe(1);
      expect(capturedRealtime[0].event).toBe('notification_received');
      expect(capturedRealtime[0].payload.title).toBe('Fee Payment Received');

      // Verify email & whatsapp channels were dispatched
      expect(result.emailResult?.success).toBe(true);
      expect(result.whatsAppResult?.success).toBe(true);

      // Verify presence in store
      const userNotifs = await getNotificationsForUser('usr-test-01');
      expect(userNotifs.length).toBeGreaterThanOrEqual(1);

      // Verify mark as read
      await markNotificationAsRead(result.notification.id);
      expect(result.notification.is_read).toBe(true);

      unsub();
    });
  });

  describe('5. Realtime Doubt Ticket Workflow Integration', () => {
    it('publishes doubt_created and broadcasts to doubts topic on ticket creation', async () => {
      const student = store.students[0];
      const receivedEvents: any[] = [];
      const unsub = subscribeRealtimeTopic('doubts', (e) => receivedEvents.push(e));

      const doubt = await createStudentDoubt(
        {
          student_id: student.id,
          title: 'Realtime WebSocket Integration Test Query',
          description: 'Testing live event broadcasting on doubt tickets',
          category: 'SAP Configuration',
        },
        student.user_id
      );

      expect(doubt).toBeDefined();
      const createEvent = receivedEvents.find((e) => e.event === 'doubt_created');
      expect(createEvent).toBeDefined();
      expect(createEvent.payload.id).toBe(doubt.id);

      unsub();
    });

    it('publishes doubt_reply to both doubts and doubt:id topic on reply', async () => {
      const doubt = store.doubts[0];
      const receivedThreadEvents: any[] = [];
      const unsubThread = subscribeRealtimeTopic(`doubt:${doubt.id}`, (e) =>
        receivedThreadEvents.push(e)
      );

      const msg = await replyToDoubt(
        doubt.id,
        'Mentor live response via WebSocket / SSE stream',
        'usr-support-01',
        'support',
        'Ananya Deshmukh'
      );

      expect(msg).toBeDefined();
      expect(receivedThreadEvents.length).toBe(1);
      expect(receivedThreadEvents[0].event).toBe('doubt_reply');
      expect(receivedThreadEvents[0].payload.message.message).toContain('Mentor live response');

      unsubThread();
    });

    it('publishes doubt_resolved to real-time subscribers on ticket resolution', async () => {
      const doubt = store.doubts[0];
      const receivedEvents: any[] = [];
      const unsub = subscribeRealtimeTopic(`doubt:${doubt.id}`, (e) =>
        receivedEvents.push(e)
      );

      await resolveDoubt(doubt.id, 'usr-support-01', 'Verified and solved.');

      expect(receivedEvents.length).toBe(1);
      expect(receivedEvents[0].event).toBe('doubt_resolved');
      expect(receivedEvents[0].payload.status).toBe('Resolved');

      unsub();
    });
  });

  describe('6. Realtime Broadcast API Route Handler', () => {
    it('accepts broadcast payload and returns 200 with published event', async () => {
      const events: any[] = [];
      const unsub = subscribeRealtimeTopic('academics', (e) => events.push(e));

      const req = new NextRequest('http://localhost:3000/api/realtime/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: 'academics',
          event: 'class_starting',
          payload: { sessionId: 'sess-01', trainer: 'Vikram Joshi' },
        }),
      });

      const res = await broadcastRouteHandler(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.event.topic).toBe('academics');
      expect(data.event.event).toBe('class_starting');

      expect(events.length).toBe(1);
      expect(events[0].payload.sessionId).toBe('sess-01');

      unsub();
    });

    it('returns 400 when topic or event is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/realtime/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: 'academics' }), // missing event
      });

      const res = await broadcastRouteHandler(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('required');
    });
  });
});
