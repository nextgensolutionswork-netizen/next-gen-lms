import {
  NotificationItem,
  NotificationChannel,
  MultiChannelDispatchPayload,
} from '@/types';
import { store } from './data-store';
import { publishRealtimeEvent } from './realtime-service';
import { isLiveSupabaseEnabled, getDb } from '@/lib/supabase/db';

/**
 * Resend Email Delivery Engine
 */
export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export async function sendResendEmail(options: SendEmailOptions): Promise<{
  success: boolean;
  id?: string;
  simulated?: boolean;
  error?: string;
}> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail =
    options.from ||
    process.env.RESEND_FROM_EMAIL ||
    'Next-Gen ERP LMS <notifications@lms.next-generpsolutions.com>';

  const toList = Array.isArray(options.to) ? options.to : [options.to];

  if (!apiKey) {
    console.log(
      `[Resend Email Mock] (To: ${toList.join(', ')} | Subject: "${options.subject}")`
    );
    return {
      success: true,
      id: `sim_resend_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      simulated: true,
    };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: toList,
        subject: options.subject,
        html: options.html,
        text: options.text,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.warn('Resend API returned non-200:', data);
      return { success: false, error: data.message || 'Resend API error' };
    }

    return { success: true, id: data.id, simulated: false };
  } catch (err: any) {
    console.error('Error invoking Resend API:', err);
    return { success: false, error: err.message || 'Network error reaching Resend' };
  }
}

/**
 * WhatsApp Business / Cloud API Delivery Engine
 */
export interface SendWhatsAppOptions {
  to: string;
  text: string;
  templateName?: string;
  templateParameters?: Record<string, string>;
}

export function normalizePhoneNumber(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, '');
  // Default to India country code 91 if 10 digits provided
  if (digits.length === 10) {
    return `91${digits}`;
  }
  return digits;
}

export async function sendWhatsAppMessage(options: SendWhatsAppOptions): Promise<{
  success: boolean;
  id?: string;
  simulated?: boolean;
  error?: string;
}> {
  const token = process.env.WHATSAPP_API_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const normalizedTo = normalizePhoneNumber(options.to);

  if (!token || !phoneNumberId) {
    console.log(
      `[WhatsApp Cloud Mock] (To: ${normalizedTo} | Message: "${options.text.slice(0, 100)}...")`
    );
    return {
      success: true,
      id: `sim_wa_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      simulated: true,
    };
  }

  try {
    const payload = options.templateName
      ? {
          messaging_product: 'whatsapp',
          to: normalizedTo,
          type: 'template',
          template: {
            name: options.templateName,
            language: { code: 'en' },
          },
        }
      : {
          messaging_product: 'whatsapp',
          to: normalizedTo,
          type: 'text',
          text: { body: options.text },
        };

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    const data = await res.json();
    if (!res.ok) {
      console.warn('WhatsApp API error:', data);
      return { success: false, error: data.error?.message || 'WhatsApp API error' };
    }

    const messageId = data.messages?.[0]?.id || `wa_${Date.now()}`;
    return { success: true, id: messageId, simulated: false };
  } catch (err: any) {
    console.error('Error sending WhatsApp message:', err);
    return { success: false, error: err.message || 'WhatsApp network error' };
  }
}

/**
 * HTML Templates for Resend Transactional Emails
 */
export function buildReceiptEmailHtml(data: {
  studentName: string;
  receiptNumber: string;
  amount: number;
  remainingBalance: number;
  courseName: string;
  pdfUrl: string;
}): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
      <div style="background-color: #0A6ED1; padding: 24px; text-align: center; color: #ffffff;">
        <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: 0.5px;">NEXT-GEN ERP SOLUTIONS</h1>
        <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">Official Payment Receipt Confirmation</p>
      </div>
      <div style="padding: 24px; color: #1e293b; line-height: 1.6;">
        <p style="font-size: 16px; margin-top: 0;">Dear <strong>${data.studentName}</strong>,</p>
        <p style="font-size: 14px; color: #475569;">
          We have successfully received and credited your tuition fee payment of <strong style="color: #059669;">₹${data.amount.toLocaleString('en-IN')}</strong> for <strong>${data.courseName}</strong>.
        </p>
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 13px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #64748b;">Receipt Number:</span>
            <strong style="font-family: monospace; color: #0f172a;">${data.receiptNumber}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #64748b;">Amount Paid:</span>
            <strong style="color: #059669;">₹${data.amount.toLocaleString('en-IN')}</strong>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #64748b;">Remaining Fee Balance:</span>
            <strong style="color: #b45309;">₹${data.remainingBalance.toLocaleString('en-IN')}</strong>
          </div>
        </div>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${data.pdfUrl}" style="background-color: #0A6ED1; color: #ffffff; padding: 12px 28px; font-size: 14px; font-weight: 700; text-decoration: none; border-radius: 6px; display: inline-block;">
            Download Official PDF Receipt
          </a>
        </div>
        <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-bottom: 0;">
          This receipt is computer generated and valid with digital audit timestamp.
        </p>
      </div>
    </div>
  `;
}

export function buildDoubtReplyEmailHtml(data: {
  studentName: string;
  ticketNumber: string;
  doubtTitle: string;
  mentorName: string;
  replyMessage: string;
  portalUrl: string;
}): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
      <div style="background-color: #0F172A; padding: 24px; text-align: center; color: #ffffff;">
        <h1 style="margin: 0; font-size: 20px; font-weight: 800;">Academic Mentor Support Desk</h1>
        <p style="margin: 4px 0 0; font-size: 13px; color: #94a3b8;">New Mentor Reply on Ticket #${data.ticketNumber}</p>
      </div>
      <div style="padding: 24px; color: #1e293b; line-height: 1.6;">
        <p style="font-size: 15px; margin-top: 0;">Hello <strong>${data.studentName}</strong>,</p>
        <p style="font-size: 14px; color: #475569;">
          Your mentor <strong>${data.mentorName}</strong> has posted a response to your academic doubt: <em>"${data.doubtTitle}"</em>.
        </p>
        <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; border-radius: 4px; padding: 16px; margin: 20px 0; font-size: 13px; color: #14532d;">
          <p style="margin: 0; font-weight: 600; font-size: 11px; text-transform: uppercase; color: #15803d;">Mentor Reply:</p>
          <p style="margin: 8px 0 0; white-space: pre-wrap;">${data.replyMessage}</p>
        </div>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${data.portalUrl}" style="background-color: #0A6ED1; color: #ffffff; padding: 12px 28px; font-size: 14px; font-weight: 700; text-decoration: none; border-radius: 6px; display: inline-block;">
            Open Live Helpdesk & Reply
          </a>
        </div>
      </div>
    </div>
  `;
}

export function buildCertificateEmailHtml(data: {
  studentName: string;
  courseName: string;
  certificateId: string;
  grade: string;
  verificationUrl: string;
  pdfUrl: string;
}): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
      <div style="background-color: #D97706; padding: 24px; text-align: center; color: #ffffff;">
        <h1 style="margin: 0; font-size: 22px; font-weight: 800;">Congratulations on Your Graduation!</h1>
        <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.95;">Official SAP Course Completion Certificate Issued</p>
      </div>
      <div style="padding: 24px; color: #1e293b; line-height: 1.6;">
        <p style="font-size: 16px; margin-top: 0;">Dear <strong>${data.studentName}</strong>,</p>
        <p style="font-size: 14px; color: #475569;">
          Congratulations! You have fulfilled all curriculum benchmarks and hands-on lab evaluations for <strong>${data.courseName}</strong> with grade <strong>${data.grade}</strong>.
        </p>
        <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 13px;">
          <p style="margin: 0 0 6px;">Certificate ID: <strong style="font-family: monospace;">${data.certificateId}</strong></p>
          <p style="margin: 0;">Online Verification: <a href="${data.verificationUrl}" style="color: #0A6ED1;">${data.verificationUrl}</a></p>
        </div>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${data.pdfUrl}" style="background-color: #D97706; color: #ffffff; padding: 12px 28px; font-size: 14px; font-weight: 700; text-decoration: none; border-radius: 6px; display: inline-block;">
            Download Verified PDF Certificate
          </a>
        </div>
      </div>
    </div>
  `;
}

/**
 * Unified Multi-Channel Dispatcher
 * Sends in-app notification, triggers real-time SSE/WebSocket broadcast,
 * and delivers Resend emails & WhatsApp messages where channels are requested.
 */
export async function dispatchMultiChannelNotification(
  payload: MultiChannelDispatchPayload
): Promise<{
  notification: NotificationItem;
  realtimeEvent: any;
  emailResult?: { success: boolean; id?: string; simulated?: boolean; error?: string };
  whatsAppResult?: { success: boolean; id?: string; simulated?: boolean; error?: string };
}> {
  const channels = payload.channels || ['in_app', 'email', 'whatsapp'];

  // 1. Create In-App Notification Item
  const notification: NotificationItem = {
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    user_id: payload.userId,
    title: payload.title,
    message: payload.message,
    type: payload.type || 'info',
    category: payload.category,
    is_read: false,
    action_url: payload.actionUrl,
    created_at: new Date().toISOString(),
  };

  store.notifications.unshift(notification);

  // If live Supabase enabled, record in db
  if (isLiveSupabaseEnabled()) {
    try {
      const client = getDb();
      if (client) {
        await client.from('notifications').insert({
          id: notification.id,
          user_id: notification.user_id,
          title: notification.title,
          message: notification.message,
          type: notification.type,
          category: notification.category,
          is_read: false,
          action_url: notification.action_url,
          created_at: notification.created_at,
        });
      }
    } catch (err) {
      console.warn('Supabase notification insert error, saved locally:', err);
    }
  }

  // 2. Broadcast via Realtime Service (SSE / WebSocket)
  // Broadcast to personal user channel and global notification channel
  const realtimeEvent = publishRealtimeEvent(
    `notifications:${payload.userId}`,
    'notification_received',
    notification
  );
  publishRealtimeEvent('notifications', 'notification_created', notification);

  // 3. Email Dispatch via Resend
  let emailResult: { success: boolean; id?: string; simulated?: boolean; error?: string } | undefined;
  if (channels.includes('email') && payload.recipientEmail) {
    let emailHtml = `<div style="font-family: sans-serif; padding: 16px;"><h2>${payload.title}</h2><p>${payload.message}</p></div>`;

    if (payload.metadata?.htmlTemplate) {
      emailHtml = payload.metadata.htmlTemplate;
    }

    emailResult = await sendResendEmail({
      to: payload.recipientEmail,
      subject: payload.title,
      html: emailHtml,
      text: payload.message,
    });
  }

  // 4. WhatsApp Dispatch
  let whatsAppResult: { success: boolean; id?: string; simulated?: boolean; error?: string } | undefined;
  if (channels.includes('whatsapp') && payload.recipientPhone) {
    const waText = `*${payload.title}*\n\n${payload.message}${
      payload.actionUrl ? `\n\nView details: ${payload.actionUrl}` : ''
    }\n\n_Next-Gen ERP LMS_`;

    whatsAppResult = await sendWhatsAppMessage({
      to: payload.recipientPhone,
      text: waText,
    });
  }

  return {
    notification,
    realtimeEvent,
    emailResult,
    whatsAppResult,
  };
}

/**
 * Fetch notifications for a specific user ID
 */
export async function getNotificationsForUser(userId: string): Promise<NotificationItem[]> {
  return store.notifications.filter((n) => n.user_id === userId);
}

/**
 * Mark a notification as read
 */
export async function markNotificationAsRead(notificationId: string): Promise<boolean> {
  const notif = store.notifications.find((n) => n.id === notificationId);
  if (!notif) return false;
  notif.is_read = true;
  return true;
}
